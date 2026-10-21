# -*- coding: utf-8 -*-
"""
codex-sheets.py — Convierte las hojas de Codex (assets-codex/*.png) en kits animados del juego.

Cada hoja mide 1536×1024: 6 columnas × 4 filas = 24 poses de 256×256, fondo oscuro con degradado
(sin transparencia) y el personaje mirando a la derecha. Por cada personaje:

  1. Quita el fondo: relleno desde las líneas de la cuadrícula por píxeles "suaves" (el fondo es un
     degradado; el personaje tiene contorno oscuro definido), huecos encerrados con color de fondo y
     limpieza del halo del borde.
  2. Ajustes por código (protagonista y madre: cabeza más chica, cuerpo más largo, color más sobrio;
     Don Ernesto: más monstruoso).
  3. Escala TODA la hoja con el mismo factor (vecino más cercano sobre el color suavizado 3×3) para que
     las poses de pie midan la altura objetivo; alinea cada pose por los pies (pivote abajo al centro).
  4. Cuantiza a ≤32 colores por variante (sin tramado) y repone un contorno de 1 px donde se perdió.
  5. Exporta public/assets/sprites/personajes/<id>/<id>_spritesheet.png + .json (formato del kit +
     "animaciones", "escala" y, si aplica, "variants").

La Bruja Guajolote en forma de ave no tiene hoja: se dibuja aquí por código (dibujar_ave) con la
paleta de bruja.png.

Salidas de revisión (no las carga el juego): arte-fuente/codex/revision/<id>.png y arte-fuente/codex/MAPEO.md.

Uso:  python -I tools/codex-sheets.py            (todos)
      python -I tools/codex-sheets.py balam maria (solo esos ids)
Requiere Pillow y numpy.
"""
import json
import math
import os
import shutil
import sys
import time

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-codex')
OUT = os.path.join(ROOT, 'public', 'assets', 'sprites', 'personajes')
REV = os.path.join(ROOT, 'arte-fuente', 'codex', 'revision')
PREV = os.path.join(ROOT, 'arte-fuente', 'kits-previos')
GEN = 'tools/codex-sheets.py'

COLS, ROWS, CELL = 6, 4, 256
N = COLS * ROWS

# ----------------------------------------------------------------------------------------------
# Mapeo de poses (índice de celda 0..23, fila por fila). La disposición es la misma en casi todas
# las hojas: fila 1 reposo×2 + caminar×4 · fila 2 correr×4 + preparar/atacar · fila 3 guardia,
# conjuro, lanzar×2, salto, caída · fila 4 agacharse, esquivar, golpe bajo, daño, derrota, caído.
# ----------------------------------------------------------------------------------------------
POSES = [
    'reposo_1', 'reposo_2', 'caminar_1', 'caminar_2', 'caminar_3', 'caminar_4',
    'correr_1', 'correr_2', 'correr_3', 'correr_4', 'preparar', 'atacar',
    'guardia', 'conjuro', 'lanzar_1', 'lanzar_2', 'salto', 'caida',
    'agacharse', 'esquivar', 'golpe_bajo', 'dano', 'derrota', 'caido',
]


def A(frames, fps=1, loop=False):
    return {'frames': list(frames), 'fps': fps, 'loop': loop}


DEFAULT_ANIMS = {
    'reposo': A([0, 1], 2.5, True),
    'caminar': A([2, 3, 4, 5], 8, True),
    'correr': A([6, 7, 8, 9], 11, True),
    'golpe': A([10]),
    'ataque': A([10, 11], 9),
    'disparar': A([11]),
    'conjuro': A([13, 14], 4, True),
    'invocar': A([12, 13], 3, True),
    'lanzar': A([14, 15], 9),
    'salto': A([16]),
    'subida': A([16]),
    'caida': A([17]),
    'aterrizar': A([18]),
    'esquivar': A([19]),
    'interactuar': A([18]),
    'dano': A([21]),
    'aturdido': A([22]),
    'agotado': A([22]),
    'purificar': A([22]),
    'morir': A([21, 23], 5),
}

# Cambios por personaje sobre DEFAULT_ANIMS.
ANIM_OVERRIDES = {
    'protagonista': {
        'disparar': A([10]),
        'caida': A([16]),        # la celda 17 es "salir despedido": la caída normal reutiliza el salto
        'conjuro': A([13, 14], 4, True),
        'interactuar': A([18]),
    },
    'madre': {'caida': A([16])},
    'cabeza_olmeca': {
        # La hoja de la Cabeza son expresiones, no cuerpo: ver MAPEO.md
        'reposo': A([5, 13], 1.2, True),
        'caminar': A([6, 7, 8, 9], 5, True),
        'correr': A([6, 7, 8, 9], 7, True),
        'golpe': A([14]),
        'ataque': A([10, 11], 6),
        'disparar': A([11]),
        'conjuro': A([10, 11], 4, True),
        'invocar': A([12, 14], 3, True),
        'lanzar': A([11]),
        'salto': A([16]), 'subida': A([16]), 'caida': A([18]), 'aterrizar': A([18]),
        'esquivar': A([6]), 'interactuar': A([5]),
        'dano': A([15]),
        'aturdido': A([17, 22], 2, True),
        'agotado': A([22]),
        'purificar': A([22, 20], 1.5, True),
        'morir': A([15, 21], 3),
    },
    'balam': {'aturdido': A([21]), 'agotado': A([22]), 'purificar': A([22]), 'morir': A([23])},
    'balam_jaguar': {'aturdido': A([21]), 'morir': A([23])},
}

# ----------------------------------------------------------------------------------------------
# Personajes: id del kit → hojas (variante, archivo), altura objetivo de las poses de pie (px), tipo.
# Tamaño por importancia (contratos de la versión extendida).
# ----------------------------------------------------------------------------------------------
KITS = {
    'protagonista': dict(hojas=[(None, 'protagonista')], alto=72, tipo='humanoide', ajuste='prota'),
    'madre': dict(hojas=[(None, 'madre')], alto=70, tipo='humanoide', ajuste='prota'),
    'chaneque': dict(hojas=[(None, 'chaneque')], alto=56, tipo='criatura'),
    'chaneque_mayor': dict(hojas=[(None, 'chaneque-mayor')], alto=100, tipo='criatura'),
    'encapuchado': dict(hojas=[('rojo', 'miembro-cofradia-rojo'), ('negro', 'miembro-cofradia-negro'),
                               ('elite', 'miembro-cofradia-rojo-negro')], alto=74, tipo='humanoide'),
    'espiritu': dict(hojas=[('hombre', 'espiritu-hombre'), ('mujer', 'espiritu-mujer')], alto=72, tipo='humanoide'),
    'cabeza_olmeca': dict(hojas=[(None, 'cabeza-olmeca')], alto=120, tipo='criatura'),
    'balam': dict(hojas=[(None, 'balam')], alto=40, tipo='criatura'),
    'balam_jaguar': dict(hojas=[(None, 'balam-jaguar')], alto=60, tipo='criatura'),
    'maria': dict(hojas=[(None, 'maria')], alto=70, tipo='humanoide'),
    'bestia': dict(hojas=[('1', 'bestia-1'), ('3', 'bestia-3')], alto=76, tipo='criatura'),
    'bruja_guajolote': dict(hojas=[(None, 'bruja')], alto=105, tipo='humanoide'),
    'bruja_guajolote_ave': dict(hojas=[], alto=105, tipo='criatura', ajuste='ave'),
    'muneca': dict(hojas=[('1', 'muneca-poseida-1'), ('2', 'muneca-poseida-2'), ('3', 'muneca-poseida-3'),
                          ('4', 'muneca-poseida-4')], alto=54, tipo='humanoide'),
    'nahual': dict(hojas=[(None, 'nahual-humano')], alto=74, tipo='humanoide'),
    # Forma animal del nahual: el hombre-lobo (nahual.png) y la criatura de cráneo de ave (bestia-2.png,
    # que el equipo pidió usar como nahual): dos variantes para dar variedad.
    'nahual_animal': dict(hojas=[('lobo', 'nahual'), ('ave', 'bestia-2')], alto=84, tipo='criatura'),
    'nahuala': dict(hojas=[(None, 'nahuala')], alto=100, tipo='humanoide'),
    'rey_olvido': dict(hojas=[(None, 'rey-del-olvido')], alto=118, tipo='humanoide'),
    'llorona': dict(hojas=[(None, 'llorona')], alto=76, tipo='humanoide'),
    'tzitzimitl': dict(hojas=[(None, 'tzitzimime')], alto=105, tipo='humanoide'),
    'itzpapalotl': dict(hojas=[(None, 'itzpapalotl')], alto=140, tipo='humanoide'),
    'momia': dict(hojas=[(None, 'momia')], alto=72, tipo='humanoide'),
    'vampiro': dict(hojas=[(None, 'vampiro')], alto=100, tipo='humanoide'),
    'don_ernesto': dict(hojas=[(None, 'don-ernesto')], alto=105, tipo='humanoide', ajuste='ernesto'),
}

MAX_COLORS = 32
SMOOTH_T = 3.0     # salto máximo de color entre vecinos (tras suavizar 3×3) para considerarlo fondo


# ============================================ utilidades ============================================

def box(a, r):
    """Desenfoque de caja (2r+1)² con sumas acumuladas (bordes replicados)."""
    if r <= 0:
        return a.astype(np.float32)
    extra = ((0, 0),) * (a.ndim - 2)
    p = np.pad(a.astype(np.float64), ((r + 1, r), (0, 0)) + extra, mode='edge')
    c = np.cumsum(p, axis=0)
    a = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
    p = np.pad(a, ((0, 0), (r + 1, r)) + extra, mode='edge')
    c = np.cumsum(p, axis=1)
    return ((c[:, 2 * r + 1:] - c[:, :-2 * r - 1]) / (2 * r + 1)).astype(np.float32)


def grow(seed, allowed):
    """Relleno geodésico (4 vecinos) de `seed` dentro de `allowed`."""
    m = seed & allowed
    while True:
        n = m.copy()
        n[1:] |= m[:-1]
        n[:-1] |= m[1:]
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        n &= allowed
        if np.array_equal(n, m):
            return m
        m = n


def dilate(m, it=1, diag=False):
    for _ in range(it):
        n = m.copy()
        n[1:] |= m[:-1]
        n[:-1] |= m[1:]
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        if diag:
            n[1:, 1:] |= m[:-1, :-1]
            n[:-1, :-1] |= m[1:, 1:]
            n[1:, :-1] |= m[:-1, 1:]
            n[:-1, 1:] |= m[1:, :-1]
        m = n
    return m


def components(mask):
    """Etiqueta componentes conexos (8 vecinos). Devuelve (etiquetas, tamaños). Para imágenes chicas."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    sizes = [0]
    cur = 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        cur += 1
        lab[y0, x0] = cur
        st = [(y0, x0)]
        n = 0
        while st:
            y, x = st.pop()
            n += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                        lab[yy, xx] = cur
                        st.append((yy, xx))
        sizes.append(n)
    return lab, sizes


def lum(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


# ========================================= quitar el fondo =========================================

def remove_background(rgb):
    """rgb float32 (H, W, 3) → máscara del personaje (bool)."""
    H, W, _ = rgb.shape
    sm = box(rgb, 1)
    d = np.zeros((H, W), np.float32)
    dy = np.abs(np.diff(sm, axis=0)).max(-1)
    dx = np.abs(np.diff(sm, axis=1)).max(-1)
    d[1:] = np.maximum(d[1:], dy)
    d[:-1] = np.maximum(d[:-1], dy)
    d[:, 1:] = np.maximum(d[:, 1:], dx)
    d[:, :-1] = np.maximum(d[:, :-1], dx)
    smooth = d < SMOOTH_T

    seed = np.zeros((H, W), bool)
    for x in range(0, W + 1, CELL):
        seed[:, max(0, x - 2):x + 2] = True
    for y in range(0, H + 1, CELL):
        seed[max(0, y - 2):y + 2, :] = True
    bg = grow(seed, smooth)

    # Modelo del fondo (convolución normalizada de los píxeles de fondo) para huecos y halo.
    wsum = box(bg.astype(np.float32), 12)
    bmod = box(rgb * bg[..., None], 12) / np.maximum(wsum, 1e-3)[..., None]
    dist = np.sqrt(((rgb - bmod) ** 2).sum(-1))

    # Huecos encerrados (entre brazo y cuerpo, entre cuernos…): zonas suaves, grandes y del color del fondo.
    cand = smooth & ~bg & (dist < 10) & (wsum > 0.15)
    # se analizan a 1/4 de resolución para no tardar
    small = cand[::4, ::4]
    lab, sizes = components(small)
    holes = np.zeros_like(small)
    for i, s in enumerate(sizes):
        if i and s >= 12:
            holes |= lab == i
    holes = np.kron(holes, np.ones((4, 4), bool))[:H, :W] & cand
    bg |= holes

    # Halo: el borde difuminado entre el fondo y el contorno se queda con el fondo si se le parece.
    for _ in range(2):
        edge = ~bg & dilate(bg)
        bg |= edge & (dist < 22)
    return ~bg


# =================================== ajustes por código (fuente) ===================================

def ajuste_prota(cells, alto_ref):
    """
    Protagonista y madre: cabeza ~18 % más chica, torso y piernas ~16 % más largos, menos saturación y
    más oscuro. Determinista por celda: la cabeza se detecta por altura (la fila más estrecha — el cuello —
    entre el 30 % y el 52 % de la altura de pie, medida desde la coronilla).
    cells: lista de (rgb, mask) a resolución de la fuente.
    """
    HEAD_K = 0.80
    BODY_K = 1.18
    out = []
    for idx, (rgb, mask) in enumerate(cells):
        ys, xs = np.nonzero(mask)
        if not len(ys):
            out.append((rgb, mask))
            continue
        top, bot = ys.min(), ys.max()
        left, right = xs.min(), xs.max()
        h = bot - top + 1
        w = right - left + 1
        upright = h >= 0.62 * alto_ref and h >= 0.55 * w
        rgb2 = rgb.copy()
        # color sobrio
        L = lum(rgb2)[..., None]
        rgb2 = L + (rgb2 - L) * 0.62
        rgb2 = rgb2 * 0.86 + np.array([2, 4, 8], np.float32)
        rgb2 = np.clip(rgb2, 0, 255)
        # La pistola láser y la gema conservan su brillo turquesa (elemento clave que el jugador reconoce).
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        chroma = rgb.max(-1) - rgb.min(-1)
        cian = (b > r + 35) & (g > r + 25) & (chroma > 55) & mask
        rgb2[cian] = rgb[cian]
        if not upright:
            out.append((rgb2, mask))
            continue
        # cuello: fila más estrecha entre 30 % y 52 % de la altura de pie
        lo = top + int(0.30 * alto_ref)
        hi = min(bot - 4, top + int(0.52 * alto_ref))
        widths = mask[lo:hi].sum(1) if hi > lo else np.array([1])
        neck = lo + int(np.argmin(widths)) if hi > lo else top + int(0.4 * alto_ref)
        rows = mask[max(top, neck - 6):neck + 6]
        cols = np.nonzero(rows.any(0))[0]
        cx = float(np.nonzero(rows)[1].mean()) if len(cols) else (left + right) / 2

        Hc, Wc = mask.shape
        canvas_rgb = np.zeros((Hc * 2, Wc, 3), np.float32)
        canvas_m = np.zeros((Hc * 2, Wc), bool)
        off = Hc  # margen superior por si crece
        # cuerpo: filas [neck, bot] estiradas hacia arriba desde los pies
        body_h = bot - neck + 1
        new_body_h = int(round(body_h * BODY_K))
        for j in range(new_body_h):
            sy = bot - int((new_body_h - 1 - j) / BODY_K)
            ty = off + bot - (new_body_h - 1 - j)
            canvas_rgb[ty] = rgb2[sy]
            canvas_m[ty] = mask[sy]
        new_neck = off + bot - (new_body_h - 1)
        # cabeza: filas [top, neck) escaladas alrededor de (cx, neck)
        head_h = neck - top
        new_head_h = int(round(head_h * HEAD_K))
        xs_t = np.arange(Wc)
        sx = np.clip(np.round(cx + (xs_t - cx) / HEAD_K).astype(int), 0, Wc - 1)
        valid_x = (cx + (xs_t - cx) / HEAD_K >= 0) & (cx + (xs_t - cx) / HEAD_K <= Wc - 1)
        for j in range(new_head_h + 1):
            sy = neck - int(round(j / HEAD_K))
            if sy < top:
                break
            ty = new_neck - j
            mrow = mask[sy, sx] & valid_x
            if j == 0:
                # la fila del cuello se une con el cuerpo: solo se pinta donde hay cabeza
                pass
            canvas_rgb[ty][mrow] = rgb2[sy, sx][mrow]
            canvas_m[ty] |= mrow
        # recorta al tamaño original anclado a los pies (lo que sube por encima se conserva moviendo)
        ys2 = np.nonzero(canvas_m.any(1))[0]
        t2 = ys2.min()
        # mantener pies en la misma fila: el lienzo final es del alto necesario
        newH = max(Hc, (off + Hc) - t2)
        start = off + Hc - newH
        out.append((canvas_rgb[start:off + Hc], canvas_m[start:off + Hc]))
    return out


# ============================================ escalado ============================================

def downscale(rgb, mask, s):
    """Escala por vecino más cercano sobre el color suavizado 3×3 (solo píxeles del personaje)."""
    ys, xs = np.nonzero(mask)
    t, b, l, r = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb = rgb[t:b, l:r]
    mask = mask[t:b, l:r]
    h, w = mask.shape
    oh, ow = max(1, int(round(h * s))), max(1, int(round(w * s)))
    mf = mask.astype(np.float32)
    col = box(rgb * mf[..., None], 1) / np.maximum(box(mf, 1), 1e-3)[..., None]
    # alfa: fracción cubierta en la huella de cada píxel destino
    a = np.asarray(Image.fromarray((mf * 255).astype(np.uint8)).resize((ow, oh), Image.BOX)).astype(np.float32) / 255
    alpha = a >= 0.45
    yi = np.clip(((np.arange(oh) + 0.5) / s).astype(int), 0, h - 1)
    xi = np.clip(((np.arange(ow) + 0.5) / s).astype(int), 0, w - 1)
    out = col[yi][:, xi]
    ok = mask[yi][:, xi]
    # donde el muestreo cayó fuera del personaje pero el alfa dice que hay, usa el vecino válido
    need = alpha & ~ok
    if need.any():
        filled = out.copy()
        known = ok.copy()
        for _ in range(4):
            if not (need & ~known).any():
                break
            acc = np.zeros_like(filled)
            cnt = np.zeros(known.shape, np.float32)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                sh = np.roll(np.roll(known, dy, 0), dx, 1)
                shc = np.roll(np.roll(filled, dy, 0), dx, 1)
                acc += shc * sh[..., None]
                cnt += sh
            newk = ~known & (cnt > 0)
            filled[newk] = acc[newk] / cnt[newk][..., None]
            known |= newk
        out = filled
    return out, alpha


def clean_specks(alpha):
    """Quita motas sueltas: conserva el componente mayor y los que tengan ≥8 % de su tamaño."""
    lab, sizes = components(alpha)
    if len(sizes) <= 2:
        return alpha
    big = max(sizes[1:])
    keep = np.zeros_like(alpha)
    for i, s in enumerate(sizes):
        if i and (s >= big * 0.08 and s >= 6):
            keep |= lab == i
    return keep


# ======================================= cuantizar y contorno =======================================

def quantize(frames):
    """frames: lista de (rgb float, alpha bool). Paleta común de ≤32 colores, sin tramado."""
    px = np.concatenate([f[0][f[1]] for f in frames if f[1].any()], 0)
    px8 = np.clip(np.round(px), 0, 255).astype(np.uint8)
    # Los acentos turquesa (pistola láser, gema, brillos) son pocos píxeles y la mediana los borra:
    # se reservan hasta 3 tonos para ellos (oscuro, medio, claro) y el resto de la paleta sale del resto.
    pf = px.astype(np.float32)
    chroma = pf.max(1) - pf.min(1)
    cian = (pf[:, 2] > pf[:, 0] + 35) & (pf[:, 1] > pf[:, 0] + 25) & (chroma > 55)
    reserva = []
    if cian.sum() >= 6:
        c = pf[cian]
        L = c.mean(1)
        for lo, hi in ((0, 33), (33, 66), (66, 101)):
            sel = (L >= np.percentile(L, lo)) & (L <= np.percentile(L, min(hi, 100)))
            if sel.any():
                reserva.append(c[sel].mean(0))
    n_base = MAX_COLORS - len(reserva)
    img = Image.fromarray(px8.reshape(1, -1, 3), 'RGB')
    q = img.quantize(colors=n_base, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.array(q.getpalette()[:n_base * 3], np.float32).reshape(-1, 3)
    used = np.unique(np.asarray(q).ravel())
    pal = pal[used]
    if reserva:
        pal = np.concatenate([pal, np.array(reserva, np.float32)], 0)
    out = []
    for rgb, a in frames:
        o = rgb.copy()
        if a.any():
            v = rgb[a]
            dd = ((v[:, None, :] - pal[None, :, :]) ** 2).sum(-1)
            o[a] = pal[dd.argmin(1)]
        out.append((o, a))
    return out, pal


def add_outline(rgb, a, k=0.28, min_l=70):
    """Repone 1 px de contorno (oscuro y del color vecino, no negro puro) donde el borde quedó claro."""
    H, W = a.shape
    rgb = np.pad(rgb, ((1, 1), (1, 1), (0, 0)))
    a = np.pad(a, 1)
    L = lum(rgb)
    bright = a & (L > min_l)
    add = ~a & dilate(bright)
    if add.any():
        acc = np.zeros_like(rgb)
        cnt = np.zeros(a.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(a, dy, 0), dx, 1)
            shc = np.roll(np.roll(rgb, dy, 0), dx, 1)
            acc += shc * sh[..., None]
            cnt += sh
        c = acc / np.maximum(cnt, 1)[..., None]
        rgb[add] = np.clip(c[add] * k + np.array([4, 3, 8]), 0, 255)
        a = a | add
    return rgb, a


# ========================================= Don Ernesto =========================================

def ajuste_ernesto(rgb, a):
    """Más monstruoso: piel verde cadavérica, ojos que brillan, cuernos que rompen el sombrero y ropa más sombría."""
    PAD = 8
    rgb = np.pad(rgb, ((PAD, 0), (2, 2), (0, 0)))
    a = np.pad(a, ((PAD, 0), (2, 2)))
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    skin = a & (r - g > 50) & (r > 100) & (g - b > 5) & (r - g > g - b)
    L = lum(rgb)
    # piel → verde cadavérico (más oscuro y más verde que una persona)
    t = np.clip((L - 50) / 150, 0, 1)
    lo = np.array([34, 58, 36], np.float32)
    hi = np.array([132, 168, 102], np.float32)
    rgb[skin] = lo + (hi - lo) * t[skin][:, None]
    # ropa y pelo: más apagados, fríos y oscuros
    rest = a & ~skin
    Lr = L[rest][:, None]
    rgb[rest] = np.clip((Lr + (rgb[rest] - Lr) * 0.6) * 0.78 + np.array([0, 2, 6]), 0, 255)
    ys, xs = np.nonzero(a)
    if not len(ys):
        return rgb, a
    top, bot = ys.min(), ys.max()
    hgt = bot - top + 1
    # ojos: primera fila de piel en la mitad alta, hacia el frente (derecha); brillo de 2×2
    band = skin.copy()
    band[top + int(hgt * 0.5):] = False
    sy, sx = np.nonzero(band)
    if len(sy):
        ey = int(sy.min()) + 1
        rows = band[ey:ey + 4]
        cols = np.nonzero(rows.any(0))[0]
        if len(cols):
            ex = int(cols.max()) - 3
            for (oy, ox, c) in ((0, 0, (255, 244, 150)), (0, 1, (255, 200, 70)), (1, 0, (255, 120, 40)),
                                (1, 1, (220, 50, 30)), (0, -1, (180, 40, 30))):
                yy, xx = ey + oy, ex + ox
                if 0 <= yy < a.shape[0] and 0 <= xx < a.shape[1] and a[yy, xx]:
                    rgb[yy, xx] = c
    # cuernos curvos que salen de la copa del sombrero
    trow = np.nonzero(a[top + 4])[0]
    if len(trow) > 1:
        horn = [(0, 0), (-1, 0), (-2, 0), (-3, -1), (-4, -1), (-5, -2), (-6, -3), (-7, -4)]
        for side, cx in ((-1, int(trow.min()) + 1), (1, int(trow.max()) - 1)):
            for i, (dy, dx) in enumerate(horn):
                for w in (0, 1):
                    yy, xx = top + 4 + dy, cx + dx * side + w * side * -1
                    if i >= 6 and w:
                        continue
                    if 0 <= yy < a.shape[0] and 0 <= xx < a.shape[1]:
                        rgb[yy, xx] = (226, 210, 168) if i >= 5 else ((150, 120, 96) if i >= 3 else ((96, 30, 30) if w else (60, 16, 20)))
                        a[yy, xx] = True
    return rgb, a


def demon_shadow(rgb, a):
    """Segundo contorno exterior carmesí oscuro (la 'sombra demoníaca')."""
    rgb = np.pad(rgb, ((1, 1), (1, 1), (0, 0)))
    a = np.pad(a, 1)
    ring = dilate(a, 1, diag=True) & ~a
    rgb[ring] = (64, 10, 22)
    return rgb, a | ring


# ==================================== Bruja Guajolote: ave ====================================

AVE_PAL = {
    'pluma0': (14, 12, 12), 'pluma1': (32, 27, 26), 'pluma2': (54, 46, 40), 'pluma3': (84, 72, 58),
    'brillo': (112, 98, 120),
    'piel0': (70, 52, 40), 'piel1': (122, 96, 72), 'piel2': (168, 140, 106),
    'carun0': (96, 18, 22), 'carun1': (160, 34, 36), 'carun2': (212, 72, 64),
    'pico0': (110, 92, 62), 'pico1': (190, 168, 120),
    'garra': (220, 210, 180), 'ojo': (255, 214, 90), 'ojo2': (255, 120, 40),
    'contorno': (10, 6, 8),
}


def dibujar_ave(alto):
    """
    Guajolote monstruoso (forma de ave de la Bruja), dibujado por código en las 24 poses de la
    disposición estándar. Plumas negras con reflejo violáceo, carúnculas rojas, garras, ojos que brillan.
    Devuelve una lista de 24 (rgb, alpha) ya a escala de juego (sin recortar).
    """
    P = AVE_PAL
    S = alto / 100.0
    frames = []

    def pose(i):
        # parámetros por pose: inclinación del cuerpo, alas, fase de patas, cuello, agachado, giro
        p = dict(tilt=0, wing=0.0, leg=0.0, legs_up=0.0, neck=0.0, crouch=0.0, peck=0.0, rot=0, lie=False,
                 tail=1.0, mouth=0)
        if i in (0, 1):
            p.update(neck=0.04 * i, wing=0.05 * i, tail=1.0 - 0.05 * i)
        elif 2 <= i <= 5:
            ph = (i - 2) / 4 * 2 * math.pi
            p.update(leg=math.sin(ph), neck=0.08 * math.cos(ph), tilt=4)
        elif 6 <= i <= 9:
            ph = (i - 6) / 4 * 2 * math.pi
            p.update(leg=1.4 * math.sin(ph), tilt=14, wing=0.35 + 0.15 * math.cos(ph), neck=0.1)
        elif i == 10:
            p.update(tilt=-10, wing=0.9, neck=-0.2, mouth=1)
        elif i == 11:
            p.update(tilt=22, wing=0.6, peck=1.0, neck=0.4, mouth=1)
        elif i == 12:
            p.update(crouch=0.3, wing=0.25, neck=-0.1)
        elif i == 13:
            p.update(wing=1.0, tilt=-6, neck=-0.25, mouth=1)
        elif i == 14:
            p.update(wing=0.7, tilt=10, neck=0.3, mouth=1)
        elif i == 15:
            p.update(wing=0.5, tilt=18, neck=0.5, peck=0.5, mouth=1)
        elif i == 16:
            p.update(wing=1.0, legs_up=1.0, tilt=-4)
        elif i == 17:
            p.update(wing=0.55, legs_up=0.4, tilt=8)
        elif i == 18:
            p.update(crouch=0.7, wing=0.1, tilt=6)
        elif i == 19:
            p.update(crouch=0.5, tilt=28, wing=0.4, leg=1.2)
        elif i == 20:
            p.update(crouch=0.4, tilt=30, peck=1.0, neck=0.5, mouth=1)
        elif i == 21:
            p.update(tilt=-22, wing=0.75, neck=-0.45, mouth=1)
        elif i == 22:
            p.update(crouch=0.55, tilt=20, wing=0.05, neck=0.6, tail=0.6)
        elif i == 23:
            p.update(lie=True, wing=0.05, tail=0.5)
        return p

    for i in range(N):
        p = pose(i)
        W, H = int(180 * S), int(150 * S)
        img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        gy = H - 4                           # suelo
        cx = W * 0.47
        crouch = p['crouch']
        leg_len = 34 * S * (1 - 0.45 * crouch)
        body_cy = gy - leg_len - 26 * S
        if p['lie']:
            body_cy = gy - 16 * S
        tilt = math.radians(p['tilt'] if not p['lie'] else 80)

        def rot(x, y, ox=cx, oy=None, ang=None):
            oy = body_cy if oy is None else oy
            ang = tilt if ang is None else ang
            dx, dy = x - ox, y - oy
            return (ox + dx * math.cos(ang) - dy * math.sin(ang), oy + dx * math.sin(ang) + dy * math.cos(ang))

        def poly(pts, fill, ang=None, ox=None, oy=None):
            d.polygon([rot(x, y, cx if ox is None else ox, oy, ang) for x, y in pts], fill=fill)

        # --- cola en abanico (detrás, a la izquierda) ---
        tail = p['tail']
        tail_cx, tail_cy = cx - 26 * S, body_cy - 6 * S
        for k in range(9):
            a0 = math.radians(-165 + k * 17) if not p['lie'] else math.radians(-200 + k * 12)
            ln = (44 + (6 if k % 2 else 0)) * S * tail
            tip = (tail_cx + math.cos(a0) * ln, tail_cy + math.sin(a0) * ln)
            w1 = (tail_cx + math.cos(a0 - 0.12) * ln * 0.3, tail_cy + math.sin(a0 - 0.12) * ln * 0.3)
            w2 = (tail_cx + math.cos(a0 + 0.12) * ln * 0.3, tail_cy + math.sin(a0 + 0.12) * ln * 0.3)
            pts = [rot(*q) for q in ((tail_cx, tail_cy), w1, tip, w2)]
            d.polygon(pts, fill=P['pluma1'] if k % 2 else P['pluma0'])
            # banda clara de la punta
            band = [rot(tail_cx + math.cos(a0) * ln * 0.82, tail_cy + math.sin(a0) * ln * 0.82), rot(*tip)]
            d.line(band, fill=P['pluma3'], width=max(1, int(2 * S)))
        # --- patas ---
        def leg(phase, back):
            hip = rot(cx + (2 if back else 8) * S, body_cy + 18 * S)
            if p['lie']:
                foot = (hip[0] + 22 * S, hip[1] + 4 * S)
                knee = ((hip[0] + foot[0]) / 2, hip[1] - 4 * S)
            elif p['legs_up'] > 0:
                knee = (hip[0] + 8 * S, hip[1] + 10 * S * (1 - 0.4 * p['legs_up']))
                foot = (hip[0] - 2 * S, hip[1] + 18 * S * (1 - 0.3 * p['legs_up']))
            else:
                sw = phase * 12 * S
                foot = (hip[0] + sw, gy)
                lift = max(0, -phase) * 8 * S
                foot = (foot[0], gy - lift)
                knee = ((hip[0] + foot[0]) / 2 + 7 * S * (1 + crouch), (hip[1] + foot[1]) / 2 - 2 * S * crouch)
            col = P['piel0'] if back else P['piel1']
            wd = max(3, int(6 * S))
            d.line([hip, knee, foot], fill=col, width=wd, joint='curve')
            # garras
            for ang in (-0.35, 0.05, 0.45):
                tx = foot[0] + math.cos(ang) * 9 * S
                ty = foot[1] + math.sin(ang) * 3 * S
                d.line([foot, (tx, ty)], fill=P['garra'] if not back else P['pico0'], width=max(1, int(2 * S)))
            d.line([foot, (foot[0] - 6 * S, foot[1] + 1)], fill=P['pico0'], width=max(1, int(2 * S)))
        leg(-p['leg'], True)
        # --- cuerpo ---
        bw, bh = 34 * S, 27 * S
        body = []
        for k in range(28):
            t = k / 28 * 2 * math.pi
            body.append((cx + math.cos(t) * bw, body_cy + math.sin(t) * bh * (1.0 if math.sin(t) > 0 else 0.9)))
        d.polygon([rot(*q) for q in body], fill=P['pluma1'])
        # escamas de plumas (filas de "V")
        for row in range(4):
            for col in range(6):
                x0 = cx - bw * 0.75 + col * bw * 0.3 + (row % 2) * bw * 0.15
                y0 = body_cy - bh * 0.55 + row * bh * 0.38
                c = P['pluma2'] if (row + col) % 3 else P['brillo']
                d.line([rot(x0, y0), rot(x0 + 4 * S, y0 + 4 * S), rot(x0 + 8 * S, y0)], fill=c, width=max(1, int(S)))
        # pechera de "barba" (mechón de pelo negro del guajolote)
        poly([(cx + 22 * S, body_cy - 6 * S), (cx + 26 * S, body_cy + 18 * S), (cx + 18 * S, body_cy + 10 * S)],
             P['pluma0'])
        leg(p['leg'], False)
        # --- ala ---
        wg = p['wing']
        sh = rot(cx + 4 * S, body_cy - 12 * S)
        wing_ang = math.radians(-20 - 120 * wg) + tilt
        span = 46 * S * (0.7 + 0.6 * wg)
        for k in range(6):
            a0 = wing_ang + math.radians(k * 16 * (0.4 + wg))
            ln = span * (1 - k * 0.08)
            tip = (sh[0] - math.cos(a0) * ln * (0.6 if wg < 0.2 else 1), sh[1] + math.sin(a0) * ln)
            if wg < 0.2:  # ala plegada sobre el cuerpo
                tip = (sh[0] - (30 - k * 2) * S, sh[1] + (10 + k * 3) * S)
            mid = ((sh[0] + tip[0]) / 2, (sh[1] + tip[1]) / 2)
            perp = (-(tip[1] - sh[1]) * 0.12, (tip[0] - sh[0]) * 0.12)
            d.polygon([sh, (mid[0] + perp[0], mid[1] + perp[1]), tip, (mid[0] - perp[0], mid[1] - perp[1])],
                      fill=P['pluma0'] if k % 2 else P['pluma1'])
            d.line([mid, tip], fill=P['pluma3'] if k % 2 else P['brillo'], width=1)
        # --- cuello y cabeza ---
        if not p['lie']:
            neck_base = rot(cx + 24 * S, body_cy - 12 * S)
            nx = 14 * S + p['peck'] * 14 * S + p['neck'] * 10 * S
            ny = -30 * S * (1 - 0.6 * p['peck']) - p['neck'] * 6 * S + crouch * 6 * S
            head = (neck_base[0] + nx, neck_base[1] + ny)
        else:
            neck_base = rot(cx + 24 * S, body_cy - 6 * S)
            head = (neck_base[0] + 18 * S, gy - 8 * S)
        d.line([neck_base, ((neck_base[0] + head[0]) / 2 - 3 * S, (neck_base[1] + head[1]) / 2), head],
               fill=P["piel1"], width=max(4, int(10 * S)), joint="curve")
        # arrugas del cuello
        for k in range(3):
            t = 0.25 + k * 0.22
            q = (neck_base[0] + (head[0] - neck_base[0]) * t, neck_base[1] + (head[1] - neck_base[1]) * t)
            d.line([(q[0] - 3 * S, q[1]), (q[0] + 3 * S, q[1] + 1)], fill=P['piel0'], width=1)
        hr = 12 * S
        d.ellipse([head[0] - hr, head[1] - hr * 0.95, head[0] + hr, head[1] + hr * 0.95], fill=P['piel2'])
        d.ellipse([head[0] - hr * 0.8, head[1] - hr * 0.2, head[0] + hr * 0.6, head[1] + hr * 0.9], fill=P['piel1'])
        # pico ganchudo (abierto si ataca)
        bx = head[0] + hr * 0.7
        by = head[1] + hr * 0.1
        d.polygon([(bx, by - 3 * S), (bx + 12 * S, by + 1 * S), (bx + 9 * S, by + 4 * S), (bx, by + 2 * S)], fill=P['pico1'])
        if p['mouth']:
            d.polygon([(bx, by + 3 * S), (bx + 9 * S, by + 8 * S), (bx, by + 6 * S)], fill=P['pico0'])
        # moco (carúncula que cuelga sobre el pico) y barbilla roja
        d.line([(head[0] + hr * 0.3, head[1] - hr * 0.7), (bx + 4 * S, by - 4 * S), (bx + 7 * S, by + 8 * S)],
               fill=P['carun1'], width=max(2, int(3 * S)), joint='curve')
        d.ellipse([head[0] - 2 * S, head[1] + hr * 0.5, head[0] + 6 * S, head[1] + hr * 1.9], fill=P['carun1'])
        d.ellipse([head[0] - 0 * S, head[1] + hr * 1.1, head[0] + 4 * S, head[1] + hr * 2.4], fill=P['carun0'])
        for k in range(3):
            d.point((head[0] - 3 * S + k * 3 * S, head[1] + hr * 0.9), fill=P['carun2'])
        # cresta de plumas negras erizadas sobre la nuca
        for k in range(5):
            a0 = math.radians(-150 + k * 18)
            d.line([(head[0] - hr * 0.2, head[1] - hr * 0.3),
                    (head[0] - hr * 0.2 + math.cos(a0) * 14 * S, head[1] - hr * 0.3 + math.sin(a0) * 12 * S)],
                   fill=P['pluma0'] if k % 2 else P['pluma1'], width=max(1, int(2 * S)))
        # ojo que brilla
        ex, ey = head[0] + hr * 0.25, head[1] - hr * 0.25
        d.rectangle([ex - 2.5 * S, ey - 2 * S, ex + 2.5 * S, ey + 2 * S], fill=P["ojo2"])
        d.rectangle([ex - 1 * S, ey - 1 * S, ex + 1 * S, ey + 1 * S], fill=P["ojo"])
        d.point((round(ex), round(ey)), fill=P['ojo'])
        if i in (21, 22, 23):  # daño / derrota: ojo entrecerrado
            d.line([(ex - 2 * S, ey), (ex + 2 * S, ey)], fill=P['carun0'], width=1)
        arr = np.asarray(img).astype(np.float32)
        frames.append((arr[..., :3], arr[..., 3] > 127))
    return frames


# ============================================ pipeline ============================================

MARGIN = 56   # px que una pose puede salirse de su celda (la cola o la cabeza de Balam, p. ej.)


def load_sheet(name):
    """
    Separa las 24 poses. No se corta a ciegas por la cuadrícula: se etiquetan las manchas del personaje
    (a media resolución y con el contorno adelgazado 2 px para que no se peguen por el halo) y cada celda se
    queda con la mancha que más ocupa su recuadro, más las piezas sueltas cuyo centro cae dentro de él.
    Así una pose que invade la celda vecina sale completa y la vecina no hereda el pedazo. Si dos poses quedaron
    pegadas en una sola mancha, esa mancha sí se corta por la cuadrícula.
    """
    rgb = np.asarray(Image.open(os.path.join(SRC, name + '.png')).convert('RGB')).astype(np.float32)
    fg = remove_background(rgb)
    H, W = fg.shape
    er = ~dilate(~fg, 2)
    half = er[::2, ::2]
    lab, sizes = components(half)
    sizes = np.array(sizes)
    nl = len(sizes)
    hy, hx = np.mgrid[0:half.shape[0], 0:half.shape[1]]
    # centroide de cada mancha (en px de la hoja)
    cnt = np.bincount(lab.ravel(), minlength=nl).astype(np.float64)
    cyl = np.bincount(lab.ravel(), weights=hy.ravel(), minlength=nl) / np.maximum(cnt, 1) * 2
    cxl = np.bincount(lab.ravel(), weights=hx.ravel(), minlength=nl) / np.maximum(cnt, 1) * 2
    mains = []
    for i in range(N):
        cy, cx = (i // COLS) * CELL // 2, (i % COLS) * CELL // 2
        sub = lab[cy:cy + CELL // 2, cx:cx + CELL // 2].ravel()
        bc = np.bincount(sub, minlength=nl)
        bc[0] = 0
        mains.append(int(bc.argmax()) if bc.max() > 0 else 0)
    mainset = set(mains)
    # recuadro (en px de la hoja) de la mancha principal de cada celda
    boxes = []
    for i in range(N):
        if not mains[i]:
            boxes.append(None)
            continue
        mm = lab == mains[i]
        if mains.count(mains[i]) > 1:  # mancha compartida por dos poses: solo la parte dentro de esta celda
            cy2, cx2 = (i // COLS) * CELL // 2, (i % COLS) * CELL // 2
            clip = np.zeros_like(mm)
            clip[cy2:cy2 + CELL // 2, cx2:cx2 + CELL // 2] = True
            mm &= clip
        yy, xx = np.nonzero(mm)
        boxes.append((yy.min() * 2, yy.max() * 2 + 1, xx.min() * 2, xx.max() * 2 + 1))
    # piezas sueltas (cabeza separada por el contorno, un arma, chispas): a la pose más cercana
    extras = {i: set() for i in range(N)}
    for l in range(1, nl):
        if l in mainset or sizes[l] < 4:
            continue
        best, bd = -1, 1e9
        for i, b in enumerate(boxes):
            if b is None:
                continue
            ddy = max(b[0] - cyl[l], 0, cyl[l] - b[1])
            ddx = max(b[2] - cxl[l], 0, cxl[l] - b[3])
            dd = math.hypot(ddy, ddx)
            if dd < bd:
                best, bd = i, dd
        if best >= 0 and bd < 40 and sizes[l] >= sizes[mains[best]] * 0.03:
            extras[best].add(l)
    M = MARGIN
    rgbp = np.pad(rgb, ((M, M), (M, M), (0, 0)))
    fgp = np.pad(fg, M)
    labp = np.pad(np.kron(lab, np.ones((2, 2), np.int32))[:H, :W], M)
    cells = []
    for i in range(N):
        cy, cx = (i // COLS) * CELL, (i % COLS) * CELL
        keep = ({mains[i]} | extras[i]) if mains[i] else set()
        win_l = labp[cy:cy + CELL + 2 * M, cx:cx + CELL + 2 * M]
        sel = np.isin(win_l, list(keep)) if keep else np.zeros(win_l.shape, bool)
        if mains[i] and mains.count(mains[i]) > 1:
            # dos poses pegadas (los pies de una tocan la cabeza de la de abajo): esa mancha se corta por la cuadrícula
            inside = np.zeros_like(sel)
            inside[M:M + CELL, M:M + CELL] = True
            sel &= (win_l != mains[i]) | inside
            # lo que entra por el borde de arriba (pies de la pose de la fila anterior) se corta en una franja
            sel_px = fgp[cy:cy + CELL + 2 * M, cx:cx + CELL + 2 * M] & dilate(sel, 2)
            band = np.zeros_like(sel)
            band[M:M + int(CELL * 0.12), M:M + CELL] = True
            top = np.zeros_like(sel)
            top[M, M:M + CELL] = True
            spill = grow(top & sel_px, band & sel_px)
            sel &= ~dilate(spill, 3)
            # de lo que quedó, solo la parte mayor (el pedazo de la pose vecina queda fuera)
            q = sel[: sel.shape[0] // 4 * 4, : sel.shape[1] // 4 * 4]
            q = q.reshape(q.shape[0] // 4, 4, q.shape[1] // 4, 4).any(axis=(1, 3))
            ql, qs = components(q)
            if len(qs) > 2:
                big = np.kron(ql == int(np.argmax(qs[1:])) + 1, np.ones((4, 4), bool))
                full = np.zeros_like(sel)
                full[: big.shape[0], : big.shape[1]] = big
                sel &= full
        m = fgp[cy:cy + CELL + 2 * M, cx:cx + CELL + 2 * M] & dilate(sel, 4)
        cells.append((rgbp[cy:cy + CELL + 2 * M, cx:cx + CELL + 2 * M].copy(), m))
    return rgb, fg, cells


def height_of(mask):
    ys = np.nonzero(mask.any(1))[0]
    return (ys.max() - ys.min() + 1) if len(ys) else 0


def process_sheet(name, alto, ajuste):
    rgb, fg, cells = load_sheet(name)
    # revisión: máscara a media resolución
    vis = rgb.copy()
    vis[~fg] = vis[~fg] * 0.15 + np.array([255, 0, 255]) * 0.85
    Image.fromarray(vis.astype(np.uint8)).resize((768, 512), Image.NEAREST).save(os.path.join(REV, f'_fondo_{name}.png'))
    ref = float(np.median([height_of(m) for _, m in cells[:6]]))
    if ajuste == 'prota':
        cells = ajuste_prota(cells, ref)
        ref = float(np.median([height_of(m) for _, m in cells[:6]]))
    s = alto / ref
    frames = []
    for rgbc, m in cells:
        if not m.any():
            frames.append((np.zeros((1, 1, 3), np.float32), np.zeros((1, 1), bool)))
            continue
        o, a = downscale(rgbc, m, s)
        a = clean_specks(a)
        frames.append((o, a))
    return frames, s, ref


def build_kit(kid, cfg):
    variants = []
    info = {}
    if cfg.get('ajuste') == 'ave':
        raw = dibujar_ave(cfg['alto'])
        variants.append((None, raw))
        info['ave'] = 'dibujada por código (paleta de bruja.png)'
    else:
        for vname, sheet in cfg['hojas']:
            frames, s, ref = process_sheet(sheet, cfg['alto'], cfg.get('ajuste'))
            variants.append((vname, frames))
            info[sheet] = dict(escala_fuente=round(s, 4), alto_de_pie_fuente=ref)
    # cuantizar, contorno y ajustes finales por variante
    final = []
    for vname, frames in variants:
        q, pal = quantize(frames)
        fx = []
        for rgb, a in q:
            if a.any():
                rgb, a = add_outline(rgb, a)
                if cfg.get('ajuste') == 'ernesto':
                    rgb, a = ajuste_ernesto(rgb, a)
                    rgb, a = demon_shadow(rgb, a)
            fx.append((rgb, a))
        final.append((vname, fx))
    # anclas: x = centroide del personaje, y = fila de los pies
    anchors = []
    for _, fx in final:
        for rgb, a in fx:
            if not a.any():
                anchors.append((0.0, 0, 0, 0))
                continue
            ys, xs = np.nonzero(a)
            anchors.append((float(xs.mean()), int(ys.max()) + 1, a.shape[1], a.shape[0]))
    left = max(ax for ax, ay, w, h in anchors)
    right = max(w - ax for ax, ay, w, h in anchors)
    up = max(ay for ax, ay, w, h in anchors)
    FW = int(math.ceil(max(left, right))) * 2 + 2
    FH = up + 3
    piv = (FW // 2, FH - 2)
    nv = len(final)
    sheet = np.zeros((FH * ROWS * nv, FW * COLS, 4), np.uint8)
    frames_json = []
    k = 0
    for vi, (vname, fx) in enumerate(final):
        for i, (rgb, a) in enumerate(fx):
            gi = vi * N + i
            fx0 = (gi % COLS) * FW
            fy0 = (gi // COLS) * FH
            ax, ay, w, h = anchors[k]
            k += 1
            if a.any():
                ox = fx0 + piv[0] - int(round(ax))
                oy = fy0 + piv[1] - ay
                ys, xs = np.nonzero(a)
                ty, tx = ys + oy, xs + ox
                ok = (tx >= fx0) & (tx < fx0 + FW) & (ty >= fy0) & (ty < fy0 + FH)
                sheet[ty[ok], tx[ok], :3] = np.clip(np.round(rgb[ys[ok], xs[ok]]), 0, 255).astype(np.uint8)
                sheet[ty[ok], tx[ok], 3] = 255
            vista = POSES[i]
            if i == 0 and vi == 0:
                vista = 'lado_der' if cfg['tipo'] == 'humanoide' else 'der'
            name = f'{kid}_{vname + "_" if vname else ""}{POSES[i]}'
            frames_json.append(dict(name=name, vista=vista, x=fx0, y=fy0, w=FW, h=FH))
    anims = json.loads(json.dumps(DEFAULT_ANIMS))
    anims.update(json.loads(json.dumps(ANIM_OVERRIDES.get(kid, {}))))
    out = {
        'personaje': kid,
        'tipo': cfg['tipo'],
        'frameWidth': FW,
        'frameHeight': FH,
        'pivot': {'x': piv[0], 'y': piv[1]},
        'frames': frames_json,
        'escala': 1,
        'animaciones': anims,
        'cuadrosPorVariante': N,
        'generadoPor': GEN,
        'fuente': info,
        'alto': cfg['alto'],
    }
    if nv > 1:
        out['variants'] = [v for v, _ in final]
    return out, sheet


def backup_if_team(kid):
    d = os.path.join(OUT, kid)
    j = os.path.join(d, f'{kid}_spritesheet.json')
    if not os.path.isdir(d) or not os.listdir(d):
        return
    try:
        with open(j, encoding='utf-8') as f:
            if json.load(f).get('generadoPor') == GEN:
                return  # es nuestro: se puede regenerar
    except Exception:
        pass
    dst = os.path.join(PREV, f'{kid}-{time.strftime("%Y%m%d-%H%M%S")}')
    shutil.copytree(d, dst)
    print(f'  respaldo del kit previo → {os.path.relpath(dst, ROOT)}')


def review_png(kid, sheet, js):
    FW, FH = js['frameWidth'], js['frameHeight']
    h, w = sheet.shape[:2]
    bg = np.zeros((h, w, 4), np.uint8)
    bg[..., :3] = 58
    bg[..., 3] = 255
    yy, xx = np.mgrid[0:h, 0:w]
    bg[((xx // FW + yy // FH) % 2 == 0), :3] = 70
    bg[(yy % FH) == js['pivot']['y'], :3] = (90, 60, 60)
    im = Image.fromarray(bg)
    im.alpha_composite(Image.fromarray(sheet))
    im = im.resize((w * 2, h * 2), Image.NEAREST)
    im.save(os.path.join(REV, f'{kid}.png'))


def write_mapeo(results):
    lines = ['# Mapeo de poses de las hojas de Codex → kits', '',
             'Generado por `tools/codex-sheets.py`. Celdas numeradas 0–23, fila por fila (6 por fila).', '',
             '| Celda | Pose (nombre del cuadro) |', '|---|---|']
    for i, p in enumerate(POSES):
        lines.append(f'| {i} | {p} |')
    lines += ['', '## Animaciones por defecto (motion → celdas)', '']
    for m, a in DEFAULT_ANIMS.items():
        lines.append(f'- `{m}`: {a["frames"]} · {a["fps"]} fps · {"bucle" if a["loop"] else "una vez"}')
    lines += ['', '## Cambios por personaje', '']
    for kid, ov in ANIM_OVERRIDES.items():
        lines.append(f'- **{kid}**: ' + '; '.join(f'`{m}` {a["frames"]}' for m, a in ov.items()))
    lines += ['', '## Kits', '', '| id | hojas (variante ← archivo) | alto objetivo | cuadro | pivote |', '|---|---|---|---|---|']
    for kid, js in results.items():
        cfg = KITS[kid]
        hojas = ', '.join(f'{v or "—"} ← {h}.png' for v, h in cfg['hojas']) or 'dibujada por código'
        lines.append(f'| {kid} | {hojas} | {cfg["alto"]} px | {js["frameWidth"]}×{js["frameHeight"]} | '
                     f'({js["pivot"]["x"]}, {js["pivot"]["y"]}) |')
    lines += ['', 'Notas:', '',
              '- `nahual_animal` usa `nahual.png` (forma animal del nahual). `bestia-2.png` no se usa (las bestias son 1 y 3).',
              '- Protagonista y madre: cabeza ×0.80 y cuerpo ×1.18 en las poses erguidas; color con 62 % de saturación y 86 % de brillo.',
              '- Don Ernesto: piel verde ceniza, ojos que brillan, cuernos sobre el sombrero y doble contorno carmesí.',
              '- Cabeza Olmeca: la hoja son expresiones (ojos verdes = ataque, X = derrota, ojos cerrados = calma).', '']
    with open(os.path.join(ROOT, 'arte-fuente', 'codex', 'MAPEO.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))


def main():
    os.makedirs(REV, exist_ok=True)
    ids = sys.argv[1:] or list(KITS)
    results = {}
    for kid in ids:
        t0 = time.time()
        print(f'[{kid}]')
        js, sheet = build_kit(kid, KITS[kid])
        backup_if_team(kid)
        d = os.path.join(OUT, kid)
        os.makedirs(d, exist_ok=True)
        Image.fromarray(sheet, 'RGBA').save(os.path.join(d, f'{kid}_spritesheet.png'), optimize=True)
        with open(os.path.join(d, f'{kid}_spritesheet.json'), 'w', encoding='utf-8', newline='\n') as f:
            json.dump(js, f, ensure_ascii=False, indent=1)
        review_png(kid, sheet, js)
        results[kid] = js
        print(f'  cuadro {js["frameWidth"]}×{js["frameHeight"]} · pivote {js["pivot"]} · '
              f'variantes {js.get("variants", "-")} · {time.time() - t0:.1f} s')
    if len(ids) == len(KITS):
        write_mapeo(results)


if __name__ == '__main__':
    main()
