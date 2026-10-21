"""Utilidades compartidas del lote "jefes1" (Bruja Guajolote humana y ave, Cabeza Olmeca, Nahuala).

No es un personaje (empieza con '_': generar.py no lo descubre). Trae:
  * `pluma()`        pluma puntiaguda sombreada con raquis (mantos, penachos, colas, alas)
  * `llama()`        llamita de fuego fatuo (efecto: sin contorno)
  * `chispas()`      destellos en anillo, deterministas por cuadro
  * `humo()`         bocanadas de humo tramadas (efecto)
  * `deshilachar()`  borde inferior en jirones de una parte (faldas, trapos)
  * `garra_larga()`  mano de dedos largos con uñas (bruja / nahuala)
  * `PC` + `Criatura` pose y cuadro para criaturas que no usan el rig humanoide (ave, cabeza)
"""
from __future__ import annotations

import math
from typing import Sequence

import numpy as np

from lib import VACIO, Capa, Lienzo, dir_ang, mas

Punto = tuple


def _h(*v) -> int:
    """Hash entero estable (sin azar: el mismo cuadro sale igual siempre)."""
    x = 2166136261
    for a in v:
        x ^= int(a) & 0xffffffff
        x = (x * 16777619) & 0xffffffff
    return x


# ------------------------------------------------------------------------------------------------
#  Plumas
# ------------------------------------------------------------------------------------------------

def pluma(capa: Capa, base: Punto, ang: float, largo: float, ancho: float, mat: int,
          tonos: Sequence[int] = (0, 1, 2), raquis: int | None = None, punta: int | None = None,
          curva: float = 0.0, ks: int = 1):
    """Pluma con forma de hoja: nace en `base` con dirección `ang` (convención dir_ang: 0 abajo, 90 adelante,
    180 arriba, −90 atrás). `curva` dobla la punta (grados). `raquis`: tono de la nervadura central;
    `punta`: tono de la banda de la punta (las plumas del guajolote tienen la punta clara)."""
    d = dir_ang(ang)
    d2 = dir_ang(ang + curva)
    n = (-d[1], d[0])
    mid = mas(base, d, largo * 0.38)
    tip = mas(mid, d2, largo * 0.62)
    m2 = mas(base, d, largo * 0.72)
    m2 = mas(m2, d2, largo * 0.05)
    pts = [mas(base, n, ancho * 0.35), mas(mid, n, ancho), mas(m2, n, ancho * 0.55), tip,
           mas(m2, n, -ancho * 0.55), mas(mid, n, -ancho), mas(base, n, -ancho * 0.35)]
    capa.poligono(pts, mat, sombreado=tonos, ks=ks, kl=1)
    if raquis is not None and largo >= 6:
        capa.linea(mas(base, d, 1.0), mas(mid, d2, largo * 0.4), mat, raquis)
    if punta is not None:
        capa.linea(mas(m2, n, ancho * 0.3), tip, mat, punta)
    return tip


# ------------------------------------------------------------------------------------------------
#  Efectos (fx = sin contorno, no los toca la limpieza)
# ------------------------------------------------------------------------------------------------

def llama(capa: Capa, base: Punto, alto: float, ancho: float, mat: int, fase: int = 0, tonos=(1, 2, 3),
          inclina: float = 0.0):
    """Llamita (fuego fatuo) que sube desde `base`. Tres capas de tono (borde, cuerpo, núcleo)."""
    bx, by = capa.a_px(base)
    H = max(3, int(round(alto)))
    for j in range(H + 2):
        t = j / H                                # 0 abajo → 1 punta
        if t > 1.05:
            break
        w = ancho * (math.sin(math.pi * min(1.0, 0.18 + t * 0.95)) ** 0.8) * (1 - t * 0.55)
        ox = math.sin(t * 5.0 + fase * 1.7) * t * 1.6 + inclina * t * H * 0.3
        y = by - j
        x0, x1 = int(math.floor(bx + ox - w + 0.5)), int(math.floor(bx + ox + w + 0.5))
        for x in range(x0, x1 + 1):
            u = abs(x + 0.5 - (bx + ox + 0.5)) / max(w, 0.6)
            if u <= 0.38 and t < 0.6:
                tn = tonos[2]
            elif u <= 0.72 and t < 0.85:
                tn = tonos[1]
            else:
                tn = tonos[0]
            capa.pon(x, y, mat, tn, fx=True)
    # lengüetas sueltas arriba
    for k in range(2):
        if (fase + k) % 2 == 0:
            capa.pon(bx + int(math.sin(fase + k * 2) * 2), by - H - 2 - k * 2, mat, tonos[0 if k else 1], fx=True)


def chispas(capa: Capa, centro: Punto, mat: int, k: int, radio: float = 10, n: int = 8, tonos=(1, 3),
            sube: float = 1.5, cruz: bool = True):
    """Destellos alrededor de `centro` (posiciones fijas que rotan y suben con el cuadro `k`)."""
    for j in range(n):
        a = j / n * 2 * math.pi + k * 0.55
        r = radio * (0.65 + 0.35 * ((_h(j, 7) % 100) / 100))
        x, y = capa.a_px((centro[0] + math.cos(a) * r, centro[1] + math.sin(a) * r * 0.8 - k * sube))
        if (j + k) % 2 == 0:
            capa.pon(x, y, mat, tonos[1], fx=True)
            if cruz and (j + k) % 4 == 0:
                for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if capa.dentro(x + ex, y + ey) and capa.mat[y + ey, x + ex] == VACIO:
                        capa.pon(x + ex, y + ey, mat, tonos[0], fx=True)
        elif (j + k) % 3 == 0:
            capa.pon(x, y, mat, tonos[0], fx=True)


def humo(capa: Capa, centro: Punto, k: int, mat: int, n: int = 5, radio: float = 4.0, sube: float = 3.0,
         abre: float = 6.0, tonos=(0, 1, 2), semilla: int = 0):
    """Bocanadas de humo tramadas que suben y se abren con el cuadro `k` (0, 1, 2…)."""
    for j in range(n):
        hx = ((_h(semilla, j) % 200) / 100.0 - 1.0)
        hy = ((_h(semilla, j, 3) % 100) / 100.0)
        cx = centro[0] + hx * abre * (1 + k * 0.4)
        cy = centro[1] - hy * 6 - k * sube - j * 1.5
        r = radio * (0.6 + 0.5 * hy) * (1 + k * 0.15) * (1 - j * 0.05)
        x0, y0 = capa.a_px((cx, cy))
        R = int(math.ceil(r))
        for yy in range(-R, R + 1):
            for xx in range(-R, R + 1):
                d = (xx * xx + yy * yy) / max(r * r, 0.5)
                if d > 1:
                    continue
                X, Y = x0 + xx, y0 + yy
                # el humo se deshace: más tramado conforme pasa el tiempo
                if d > 0.7 and (X + Y + k) % 2 == 0:
                    continue
                if k >= 2 and _h(X, Y, k, semilla) % 100 < (k - 1) * 18:
                    continue
                lit = (-xx * 0.62 - yy * 0.78) / max(r, 0.5)
                tn = tonos[2] if lit > 0.45 else (tonos[0] if lit < -0.3 else tonos[1])
                if capa.dentro(X, Y) and capa.mat[Y, X] == VACIO:
                    capa.pon(X, Y, mat, tn, fx=True)


def deshilachar(capa: Capa, semilla: int = 0, prof: int = 4, ancho: int = 2, solo_bajo: float = 0.0):
    """Corta el borde INFERIOR de la parte en tiras de largo variable (jirones). `prof`: corte máximo (px)."""
    m = capa.mascara()
    cols = np.nonzero(m.any(axis=0))[0]
    if not len(cols):
        return
    for x in cols:
        ys = np.nonzero(m[:, x])[0]
        yb = ys.max()
        tira = (x + semilla) // max(1, ancho)
        corte = _h(semilla, tira) % (prof + 1)
        # diente: el centro de la tira llega más abajo que sus orillas
        pos = (x + semilla) % max(1, ancho)
        if ancho > 2 and (pos == 0 or pos == ancho - 1):
            corte += 1
        for y in range(yb, yb - corte, -1):
            if y >= 0 and m[y, x]:
                capa.mat[y, x] = VACIO


# ------------------------------------------------------------------------------------------------
#  Manos de dedos largos
# ------------------------------------------------------------------------------------------------

def garra_larga(capa: Capa, P, b, tipo: str, piel: str = 'piel', una: str = 'una', tam: float = 1.0,
                largo_una: int = 2, tonos=(1, 2, 3)):
    """Mano huesuda de dedos largos en la muñeca de `b` (salida de fk_brazo).
    tipo: 'garra' (dedos curvos, uñas al frente), 'abierta' (dedos extendidos y separados), 'puno'."""
    pi = P[piel]
    um = P[una] if una in P.idx else pi
    d = dir_ang(b['ang_ante'])
    n = (-d[1], d[0])
    w = b['muneca']
    palma = mas(w, d, 2.0 * tam)
    capa.elipse(palma, 2.5 * tam, 2.4 * tam, pi, tonos=tonos)
    if tipo == 'puno':
        capa.elipse(mas(palma, d, 1.2 * tam), 2.4 * tam, 2.4 * tam, pi, tonos=tonos)
        return
    abre = 1.0 if tipo == 'abierta' else 0.55
    for k, off in enumerate((-1.8, -0.6, 0.6, 1.8)):
        base = mas(mas(w, d, 3.4 * tam), n, off * tam * 0.9)
        dd = dir_ang(b['ang_ante'] + off * 9 * abre)
        L1 = (3.4 - abs(off) * 0.5) * tam
        nudillo = mas(base, dd, L1)
        # la segunda falange se dobla hacia la palma en la garra
        dobla = 0 if tipo == 'abierta' else 38 + k * 4
        dd2 = dir_ang(b['ang_ante'] + off * 9 * abre + dobla)
        punta = mas(nudillo, dd2, 2.6 * tam)
        capa.capsula(base, nudillo, 0.95 * tam, 0.8 * tam, pi, tonos=tonos)
        capa.capsula(nudillo, punta, 0.8 * tam, 0.6 * tam, pi, tonos=tonos if k % 2 else (tonos[0], tonos[0], tonos[1]))
        for j in range(largo_una):
            capa.pon_m(mas(punta, dd2, 1.0 + j), um, 2 if j == largo_una - 1 else 1)
    # pulgar
    pb = mas(mas(w, d, 2.0 * tam), n, -2.4 * tam)
    pt = mas(pb, dir_ang(b['ang_ante'] - 35), 2.6 * tam)
    capa.capsula(pb, pt, 0.9 * tam, 0.6 * tam, pi, tonos=(tonos[0], tonos[1], tonos[1]))
    capa.pon_m(mas(pt, dir_ang(b['ang_ante'] - 35), 1), um, 1)


# ------------------------------------------------------------------------------------------------
#  Criaturas sin rig humanoide
# ------------------------------------------------------------------------------------------------

class PC(dict):
    """Pose de criatura: diccionario de parámetros con valores por defecto y copia con cambios."""

    def con(self, **kw) -> 'PC':
        d = PC(self)
        d.update(kw)
        return d

    def g(self, k, por_defecto=0.0):
        return self.get(k, por_defecto)

    # para que generar/empaquetar puedan tratarla como Pose si hiciera falta
    @property
    def extra(self):
        return self


class Criatura:
    """Personaje dibujado por partes sin esqueleto humanoide. La subclase implementa `dibujar(lz, pose)`
    (en coordenadas del mundo: pivote = (0,0), y hacia abajo) y define fw, fh, pivote, paleta."""
    id = 'criatura'
    tipo = 'criatura'
    fw, fh = 160, 128
    pivote = (80, 124)
    alto = 100
    paleta = None

    def dibujar(self, lz: Lienzo, pose: PC):
        raise NotImplementedError

    def cuadro(self, pose: PC) -> np.ndarray:
        W, H = self.fw * 2, self.fh * 2
        ox, oy = W // 2, int(H * 0.72)
        lz = Lienzo(W, H, ox, oy, self.paleta)
        self.dibujar(lz, pose)
        lz.contorno_exterior()
        if pose.g('limpiar', 1):
            lz.limpiar()
        img = lz.rgba()
        fx = lz.fx.copy()
        alzar = int(pose.g('alzar', 0))
        solido = (img[..., 3] > 0) & ~fx
        ys = np.nonzero(solido.any(axis=1))[0]
        yb = ys.max() if len(ys) else oy
        if pose.g('sin_alinear', 0):
            yb = oy
        y0 = yb - self.pivote[1] + alzar
        x0 = ox - self.pivote[0]
        out = np.zeros((self.fh, self.fw, 4), np.uint8)
        sy0, sy1 = max(0, y0), min(H, y0 + self.fh)
        sx0, sx1 = max(0, x0), min(W, x0 + self.fw)
        out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = img[sy0:sy1, sx0:sx1]
        perdido = int((img[..., 3] > 0).sum()) - int((out[..., 3] > 0).sum())
        if perdido > 0:
            print(f'  AVISO {self.id}: {perdido} px quedan fuera del cuadro')
        return out
