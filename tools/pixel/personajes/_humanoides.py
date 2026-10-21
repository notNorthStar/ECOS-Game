"""
Utilidades compartidas del lote "humanoides" (María, la Llorona, encapuchados, nahual en forma humana y
Don Ernesto). Se apoya en `lib.py` / `humanoide.py` sin modificarlos.

  * `HumanoideX`: `Humanoide` + puntos de las piernas en el espacio local (sin el giro del cuerpo) para
    construir ropa que cuelga (faldas, túnicas, capas) y que gira con el cuerpo en rodadas y caídas.
  * `falda(...)`: falda / vestido / túnica que va de la cintura a un largo medido sobre las piernas: el borde
    sigue a la pierna más adelantada y a la más atrasada, con vuelo, viento (el borde se va hacia atrás),
    pliegues y borde rasgado opcional.
  * `pelo_largo(...)`: melena larga que cuelga detrás de la cabeza, con mechones y puntas sueltas.
  * `capa_trasera(...)`: capa que cae de los hombros por detrás, ondea con el viento y termina en jirones.
  * `rasgar(...)`: borde inferior en jirones (diente de sierra irregular pero determinista).
  * Efectos sin contorno: `chispas`, `humo`, `estela`.
  * `instalar_variantes(...)`: empaquetado con variantes (`variants` + `cuadrosPorVariante`) cuando se
    genera con `tools/pixel/generar.py`, que solo sabe empaquetar una variante: se envuelve su `empaquetar`
    desde aquí (sin editar generar.py) y además se escribe una hoja de revisión por variante.
"""
from __future__ import annotations

import math
import os
import sys
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import (Capa, Lienzo, Mapa, Pose, desplazar, dir_ang, fk_pierna, hoja_revision, lerp, mas,  # noqa: E402
                 previo, VACIO)
from humanoide import Humanoide  # noqa: E402

Punto = Tuple[float, float]


def variante(base: str, filas: Dict[int, str]) -> str:
    """Copia de un mapa de texto con algunas filas cambiadas (expresiones)."""
    ls = [l.strip() for l in base.strip('\n').split('\n')]
    for i, f in filas.items():
        ls[i] = f
    return '\n'.join(ls)


def lerp_p(a: Punto, b: Punto, t: float) -> Punto:
    return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t


# =============================================================================================
#  Esqueleto con ropa colgante
# =============================================================================================

class HumanoideX(Humanoide):
    """Humanoide con utilidades para ropa que cuelga."""

    def cadera_local(self, pose: Pose) -> Punto:
        return (pose.dx, -self.cadera_alto() + pose.dy)

    def piernas_locales(self, pose: Pose) -> Dict[str, Dict[str, Punto]]:
        cad = self.cadera_local(pose)
        out = {}
        for lado, sep in (('c', self.sep_cadera[0]), ('l', self.sep_cadera[1])):
            out[lado] = fk_pierna((cad[0] + sep, cad[1]), getattr(pose, 'muslo_' + lado),
                                  getattr(pose, 'rodilla_' + lado), getattr(pose, 'pie_' + lado),
                                  self.L_muslo, self.L_pierna, self.L_pie, self.alto_tobillo)
        return out

    def punto_pierna(self, pts: Dict[str, Punto], d: float) -> Punto:
        """Punto a `d` px de la cadera siguiendo muslo y pierna (local)."""
        if d <= self.L_muslo:
            return lerp_p(pts['cadera'], pts['rodilla'], d / self.L_muslo)
        t = min(1.2, (d - self.L_muslo) / self.L_pierna)
        return lerp_p(pts['rodilla'], pts['tobillo'], t)

    def cuadro(self, pose: Pose, depurar: bool = False) -> np.ndarray:
        """Como Humanoide.cuadro, más `extra['desvanece']` (0..1): el cuerpo se deshace con un tramado ordenado
        DESPUÉS del contorno (sin alpha parcial); los efectos (humo, luz) se conservan. La alineación de los pies
        se calcula antes de desvanecer."""
        W, H = self.fw * 2, self.fh * 2
        ox, oy = W // 2, int(H * 0.72)
        lz = Lienzo(W, H, ox, oy, self.paleta)
        c = self.ctx(pose)
        for nombre in self.orden(pose):
            fn = getattr(self, 'parte_' + nombre, None)
            if fn is None:
                continue
            for item in (fn(lz, c, pose) or []):
                capa, linea, oscuro = item[:3]
                lz.pegar(capa, linea=linea, oscuro=oscuro, proyecta=item[3] if len(item) > 3 else 0)
        self.retoques(lz, c, pose)
        lz.contorno_exterior()
        lz.limpiar()
        img = lz.rgba()
        fx = lz.fx.copy()
        alzar = int(pose.extra.get('alzar', 0))
        solido = (img[..., 3] > 0) & ~fx
        ys = np.nonzero(solido.any(axis=1))[0]
        yb = ys.max() if len(ys) else oy
        k = float(pose.extra.get('desvanece', 0))
        if k > 0:
            B = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
            yy, xx = np.mgrid[0:H, 0:W]
            s = int(pose.extra.get('fase', 0))
            quita = solido & (B[(yy + s) % 4, (xx + s) % 4] < k)
            img[quita] = 0
        y0 = yb - self.pivote[1] + alzar
        x0 = ox - self.pivote[0]
        out = np.zeros((self.fh, self.fw, 4), np.uint8)
        sy0, sy1 = max(0, y0), min(H, y0 + self.fh)
        sx0, sx1 = max(0, x0), min(W, x0 + self.fw)
        out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = img[sy0:sy1, sx0:sx1]
        perdido = int((img[..., 3] > 0).sum()) - int((out[..., 3] > 0).sum())
        if perdido > 0:
            print(f'  AVISO {self.id}: {perdido} px quedan fuera del cuadro ({pose.cara}, giro={pose.giro})')
        return out

    def cabeza_previa(self, c, pose):
        """Dónde quedará la cabeza (para colgar el pelo detrás antes de dibujarla)."""
        return previo(self.cabeza_mapa(pose), c['cuello'], c['M_cabeza'], 'cuello')


# =============================================================================================
#  Ropa
# =============================================================================================

def rasgar(capa: Capa, m: np.ndarray, semilla: int = 0, prof: int = 3, paso: int = 2, solo_mat: Optional[int] = None):
    """Recorta en jirones el borde de abajo de la máscara `m` (por columnas): puntas de 1–`prof` px.
    Determinista (depende de x y la semilla), así no parpadea entre cuadros más de lo que se mueve la tela."""
    ys, xs = np.nonzero(m)
    if not len(xs):
        return
    for x in np.unique(xs):
        col = np.nonzero(m[:, x])[0]
        yb = col.max()
        # patrón: grupos de `paso` columnas; cada grupo pierde 0..prof px
        g = (x + semilla) // paso
        h = ((g * 7 + semilla * 3) % (prof + 1))
        if (g + semilla) % 3 == 0:
            h = 0  # puntas largas
        for k in range(h):
            y = yb - k
            if y >= 0 and m[y, x] and (solo_mat is None or capa.mat[y, x] == solo_mat):
                capa.mat[y, x] = VACIO
                m[y, x] = False


def falda(cuerpo: HumanoideX, capa: Capa, c, pose: Pose, mat: int, cint_b: Punto, cint_f: Punto, largo: float,
          vuelo: float = 3.0, viento: float = 0.0, tonos=(1, 2, 3), cadera_ancho: Tuple[float, float] = (5.5, 5.0),
          pliegues: Sequence[float] = (0.3, 0.62), tono_pliegue: int = 1, rasgado: int = 0, semilla: int = 0,
          ondas: int = 0, borde: Optional[Tuple[int, int]] = None, alto_borde: int = 1) -> np.ndarray:
    """Falda que va de la cintura (puntos del mundo cint_b/cint_f, ya del torso) hasta `largo` px medidos sobre
    las piernas. Devuelve la máscara pintada.
    vuelo: cuánto sobresale el borde de las piernas · viento: el borde y la parte de atrás se van hacia atrás
    (correr, flotar) · ondas: ondulación del borde · borde: (material, tono) de una franja en el dobladillo."""
    T = c['T']
    pl = cuerpo.piernas_locales(pose)
    cad = cuerpo.cadera_local(pose)
    ps = [cuerpo.punto_pierna(pl[l], largo) for l in ('c', 'l')]
    pf = max(ps, key=lambda p: p[0])
    pb = min(ps, key=lambda p: p[0])
    # la falda no se cierra más que la cadera aunque las piernas se crucen
    ancho_min = cadera_ancho[0] + cadera_ancho[1] - 1
    if pf[0] - pb[0] < ancho_min:
        m = (pf[0] + pb[0]) / 2
        pf = (m + ancho_min / 2, pf[1])
        pb = (m - ancho_min / 2, pb[1])
    yb = max(pf[1], pb[1])
    hf = (pf[0] + vuelo, lerp(pf[1], yb, 0.5) + 1)
    hb = (pb[0] - vuelo - viento, lerp(pb[1], yb, 0.5) + 1 - viento * 0.35)
    # cadera (local) → mundo; la cintura viene del torso (ya en el mundo)
    cf = (cad[0] + cadera_ancho[0], cad[1] + 1)
    cb = (cad[0] - cadera_ancho[1] - viento * 0.25, cad[1] + 1)
    pts_borde = []
    n = 5
    for i in range(n + 1):
        t = i / n
        x = lerp(hf[0], hb[0], t)
        y = lerp(hf[1], hb[1], t) + math.sin(t * math.pi) * 1.2
        if ondas:
            y += math.sin(t * math.pi * 2 * ondas + semilla) * 0.9
        pts_borde.append((x, y))
    # rodillas: la tela las cubre (la pierna levantada empuja la falda hacia adelante o hacia atrás)
    def en_linea(a, b, y):
        if abs(b[1] - a[1]) < 1e-3:
            return a[0]
        t = min(1.0, max(0.0, (y - a[1]) / (b[1] - a[1])))
        return lerp(a[0], b[0], t)
    rods = [pl[l]['rodilla'] for l in ('c', 'l')]
    rf = max(rods, key=lambda p: p[0])
    rb = min(rods, key=lambda p: p[0])
    kf = (max(en_linea(cf, hf, rf[1]), rf[0] + 2.5), min(rf[1], hf[1] - 2))
    kb = (min(en_linea(cb, hb, rb[1]), rb[0] - 2.5), min(rb[1], hb[1] - 2))
    poly = [cint_b, cint_f, T(cf), T(kf)] + [T(p) for p in pts_borde] + [T(kb), T(cb)]
    m = capa.poligono(poly, mat, sombreado=tonos, ks=2, kl=1)
    if rasgado:
        rasgar(capa, m, semilla, rasgado)
    # pliegues: líneas del lado en sombra desde un tercio de la falda hasta el borde
    for f in pliegues:
        a = lerp_p(lerp_p(cint_b, cint_f, f), lerp_p(T(hb), T(hf), f), 0.35)
        b = lerp_p(T(hb), T(hf), f)
        b = (b[0], b[1] - 1)
        _linea_en(capa, m, a, b, mat, tono_pliegue)
        # luz junto al pliegue (volumen de la tela)
        _linea_en(capa, m, (a[0] - 1, a[1] + 2), (b[0] - 1, b[1] - 1), mat, tonos[2], solo_tono=tonos[1])
    if borde:
        bm, bt = borde
        # franja del dobladillo: a menos de alto_borde+1 px del borde de abajo, sin la última fila
        dob = m & ~desplazar(m, 0, -(alto_borde + 1)) & desplazar(m, 0, -1)
        capa.mat[dob] = bm
        capa.ton[dob] = bt
    return m


def _linea_en(capa: Capa, m: np.ndarray, a: Punto, b: Punto, mat: int, ton: int, solo_tono: Optional[int] = None):
    """Línea solo dentro de la máscara (y opcionalmente solo sobre píxeles de un tono)."""
    x0, y0 = capa.a_px(a)
    x1, y1 = capa.a_px(b)
    n = max(abs(x1 - x0), abs(y1 - y0), 1)
    for i in range(n + 1):
        x = int(round(lerp(x0, x1, i / n)))
        y = int(round(lerp(y0, y1, i / n)))
        if capa.dentro(x, y) and m[y, x] and capa.mat[y, x] == mat:
            if solo_tono is None or capa.ton[y, x] == solo_tono:
                capa.ton[y, x] = ton


def pelo_largo(capa: Capa, raiz: Punto, largo: float, ancho: float, mat: int, viento: float = 0.0,
               R: Optional[np.ndarray] = None, mechones: int = 4, fase: float = 0.0, tonos=(0, 1, 2),
               volumen: float = 1.0, abajo: Punto = (0.0, 1.0)):
    """Melena que cuelga desde `raiz` (nuca). `viento` la lleva hacia atrás (−x) y arriba en la punta.
    R: rotación del cuerpo (rodadas: el pelo acompaña). `abajo`: dirección de caída (local)."""
    R = R if R is not None else np.eye(2)

    def W(dx, dy):
        v = R @ np.array([dx, dy])
        return raiz[0] + v[0], raiz[1] + v[1]

    def curva(t, off=0.0):
        # caída con viento: se va hacia atrás cada vez más y la punta sube un poco
        x = abajo[0] * largo * t - viento * (t ** 1.4) * 1.0 + off + math.sin(t * 5 + fase) * 0.6 * t
        y = abajo[1] * largo * t - viento * 0.45 * (t ** 2)
        return x, y

    # masa principal: cápsulas que se ensanchan y luego se adelgazan
    N = 8
    pts = [curva(i / N) for i in range(N + 1)]
    for i in range(N):
        t0, t1 = i / N, (i + 1) / N
        r0 = ancho * volumen * (0.5 + 0.55 * math.sin(min(1, t0 * 1.8) * math.pi / 2)) * (1 - 0.3 * t0 ** 2)
        r1 = ancho * volumen * (0.5 + 0.55 * math.sin(min(1, t1 * 1.8) * math.pi / 2)) * (1 - 0.3 * t1 ** 2)
        a = W(pts[i][0] - 1.0 * t0, pts[i][1])
        b = W(pts[i + 1][0] - 1.0 * t1, pts[i + 1][1])
        capa.capsula(a, b, r0 / 2, r1 / 2, mat, tonos=tonos, sombra=-0.1, brillo=0.6)
    # mechones de las puntas: largos distintos, se abren
    for k in range(mechones):
        f = (k + 0.5) / mechones - 0.5
        extra = 3 + ((k * 5 + int(fase * 3)) % 4)
        a = curva(0.72, f * ancho * 0.7)
        b = curva(1.0 + extra / max(largo, 1), f * ancho * 1.1)
        capa.capsula(W(*a), W(*b), 1.3, 0.6, mat, tonos=tonos)
    # mechas a lo largo: oscuras entre mechones y claras (brillo) del lado de la luz
    for k, (f, tono) in enumerate(((-0.34, tonos[2]), (-0.12, tonos[0]), (0.05, tonos[2]), (0.22, tonos[0]),
                                   (0.36, tonos[0]))):
        prev = None
        for i in range(1, N + 1):
            t = i / N * 0.97
            p = curva(t, f * ancho * (0.7 + 0.5 * t) + 0.4 * math.sin(t * 7 + k + fase))
            p = W(p[0] - 1.0 * t, p[1])
            if prev and (tono == tonos[0] or i < N * 0.75):
                _linea_en(capa, capa.mascara(), prev, p, mat, tono)
            prev = p
    # brillo del pelo arriba (luz arriba-izquierda): un trazo claro corto
    for i in range(1, 3):
        p = curva(0.12 * i, -ancho * 0.2)
        x, y = capa.a_px(W(*p))
        if capa.dentro(x, y) and capa.mat[y, x] == mat:
            capa.ton[y, x] = min(tonos[2] + 1, 3)


def capa_trasera(capa: Capa, hombro: Punto, largo: float, ancho: float, mat: int, viento: float, R=None,
                 tonos=(0, 1, 2), rasgado: int = 3, semilla: int = 0, fase: float = 0.0) -> np.ndarray:
    """Capa que cae desde el hombro por detrás del cuerpo: un trapecio que se abre hacia atrás con el viento,
    con ondas y jirones en el borde."""
    R = R if R is not None else np.eye(2)

    def W(dx, dy):
        v = R @ np.array([dx, dy])
        return hombro[0] + v[0], hombro[1] + v[1]

    pts = [W(2, -1), W(-2, -2)]
    n = 6
    # borde de atrás: baja y se abre hacia atrás
    for i in range(1, n + 1):
        t = i / n
        x = -2 - ancho * 0.5 * t - viento * t ** 1.3 + math.sin(t * 4 + fase) * 1.0 * t
        y = largo * t - viento * 0.5 * t ** 2
        pts.append(W(x, y))
    # borde de abajo, hacia adelante
    xb, yb = -2 - ancho * 0.5 - viento, largo - viento * 0.5
    for i in range(1, 4):
        t = i / 4
        pts.append(W(lerp(xb, 3, t), lerp(yb, largo - 1, t) + math.sin(t * 6 + fase) * 1.0))
    pts.append(W(3, largo * 0.5))
    m = capa.poligono(pts, mat, sombreado=tonos, ks=2, kl=1)
    if rasgado:
        rasgar(capa, m, semilla, rasgado)
    return m


# =============================================================================================
#  Efectos (sin contorno)
# =============================================================================================

def chispas(lz: Lienzo, centros: Sequence[Punto], mat: int, fase: int, tono_alto: int = 3, tono_bajo: int = 1,
            pts=((-3, -4), (4, -6), (1, -9), (-5, 1), (6, -1), (2, 3))):
    """Chispas de luz alrededor de puntos (posiciones fijas por cuadro, sin azar)."""
    for w in centros:
        for j, (dx, dy) in enumerate(pts):
            if (j + fase) % 3 == 0:
                px, py = lz.a_px((w[0] + dx, w[1] + dy - fase))
                if not lz.dentro(px, py):
                    continue
                lz.pon(px, py, mat, tono_alto, fx=True)
                if (j + fase) % 2 == 0:
                    for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        if lz.dentro(px + ex, py + ey) and lz.mat[py + ey, px + ex] < 0:
                            lz.pon(px + ex, py + ey, mat, tono_bajo, fx=True)


def humo(lz: Lienzo, centro: Punto, k: float, mat: int, n: int = 7, radio: float = 12, sube: float = 10,
         tonos=(0, 1, 2), semilla: int = 0):
    """Bocanadas de humo (círculos tramados, sin contorno) que suben y se dispersan con k (0..1)."""
    for i in range(n):
        a = (i * 2.399 + semilla) % (2 * math.pi)
        d = radio * (0.3 + 0.7 * ((i * 37 + semilla) % 10) / 10) * (0.6 + 0.6 * k)
        cx = centro[0] + math.cos(a) * d
        cy = centro[1] + math.sin(a) * d * 0.6 - sube * k * (0.5 + (i % 3) * 0.25)
        r = (2.2 + (i % 3)) * (1.0 + 0.5 * k) * (1.0 - 0.45 * k)
        x0, y0 = lz.a_px((cx, cy))
        R = int(math.ceil(r))
        for yy in range(-R, R + 1):
            for xx in range(-R, R + 1):
                dd = math.hypot(xx, yy)
                if dd > r:
                    continue
                X, Y = x0 + xx, y0 + yy
                if not lz.dentro(X, Y):
                    continue
                # tramado que se abre con k (se disipa)
                if (k > 0.2 or dd > r - 1) and (X + Y + i) % 2 == 0:
                    continue
                if k > 0.8 and (X * 3 + Y) % 3 != 0:
                    continue
                t = tonos[2] if (xx + yy) < -r * 0.3 else (tonos[0] if (xx + yy) > r * 0.5 else tonos[1])
                lz.pon(X, Y, mat, t, fx=True)


def estela(lz: Lienzo, pts: Sequence[Punto], mat: int, tonos=(1, 2, 3), tramado: bool = True):
    """Estela de luz (fx) a lo largo de una polilínea: más brillante al principio."""
    n = len(pts)
    for i in range(n - 1):
        a, b = pts[i], pts[i + 1]
        x0, y0 = lz.a_px(a)
        x1, y1 = lz.a_px(b)
        m = max(abs(x1 - x0), abs(y1 - y0), 1)
        t = tonos[2] if i < n * 0.34 else (tonos[1] if i < n * 0.67 else tonos[0])
        for j in range(m + 1):
            x = int(round(lerp(x0, x1, j / m)))
            y = int(round(lerp(y0, y1, j / m)))
            if tramado and i >= n * 0.67 and (x + y) % 2:
                continue
            if lz.dentro(x, y) and (lz.mat[y, x] < 0 or lz.fx[y, x]):
                lz.pon(x, y, mat, t, fx=True)


def desvanecer(img: np.ndarray, k: float, semilla: int = 0) -> np.ndarray:
    """Quita píxeles con un tramado ordenado (Bayer 4×4) para que el personaje se desvanezca sin alpha parcial."""
    if k <= 0:
        return img
    B = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    umbral = B[(yy + semilla) % 4, (xx + semilla) % 4]
    out = img.copy()
    out[umbral < k] = 0
    return out


# =============================================================================================
#  Empaquetado con variantes (envuelve el empaquetar de generar.py sin editarlo)
# =============================================================================================

def instalar_variantes(pid: str, variantes: Sequence[str], render: Callable[[str, Pose], np.ndarray]):
    """Cuando `tools/pixel/generar.py` empaquete `pid`, vuelve a dibujar cada pose en cada variante y arma la hoja
    con bloques consecutivos de `cuadrosPorVariante` cuadros (el formato que lee CharacterKits.ts).
    La primera variante es la que generar.py ya dibujó (y la que muestra su hoja de revisión); además se guarda
    `arte-fuente/pixel/revision/<pid>_variantes.png` con el reposo, caminar, ataque y conjuro de cada una."""
    for nombre in ('__main__', 'generar'):
        g = sys.modules.get(nombre)
        if g is None or not hasattr(g, 'empaquetar') or getattr(g, 'GEN', None) != 'tools/pixel/generar.py':
            continue
        orig = g.empaquetar
        if getattr(orig, '_variantes', None) is not None:
            orig._variantes[pid] = (list(variantes), render)
            continue

        def envuelto(p, cuadros, anims, fw, fh, pivote, tipo, alto, columnas=8, extra=None, _orig=orig, _g=g):
            reg = envuelto._variantes.get(p)
            if not reg:
                return _orig(p, cuadros, anims, fw, fh, pivote, tipo, alto, columnas, extra)
            vs, rend = reg
            return _empaquetar_variantes(p, vs, rend, cuadros, anims, fw, fh, pivote, tipo, alto, columnas, extra,
                                         getattr(_g, 'REV', None))

        envuelto._variantes = {pid: (list(variantes), render)}
        g.empaquetar = envuelto


def _empaquetar_variantes(pid, vs, render, cuadros0, anims, fw, fh, pivote, tipo, alto, columnas, extra, rev_dir):
    from lib import contar_colores
    # cuadros de cada variante (la primera ya viene dibujada)
    por_var: Dict[str, Dict[str, List[np.ndarray]]] = {vs[0]: cuadros0}
    for v in vs[1:]:
        por_var[v] = {m: [render(v, pose) for pose in anims[m].poses] for m in cuadros0}
    # índices únicos compartidos: la clave es la tupla de los cuadros de TODAS las variantes
    claves: Dict[bytes, int] = {}
    unicos: List[Tuple[str, int]] = []
    animaciones = {}
    for motion, lista in cuadros0.items():
        idxs = []
        for n in range(len(lista)):
            k = b''.join(por_var[v][motion][n].tobytes() for v in vs)
            if k not in claves:
                claves[k] = len(unicos)
                unicos.append((motion, n))
            idxs.append(claves[k])
        a = anims[motion]
        animaciones[motion] = {'frames': idxs, 'fps': a.fps, 'loop': a.loop}
    n = len(unicos)
    total = n * len(vs)
    cols = min(columnas, total)
    rows = (total + cols - 1) // cols
    sheet = np.zeros((rows * fh, cols * fw, 4), np.uint8)
    frames = []
    for vi, v in enumerate(vs):
        for i, (motion, k) in enumerate(unicos):
            j = vi * n + i
            x, y = (j % cols) * fw, (j // cols) * fh
            sheet[y:y + fh, x:x + fw] = por_var[v][motion][k]
            vista = 'lado_der' if (i == 0) else f'{motion}_{k + 1}'
            frames.append({'name': f'{pid}_{v}_{motion}_{k + 1}', 'vista': vista, 'x': x, 'y': y, 'w': fw, 'h': fh})
    for v in vs:
        nc = contar_colores([por_var[v][m][k] for m, k in unicos])
        print(f'  variante {v}: {nc} colores' + ('  AVISO más de 32' if nc > 32 else ''))
    js = {
        'personaje': pid, 'tipo': tipo, 'frameWidth': fw, 'frameHeight': fh,
        'pivot': {'x': pivote[0], 'y': pivote[1]}, 'frames': frames, 'escala': 1, 'animaciones': animaciones,
        'cuadrosPorVariante': n, 'generadoPor': 'tools/pixel/generar.py', 'alto': alto, 'variants': list(vs),
    }
    if extra:
        js.update(extra)
    if rev_dir:
        try:
            os.makedirs(rev_dir, exist_ok=True)
            sel = [m for m in ('reposo', 'caminar', 'correr', 'ataque', 'conjuro', 'dano', 'aturdido', 'morir') if m in cuadros0]
            filas = {}
            an = {}
            for v in vs:
                lst = []
                for m in sel:
                    lst += por_var[v][m]
                filas[v] = lst
                from lib import Anim
                an[v] = Anim([], 0, False)
            hoja_revision(pid, filas, an, 3, pivote).save(os.path.join(rev_dir, f'{pid}_variantes.png'))
        except Exception as e:  # la revisión no debe tumbar el kit
            print('  (no se pudo escribir la revisión de variantes:', e, ')')
    return sheet, js
