"""Utilidades compartidas del lote "criaturas" (chaneque, balam, balam_jaguar, bestia, nahual_animal).

Contenido
---------
* `instalar_variantes(personaje, variantes)`: `generar.py` solo sabe empaquetar UNA versión por kit. Los kits
  con `variants` (bestia: '1'/'3'; nahual_animal: 'lobo'/'ave') necesitan que la variante k ocupe los cuadros
  k·n … k·n+n−1 con el MISMO orden interno. Sin tocar `generar.py`, el módulo del personaje llama a esta función
  al importarse: envuelve el `empaquetar` que ve `generar.py` (solo para ese id) y
    - vuelve a dibujar cada pose con cada variante (`personaje.variante = v`),
    - deduplica los cuadros con la clave CONJUNTA de todas las variantes (así los índices coinciden),
    - escribe `variants` y `cuadrosPorVariante` en el JSON (formato de src/systems/CharacterKits.ts),
    - guarda una hoja de revisión extra por variante: `arte-fuente/pixel/revision/<id>_<variante>.png`.
* `Cuadrupedo` + `PoseQ`: rig 2D de perfil para cuadrúpedos (Balam, Balam jaguar). Patas por cinemática
  INVERSA: cada pata se define por dónde pisa (adelanto, altura) y el ángulo del metacarpo/metatarso; codo y
  rodilla salen solos (codo hacia atrás, rodilla hacia adelante, corvejón atrás), así las patas apoyadas no
  resbalan y los ciclos de paso se escriben como posiciones del pie.
* `disolver(img, t, …)`: deshace un cuadro en humo (tramado de Bayer + volutas que suben): `morir` sin violencia.
* `chispas(lz, …)`: destellos fx (sin contorno) alrededor de un centro.
"""
from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass, field, replace
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Lienzo, Mapa, Paleta, Pose, dir_ang, hoja_revision, lerp, mas, mat_rot  # noqa: E402
from humanoide import Humanoide  # noqa: E402
from anim_humano import CAMINAR, CORRER  # noqa: E402

Punto = Tuple[float, float]


# =============================================================================================
#  Variantes en generar.py (sin editarlo)
# =============================================================================================

def instalar_variantes(personaje, variantes: Sequence[str]):
    """Hace que `generar.py` empaquete `personaje` con todas sus `variantes` (ver doc del módulo)."""
    variantes = list(variantes)
    personaje.variante = variantes[0]
    for mod in list(sys.modules.values()):
        g = getattr(mod, '__dict__', None)
        if not isinstance(g, dict) or 'empaquetar' not in g or 'generar' not in g or 'KITS' not in g:
            continue
        orig = g['empaquetar']
        hechos = getattr(orig, '_criaturas_ids', set())
        if personaje.id in hechos:
            continue

        def envoltura(pid, cuadros, anims, fw, fh, pivote, tipo, alto, columnas=8, extra=None, _orig=orig, _g=g):
            if pid != personaje.id:
                return _orig(pid, cuadros, anims, fw, fh, pivote, tipo, alto, columnas, extra)
            return empaquetar_variantes(personaje, variantes, cuadros, anims, fw, fh, pivote, tipo, alto,
                                        columnas, extra, _g.get('REV'))

        envoltura._criaturas_ids = set(hechos) | {personaje.id}
        g['empaquetar'] = envoltura


def empaquetar_variantes(P, variantes, cuadros0, anims, fw, fh, pivote, tipo, alto, columnas=8, extra=None,
                         rev_dir=None):
    pid = P.id
    previa = getattr(P, 'variante', variantes[0])
    por_var: Dict[str, Dict[str, List[np.ndarray]]] = {}
    for v in variantes:
        if v == previa:
            por_var[v] = cuadros0
            continue
        P.variante = v
        por_var[v] = {m: [P.cuadro(p) for p in anims[m].poses] for m in cuadros0}
    P.variante = previa
    claves: Dict[bytes, int] = {}
    orden: List[Tuple[str, int]] = []
    animaciones = {}
    for m, lista in cuadros0.items():
        idxs = []
        for n in range(len(lista)):
            k = b''.join(por_var[v][m][n].tobytes() for v in variantes)
            if k not in claves:
                claves[k] = len(orden)
                orden.append((m, n))
            idxs.append(claves[k])
        a = anims[m]
        animaciones[m] = {'frames': idxs, 'fps': a.fps, 'loop': a.loop}
    npv = len(orden)
    total = npv * len(variantes)
    cols = min(columnas, total)
    rows = (total + cols - 1) // cols
    sheet = np.zeros((rows * fh, cols * fw, 4), np.uint8)
    frames = []
    for vi, v in enumerate(variantes):
        for i, (m, n) in enumerate(orden):
            gi = vi * npv + i
            x, y = (gi % cols) * fw, (gi // cols) * fh
            sheet[y:y + fh, x:x + fw] = por_var[v][m][n]
            vista = 'lado_der' if (m == 'reposo' and n == 0) else f'{m}_{n + 1}'
            frames.append({'name': f'{pid}_{v}_{m}_{n + 1}', 'vista': vista, 'x': x, 'y': y, 'w': fw, 'h': fh})
    js = {
        'personaje': pid,
        'tipo': tipo,
        'frameWidth': fw,
        'frameHeight': fh,
        'pivot': {'x': pivote[0], 'y': pivote[1]},
        'frames': frames,
        'escala': 1,
        'animaciones': animaciones,
        'cuadrosPorVariante': npv,
        'generadoPor': 'tools/pixel/generar.py',
        'alto': alto,
        'variants': list(variantes),
    }
    if extra:
        js.update(extra)
    if rev_dir:
        os.makedirs(rev_dir, exist_ok=True)
        for v in variantes:
            hoja_revision(pid, por_var[v], anims, 4, pivote).save(os.path.join(rev_dir, f'{pid}_{v}.png'))
    print(f'  {pid}: variantes {variantes}, {npv} cuadros por variante')
    return sheet, js


# =============================================================================================
#  Encuadre común (igual que Humanoide.cuadro)
# =============================================================================================

def encuadrar(lz: Lienzo, fw: int, fh: int, pivote: Tuple[int, int], alzar: int = 0, pid: str = '?') -> np.ndarray:
    img = lz.rgba()
    solido = (img[..., 3] > 0) & ~lz.fx
    ys = np.nonzero(solido.any(axis=1))[0]
    yb = ys.max() if len(ys) else lz.oy
    y0 = yb - pivote[1] + alzar
    x0 = lz.ox - pivote[0]
    H, W = img.shape[:2]
    out = np.zeros((fh, fw, 4), np.uint8)
    sy0, sy1 = max(0, y0), min(H, y0 + fh)
    sx0, sx1 = max(0, x0), min(W, x0 + fw)
    out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = img[sy0:sy1, sx0:sx1]
    perdido = int((img[..., 3] > 0).sum()) - int((out[..., 3] > 0).sum())
    if perdido > 0:
        print(f'  AVISO {pid}: {perdido} px quedan fuera del cuadro')
    return out


# =============================================================================================
#  Efectos
# =============================================================================================

BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], float) / 16.0


def disolver(img: np.ndarray, t: float, humo: Sequence[Tuple[int, int, int]], semilla: int = 0,
             subida: int = 6) -> np.ndarray:
    """Deshace el cuadro en humo: con t = 0 queda igual; con t = 1 no queda nada sólido.
    La disolución avanza de ARRIBA hacia abajo con tramado de Bayer, y parte de los píxeles que se van se
    convierten en volutas de `humo` (colores de la paleta) que suben y se abren."""
    if t <= 0:
        return img
    out = img.copy()
    a = img[..., 3] > 0
    ys, xs = np.nonzero(a)
    if not len(ys):
        return out
    y0, y1 = ys.min(), ys.max()
    h = max(1, y1 - y0)
    quitar = np.zeros(a.shape, bool)
    for y, x in zip(ys, xs):
        alto = 1.0 - (y - y0) / h               # 1 arriba, 0 en los pies
        umbral = t * 1.6 - (1 - alto) * 0.6       # empieza por arriba
        if BAYER4[y % 4, x % 4] < umbral:
            quitar[y, x] = True
    out[quitar] = 0
    # volutas: de los píxeles quitados, algunos suben como humo
    qy, qx = np.nonzero(quitar)
    H, W = a.shape
    for k, (y, x) in enumerate(zip(qy, qx)):
        hsh = (x * 73856093 ^ y * 19349663 ^ semilla * 83492791) & 0xffff
        if hsh % 7:
            continue
        sube = int(subida * t + (hsh >> 4) % 4)
        nx = x + ((hsh >> 8) % 3) - 1
        ny = y - sube
        if 0 <= ny < H and 0 <= nx < W and out[ny, nx, 3] == 0:
            c = humo[(hsh >> 2) % len(humo)]
            out[ny, nx, :3] = c
            out[ny, nx, 3] = 255
    return out


def chispas(lz: Lienzo, centro: Punto, mat: int, fase: int, radio: float = 16, n: int = 7, tono_alto: int = 3,
            tono_bajo: int = 1, subida: float = 2.0, cruz: bool = True):
    """Destellos (fx: sin contorno) repartidos alrededor de `centro`; `fase` los hace subir y alternar."""
    for j in range(n):
        ang = j * 2.399 + 0.7
        r = radio * (0.55 + 0.45 * ((j * 37) % 10) / 10)
        if (j + fase) % 2:
            continue
        x, y = lz.a_px((centro[0] + math.cos(ang) * r, centro[1] + math.sin(ang) * r * 0.8 - fase * subida))
        if not lz.dentro(x, y):
            continue
        lz.pon(x, y, mat, tono_alto, fx=True)
        if cruz and (j + fase) % 4 == 0:
            for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if lz.dentro(x + ex, y + ey) and lz.mat[y + ey, x + ex] < 0:
                    lz.pon(x + ex, y + ey, mat, tono_bajo, fx=True)


# =============================================================================================
#  Rig de cuadrúpedo
# =============================================================================================

@dataclass
class PoseQ:
    """Pose de un cuadrúpedo de perfil (mirando a la derecha). Ángulos en grados (convención de lib.dir_ang:
    0 = abajo, +90 = adelante, 180 = arriba, −90 = atrás).

    lomo: inclinación del lomo (+ = los hombros suben: se encabrita). alto: altura extra del cuerpo (px, +
    arriba; para agacharse, negativo). cuello: dirección del cuello (dir_ang). cabeza: giro de la cabeza (+ =
    el hocico baja). Patas: `dc`/`dl` delanteras (cercana/lejana), `tc`/`tl` traseras: (adelanto del pie
    respecto a su raíz en px, altura del pie sobre el suelo en px, ángulo del metacarpo/metatarso).
    cola: (ángulo de la base, curvatura —crece hacia la punta—, ondulación)."""
    lomo: float = 0
    alto: float = 0
    dx: float = 0
    cuello: float = 140
    cabeza: float = 0
    dc: Tuple[float, float, float] = (1, 0, 8)
    dl: Tuple[float, float, float] = (-1, 0, 8)
    tc: Tuple[float, float, float] = (1, 0, 20)
    tl: Tuple[float, float, float] = (-1, 0, 20)
    cola: Tuple[float, float, float] = (-120, 18, 0)
    giro: float = 0
    boca: float = 0
    ojos: str = 'normal'
    orejas: float = 0
    extra: Dict[str, object] = field(default_factory=dict)

    def con(self, **kw) -> 'PoseQ':
        ex = dict(self.extra)
        ex.update(kw.pop('extra', {}) or {})
        return replace(self, extra=ex, **kw)


_NUM = ['lomo', 'alto', 'dx', 'cuello', 'cabeza', 'giro', 'boca', 'orejas']


def mezclarq(a: PoseQ, b: PoseQ, t: float) -> PoseQ:
    base = a if t < 0.5 else b
    kw = {k: lerp(getattr(a, k), getattr(b, k), t) for k in _NUM}
    for k in ('dc', 'dl', 'tc', 'tl', 'cola'):
        kw[k] = tuple(lerp(x, y, t) for x, y in zip(getattr(a, k), getattr(b, k)))
    return replace(base, **kw)


def ik2(R: Punto, W: Punto, a: float, b: float, adelante: bool) -> Punto:
    """Articulación intermedia de una cadena de 2 huesos R→J→W. `adelante`: la articulación queda del lado
    de +x respecto a la recta R→W (rodilla trasera) o del lado de −x (codo delantero)."""
    dx, dy = W[0] - R[0], W[1] - R[1]
    d = math.hypot(dx, dy) or 1e-6
    dd = min(max(d, abs(a - b) + 0.01), a + b - 0.01)
    ang = math.atan2(dy, dx)
    cA = (a * a + dd * dd - b * b) / (2 * a * dd)
    A = math.acos(max(-1.0, min(1.0, cA)))
    mejor = None
    for s in (1, -1):
        J = (R[0] + a * math.cos(ang + s * A), R[1] + a * math.sin(ang + s * A))
        cruz = dx * (J[1] - R[1]) - dy * (J[0] - R[0])
        # cruz < 0 → la articulación queda a la izquierda de R→W mirando hacia W (hacia +x si la pata baja)
        if (cruz < 0) == adelante:
            mejor = J
    return mejor if mejor is not None else (R[0] + a * math.cos(ang), R[1] + a * math.sin(ang))


class Cuadrupedo:
    """Base de un cuadrúpedo. La subclase define medidas, paleta y cómo se pinta cada parte:
    `pata(capa, pts, lado, delantera, pose)`, `cuerpo(capa, c, pose)`, `cola(capa, pts, pose)`,
    `cabeza(lz, c, pose) -> [(capa, linea, oscuro[, proyecta])]` y opcionalmente `retoques(lz, c, pose)`."""
    id = 'cuadrupedo'
    tipo = 'criatura'
    fw, fh = 64, 48
    pivote = (32, 45)
    alto = 40
    paleta: Paleta
    # medidas
    L_lomo = 20                  # cadera → hombro
    alto_cuerpo = 18             # altura del eje del cuerpo (cadera/hombro) sobre el suelo, de pie
    del_seg = (7, 7, 3)          # delantera: brazo, antebrazo, metacarpo
    tra_seg = (8, 7, 5)          # trasera: muslo, pierna, metatarso
    alto_pata = 1.5              # altura de la almohadilla (el pie pisa a esta altura)
    sep_patas = 1.5              # separación horizontal entre la pata cercana y la lejana
    L_cuello = 6
    cola_n, cola_L = 7, 3.0      # segmentos de la cola y su largo

    # ------------------------------------------------------------------------------------------
    def ctx(self, pose: PoseQ) -> Dict[str, object]:
        r = math.radians(pose.lomo)
        u = (math.cos(r), -math.sin(r))                      # eje del lomo: de la cadera al hombro
        cen = (pose.dx, -(self.alto_cuerpo + pose.alto))
        H = mas(cen, u, -self.L_lomo / 2)
        S = mas(cen, u, self.L_lomo / 2)
        R = mat_rot(pose.giro)

        def T(p):
            v = R @ np.array([p[0] - cen[0], p[1] - cen[1]])
            return cen[0] + v[0], cen[1] + v[1]

        # n_up = perpendicular al lomo hacia ARRIBA (lado del lomo); −n_up = lado de la panza
        n_up = (u[1], -u[0])
        c: Dict[str, object] = {'centro': cen, 'u': u, 'n': n_up, 'T': T, 'R': R, 'H': H, 'S': S}
        for nombre, raiz, segs, delantera in (('dc', S, self.del_seg, True), ('dl', S, self.del_seg, True),
                                               ('tc', H, self.tra_seg, False), ('tl', H, self.tra_seg, False)):
            adel, alt, a3 = getattr(pose, nombre)
            sep = self.sep_patas if nombre.endswith('c') else -self.sep_patas
            Rr = (raiz[0] + sep * 0.5, raiz[1])
            suelo = 0.0
            P = (Rr[0] + adel, suelo - alt - self.alto_pata)
            W = mas(P, dir_ang(a3), -segs[2])
            J = ik2(Rr, W, segs[0], segs[1], adelante=not delantera)
            pts = {'raiz': Rr, 'medio': J, 'muneca': W, 'pie': P, 'a3': a3}
            pts = {k: (T(v) if isinstance(v, tuple) else v - pose.giro) for k, v in pts.items()}
            c['pata_' + nombre] = pts
        c['cadera'] = T(H)
        c['hombro'] = T(S)
        # ejes ya girados (para pintar el cuerpo en coordenadas del lomo)
        ur = R @ np.array(u)
        nr = R @ np.array(n_up)
        c['u'] = (float(ur[0]), float(ur[1]))
        c['n'] = (float(nr[0]), float(nr[1]))
        # cuello y cabeza
        base_cuello = mas(S, n_up, 2)
        fin_cuello = mas(base_cuello, dir_ang(pose.cuello), self.L_cuello)
        c['cuello0'] = T(base_cuello)
        c['cuello1'] = T(fin_cuello)
        # cola
        pts = [mas(H, u, -1)]
        ang = pose.cola[0]
        for k in range(self.cola_n):
            # curvatura creciente hacia la punta (la cola se enrosca al final) + ondulación
            kk = k / max(1, self.cola_n - 1)
            ang2 = ang + pose.cola[1] * self.cola_n * kk * kk + pose.cola[2] * math.sin(k * 0.9)
            pts.append(mas(pts[-1], dir_ang(ang2), self.cola_L))
        c['cola'] = [T(p) for p in pts]
        return c

    # ------------------------------------------------------------------------------------------
    def orden(self, pose: PoseQ) -> List[str]:
        return ['cola', 'pata_dl', 'pata_tl', 'cuerpo', 'pata_tc', 'pata_dc', 'cabeza']

    def parte_cola(self, lz, c, pose):
        p = lz.parte()
        self.cola(p, c['cola'], pose)
        return [(p, 'contorno', 0)]

    def _parte_pata(self, lz, c, pose, nombre):
        p = lz.parte()
        lejana = nombre.endswith('l')
        self.pata(p, c['pata_' + nombre], 'l' if lejana else 'c', nombre.startswith('d'), pose)
        return [(p, 'contorno', 1 if lejana else 0, 0 if lejana else 1)]

    def parte_pata_dl(self, lz, c, pose):
        return self._parte_pata(lz, c, pose, 'dl')

    def parte_pata_tl(self, lz, c, pose):
        return self._parte_pata(lz, c, pose, 'tl')

    def parte_pata_dc(self, lz, c, pose):
        return self._parte_pata(lz, c, pose, 'dc')

    def parte_pata_tc(self, lz, c, pose):
        return self._parte_pata(lz, c, pose, 'tc')

    def parte_cuerpo(self, lz, c, pose):
        p = lz.parte()
        self.cuerpo(p, c, pose)
        return [(p, 'contorno', 0)]

    def parte_cabeza(self, lz, c, pose):
        return self.cabeza(lz, c, pose)

    def retoques(self, lz, c, pose):
        pass

    def post(self, img: np.ndarray, pose: PoseQ) -> np.ndarray:
        return img

    def cuadro(self, pose: PoseQ) -> np.ndarray:
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
        img = encuadrar(lz, self.fw, self.fh, self.pivote, int(pose.extra.get('alzar', 0)), self.id)
        return self.post(img, pose)


# ---- utilidades de pose para ciclos de paso ----------------------------------------------------

def paso(fase: float, zancada: float, alza: float, apoyo: float = 0.6) -> Tuple[float, float]:
    """Posición del pie en un ciclo (fase 0–1): durante el `apoyo` el pie va de +zancada/2 a −zancada/2 pegado
    al suelo; el resto del ciclo vuelve por el aire en arco. Devuelve (adelanto, altura)."""
    f = fase % 1.0
    if f < apoyo:
        k = f / apoyo
        return zancada * (0.5 - k), 0.0
    k = (f - apoyo) / (1 - apoyo)
    x = zancada * (-0.5 + k)
    y = alza * math.sin(k * math.pi)
    return x, y


def con_patas(ref: PoseQ, p: PoseQ, fases, zancada, alza, apoyo=0.6, ang_d=6, ang_t=16):
    """Pose `p` con las cuatro patas en sus fases de paso (dc, dl, tc, tl), alrededor de las de `ref`."""
    out = {}
    for k, nombre in enumerate(('dc', 'dl', 'tc', 'tl')):
        x, y = paso(fases[k], zancada, alza, apoyo)
        base = getattr(ref, nombre)[0]
        a = ang_d if nombre.startswith('d') else ang_t
        if y > 0.3:      # en el aire: la mano se dobla (la punta cuelga hacia atrás)
            a = a - (40 if nombre.startswith('d') else -10) * min(1, y / max(alza, 0.1))
        out[nombre] = (base + x, y, a)
    return p.con(**out)


# Galope (6 cuadros): (dc, dl, tc, tl, lomo, alzar, encorva). Pata = (adelanto, altura, ángulo).
GALOPE = [
    ((8, 2, 40), (6, 1, 30), (-8, 2, -20), (-10, 1, -25), -2, 2, 0.0),     # suspensión estirado
    ((5, 0, 10), (8, 1, 30), (-5, 4, 10), (-7, 3, 5), -6, 0, 0.0),        # mano cercana apoya
    ((0, 0, 0), (3, 0, 4), (0, 4, 40), (-2, 3, 30), -3, 0, 0.5),          # apoyo de manos, patas vienen
    ((-5, 2, -30), (-3, 1, -20), (5, 1, 30), (3, 0, 22), 2, 0, 1.0),       # recogido: patas bajo el cuerpo
    ((-4, 4, -50), (-6, 3, -50), (1, 0, 14), (4, 0, 20), 6, 0, 0.6),       # empuje de patas
    ((4, 5, 20), (2, 4, 10), (-5, 1, -5), (-3, 0, 0), 4, 1, 0.1),         # despegue
]


def galope(base: PoseQ, ref: PoseQ, escala: float = 1.0):
    """Ciclo de galope a partir de `base`; las posiciones de GALOPE se suman a las patas de `ref`."""
    out = []
    for (dc, dl, tc, tl, lomo, alz, enc) in GALOPE:
        def pt(r, d):
            return (r[0] + d[0] * escala, d[1] * escala, d[2])
        out.append(base.con(dc=pt(ref.dc, dc), dl=pt(ref.dl, dl), tc=pt(ref.tc, tc), tl=pt(ref.tl, tl),
                            lomo=base.lomo + lomo, cola=(base.cola[0] - lomo * 2, base.cola[1], 0),
                            cabeza=base.cabeza - lomo * 0.6, extra={'alzar': int(round(alz * escala)), 'encorva': enc}))
    return out


# =============================================================================================
#  Bestias bípedas (bestia 1/3, nahual lobo/ave): base común sobre el rig Humanoide
# =============================================================================================



class BestiaBipeda(Humanoide):
    """Criatura bípeda flaca y encorvada, con variantes. Cada variante (dict en `VARIANTES`) define:
      medidas: {L_muslo, L_pierna, L_pie, alto_tobillo, L_brazo, L_ante}   (se aplican al cambiar de variante)
      anclas: anclas del torso (relativas a la cadera, erguido): barriga, pecho, cuello, hombro_c, hombro_l
      piel / crin / ojo / una: nombres de materiales; radios: dict de grosores
      espinas: 'pua' (púas), 'melena' (pelo greñudo), 'plumas' (plumas negras) o None
      cola: None o (n_segmentos, largo, grosor)
    El módulo del personaje dibuja la cabeza (`cabeza_<variante>(lz, c, pose, L, K)`)."""
    tipo = 'criatura'
    torso_cizalla_max = 0.0
    VARIANTES: Dict[str, dict] = {}
    variante = None
    humo: Dict[str, list] = {}

    # ---- variantes -----------------------------------------------------------------------------
    def est(self, k, d=None):
        return self.VARIANTES[self.variante].get(k, d)

    def m(self, k):
        """Índice del material lógico `k` ('piel', 'crin', 'ojo'…) de la variante actual."""
        return self.paleta[self.est(k, k)]

    def _aplicar(self):
        for k, v in self.est('medidas', {}).items():
            setattr(self, k, v)

    def torso_mapa(self, pose):
        cache = self.__dict__.setdefault('_mapas', {})
        if self.variante not in cache:
            an = {'o': (0, 0)}
            an.update(self.est('anclas'))
            cache[self.variante] = Mapa(['.'], {}, self.paleta, an)
        return cache[self.variante]

    def orden(self, pose):
        o = ['cola', 'brazo_l', 'pierna_l', 'torso', 'pierna_c', 'espinas', 'cabeza', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    def r(self, k, d=2.0):
        return self.est('radios', {}).get(k, d)

    # ---- piernas: muslo fuerte, pierna fina, pie largo con garras (digitígrado) ----------------
    def pierna(self, capa, p, lado, pose):
        pi, un = self.m('piel'), self.m('una')
        t = self.est('tonos', (1, 2, 3))
        r = math.radians(p['ang_pie'])
        fwd = (math.cos(r), -math.sin(r))
        dn = (math.sin(r), math.cos(r))
        capa.capsula(p['tobillo'], p['punta'], self.r('tobillo', 1.6), self.r('pie', 1.4), pi, tonos=t)
        for k, off in enumerate((-1.0, 0.6)):
            base = mas(mas(p['punta'], dn, off), fwd, 0.5)
            capa.linea(base, mas(mas(base, fwd, 2.4), dn, 0.8), un, 1, fijo=True)
        capa.capsula(p['rodilla'], p['tobillo'], self.r('pierna', 2.2), self.r('tobillo', 1.6), pi, tonos=t)
        capa.capsula(p['cadera'], p['rodilla'], self.r('muslo', 3.4), self.r('pierna', 2.2) + 0.4, pi, tonos=t)
        self.detalle_pierna(capa, p, lado, pose)

    def detalle_pierna(self, capa, p, lado, pose):
        pass

    # ---- brazos largos con garras ----------------------------------------------------------------
    def brazo(self, capa, b, lado, pose):
        pi, un = self.m('piel'), self.m('una')
        t = self.est('tonos', (1, 2, 3))
        d = dir_ang(b['ang_ante'])
        nn = (-d[1], d[0])
        w = b['muneca']
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        abierta = mano != 'puno'
        capa.elipse(mas(w, d, 1.6), 2.0, 2.0, pi, tonos=t)
        largo = self.r('dedos', 4.0)
        for off in (-1.3, 0.2, 1.5):
            a = mas(mas(w, d, 2.6), nn, off)
            if abierta:
                e = mas(mas(a, d, largo), nn, off * 0.5)
            else:
                e = mas(mas(a, d, largo * 0.45), nn, -1.2)
            capa.linea(a, e, pi, t[0])
            capa.pon_m(mas(e, d, 0.8), un, 2, fijo=True)
        capa.capsula(b['codo'], b['muneca'], self.r('ante', 1.9), self.r('muneca', 1.5), pi, tonos=t)
        capa.capsula(b['hombro'], b['codo'], self.r('brazo', 2.4), self.r('ante', 1.9), pi, tonos=t)
        self.detalle_brazo(capa, b, lado, pose)

    def detalle_brazo(self, capa, b, lado, pose):
        pass

    # ---- torso: pelvis, costillar y pecho -------------------------------------------------------
    def parte_torso(self, lz, c, pose):
        pi = self.m('piel')
        t = self.est('tonos', (1, 2, 3))
        p = lz.parte()
        tor = c['torso']
        cad = c['cadera_torso']
        bar, pec, cue = tor.punto('barriga'), tor.punto('pecho'), tor.punto('cuello')
        u = (pec[0] - bar[0], pec[1] - bar[1])
        L = math.hypot(*u) or 1
        u = (u[0] / L, u[1] / L)
        n = (-u[1], u[0])
        if n[0] < 0:
            n = (-n[0], -n[1])
        c['eje_torso'] = (u, n)
        p.capsula(cad, bar, self.r('pelvis', 4.0), self.r('cintura', 3.4), pi, tonos=t)
        p.capsula(bar, pec, self.r('cintura', 3.4), self.r('pecho', 5.0), pi, tonos=t)
        p.elipse(mas(pec, n, self.r('pecho_dx', 0.8)), self.r('pecho', 5.0), self.r('pecho', 5.0) * 1.1, pi, tonos=t)
        p.capsula(pec, cue, self.r('pecho', 5.0) * 0.9, self.r('cuello', 3.0), pi, tonos=t)
        # costillas en el costado (líneas cortas en sombra)
        for k in range(self.est('costillas', 3)):
            a = mas(mas(bar, u, 1.5 + k * 1.8), n, 0.5)
            p.linea(a, mas(a, n, 2.5 - k * 0.3), pi, t[0])
        self.detalle_torso(p, c, pose, u, n)
        return [(p, 'contorno', 0)]

    def detalle_torso(self, p, c, pose, u, n):
        pass

    # ---- espinas / melena / plumas a lo largo de la espalda --------------------------------------
    def parte_espinas(self, lz, c, pose):
        tipo = self.est('espinas')
        if not tipo:
            return []
        cr = self.m('crin')
        p = lz.parte()
        tor = c['torso']
        u, n = c['eje_torso']
        cad = c['cadera_torso']
        self.geo_cabeza(c, pose)
        cab = c['cabeza_nuca']
        # línea de la espalda: de la cadera a la nuca, por detrás del torso
        pts = []
        N = self.est('n_espinas', 7)
        for k in range(N):
            t = k / max(1, N - 1)
            base = (lerp(cad[0], cab[0], t), lerp(cad[1], cab[1], t))
            ancho = self.r('pecho', 5.0) * (0.55 + 0.45 * math.sin(math.pi * min(1, t * 1.15)))
            pts.append((mas(base, n, -ancho + 0.8), t))
        fl = pose.extra.get('crin', 0)          # la crin se eriza o se aplana
        largo = self.est('largo_espina', 4.0)
        for k, (b, t) in enumerate(pts):
            if t < self.est('espinas_desde', 0.15):
                continue
            L = largo * (0.6 + 0.6 * math.sin(math.pi * t)) * (1 + 0.25 * fl)
            # dirección: hacia atrás y arriba (perpendicular a la espalda, inclinada hacia la cola)
            d = (-n[0] * 0.75 - u[0] * 0.65, -n[1] * 0.75 - u[1] * 0.65)
            if tipo == 'pua':
                q = mas(b, d, L)
                p.poligono([mas(b, u, -1.6), mas(b, u, 1.4), q], cr, sombreado=(0, 1, 2), ks=1)
            elif tipo == 'melena':
                for j in range(2):
                    bb = mas(b, u, -1.2 + j * 1.6)
                    q = mas(mas(bb, d, L * (0.8 + 0.3 * ((k + j) % 2))), u, -1.5)
                    p.capsula(bb, q, 2.2, 0.6, cr, tonos=(0, 1, 2))
            elif tipo == 'plumas':
                q = mas(mas(b, d, L * 1.1), u, -1.2 * (k % 2))
                p.capsula(b, q, 1.8, 0.5, cr, tonos=(0, 0, 1))
        return [(p, 'contorno', 0)]

    # ---- cola (opcional) -------------------------------------------------------------------------
    def parte_cola(self, lz, c, pose):
        cola = self.est('cola')
        if not cola:
            return []
        n_seg, largo, grosor = cola
        pi = self.m('piel')
        p = lz.parte()
        u, n = c.get('eje_torso', ((0, -1), (1, 0)))
        cad = c['cadera_torso']
        # ángulo de la base (dir_ang: 0 = abajo, −90 = atrás); 'cola_d' < 0 la levanta hacia atrás
        a0 = self.est('cola_ang', -40) + pose.extra.get('cola_d', 0)
        curva = self.est('cola_curva', -14)
        onda = pose.extra.get('cola_onda', 0)
        pt = mas(cad, n, -2.5)
        for k in range(n_seg):
            ang = a0 + curva * k * (k / n_seg) + onda * math.sin(k * 0.8)
            q = mas(pt, dir_ang(ang), largo)
            r0 = grosor * (1 - k / n_seg) + 0.6
            r1 = grosor * (1 - (k + 1) / n_seg) + 0.5
            p.capsula(pt, q, r0, r1, pi, tonos=self.est('tonos', (1, 2, 3)))
            pt = q
        return [(p, 'contorno', 1)]

    # ---- cabeza: la dibuja el módulo del personaje ---------------------------------------------
    def geo_cabeza(self, c, pose):
        """Centro de la cabeza y transformación local L(dx, dy) → mundo (K = tamaño de la variante)."""
        cue = c['cuello']
        K = self.est('K', 1.0)
        ang = math.radians(pose.cabeza + pose.giro)
        R = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
        off = self.est('cabeza_off', (3.0, -4.0))
        cen = mas(cue, (off[0] + pose.extra.get('cab_dx', 0), off[1] + pose.extra.get('cab_dy', 0)))

        def L(dx, dy):
            v = R @ np.array([dx * K, dy * K])
            return cen[0] + v[0], cen[1] + v[1]

        c['cabeza_centro'] = cen
        c['cabeza_nuca'] = L(*self.est('nuca', (-4, -1)))
        return cen, L, K

    def parte_cabeza(self, lz, c, pose):
        cue = c['cuello']
        cen, L, K = self.geo_cabeza(c, pose)
        p = lz.parte()
        p.capsula(cue, L(-2, 2), self.r('cuello', 3.0), self.r('cuello', 3.0) * 0.9, self.m('piel'),
                  tonos=self.est('tonos', (1, 2, 3)))
        capas = [(p, 'contorno', 0)]
        capas += getattr(self, 'cabeza_' + self.variante)(lz, c, pose, L, K)
        return capas

    def ojo(self, g, x, y, pose, grande=False):
        """Ojo que brilla (corrupto: cálido intenso; purificado: turquesa sereno; cerrado: línea)."""
        if pose.cara in ('parpadeo', 'cerrado', 'dolor'):
            g.pon(x - 1, y, self.m('piel'), 0, fijo=True)
            g.pon(x, y, self.m('piel'), 0, fijo=True)
            if pose.cara == 'dolor':
                g.pon(x + 1, y - 1, self.m('piel'), 0, fijo=True)
            return
        purif = pose.extra.get('purificado')
        mat = self.paleta['turq'] if purif else self.m('ojo')
        g.pon(x, y, mat, 2, fijo=True)
        g.pon(x - 1, y, mat, 1, fijo=True)
        if grande or pose.extra.get('pulso'):
            g.pon(x + 1, y, mat, 1, fijo=True)
        if pose.extra.get('pulso') and not purif:
            g.pon(x, y - 1, mat, 0, fijo=True)

    # ---- efectos ---------------------------------------------------------------------------------
    def retoques(self, lz, c, pose):
        cen = c.get('cabeza_centro', (0, -60))
        ch = pose.extra.get('chispas')
        if ch is not None:
            mat = self.paleta['turq'] if pose.extra.get('purificado') else self.m('ojo')
            chispas(lz, (cen[0] - 4, cen[1] + 16), mat, int(ch), radio=22, n=9, tono_alto=2, tono_bajo=0,
                    subida=3)
        est = pose.extra.get('estrellas')
        if est is not None:
            mat = self.m('ojo')
            for j in range(3):
                a = est * 0.9 + j * 2.09
                x, y = lz.a_px((cen[0] + math.cos(a) * 8, cen[1] - 12 + math.sin(a) * 2.5))
                lz.pon(x, y, mat, 2, fx=True)
                if (j + est) % 2 == 0:
                    for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        lz.pon(x + ex, y + ey, mat, 0, fx=True)

    def cuadro(self, pose, depurar=False):
        self._aplicar()
        img = super().cuadro(pose, depurar)
        t = pose.extra.get('disolver', 0)
        if t:
            img = disolver(img, t, self.humo[self.variante], semilla=int(t * 10) + 3, subida=9)
        return img


def animaciones_bestia(B: Pose, paso: float = 1.15) -> Dict[str, Anim]:
    """Juego completo para una bestia bípeda encorvada a partir de su pose base `B`."""
    A: Dict[str, Anim] = {}
    # Reposo: respira encorvada, la cabeza husmea, las garras se crispan; los ojos laten.
    rep = []
    for i in range(6):
        s = math.sin(i / 6 * 2 * math.pi)
        rep.append(B.con(hunde=0.8 + 0.8 * s, tronco=B.tronco + 2 * s, cabeza=B.cabeza - 3 * s,
                         hombro_c=B.hombro_c + 4 * s, codo_c=B.codo_c + 6 * s, hombro_l=B.hombro_l - 3 * s,
                         cara='parpadeo' if i == 3 else 'normal',
                         extra={'pulso': i in (0, 1), 'cola_d': -3.7 * s, 'cola_onda': 6 * s, 'crin': 0.3 * s}))
    A['reposo'] = Anim(rep, 5, True)
    # Caminar: pasos largos, acechantes; brazos colgando que se balancean.
    cam = []
    for i in range(8):
        a = CAMINAR[i]
        b = CAMINAR[(i + 4) % 8]
        s = math.sin(i / 8 * 2 * math.pi)
        cam.append(B.con(muslo_c=a[0] * paso, rodilla_c=a[1] * 1.2 + 6, pie_c=a[2], muslo_l=b[0] * paso,
                         rodilla_l=b[1] * 1.2 + 6, pie_l=b[2], hombro_c=B.hombro_c - 22 * s,
                         codo_c=B.codo_c + max(0, 16 * s), hombro_l=B.hombro_l + 22 * s,
                         codo_l=B.codo_l + max(0, -16 * s), cabeza=B.cabeza + 3 * s,
                         hunde=0.6 * abs(math.cos(i / 8 * 2 * math.pi)),
                         extra={'pulso': i % 4 == 0, 'cola_d': 5 * s, 'cola_onda': 8 * s}))
    A['caminar'] = Anim(cam, 9, True)
    # Correr (embestida): muy inclinada, garras atrás, zancadas largas.
    cor = []
    for i in range(8):
        a = CORRER[i]
        b = CORRER[(i + 4) % 8]
        s = math.sin(i / 8 * 2 * math.pi)
        cor.append(B.con(tronco=B.tronco + 22, muslo_c=a[0], rodilla_c=a[1], pie_c=a[2], muslo_l=b[0],
                         rodilla_l=b[1], pie_l=b[2], hombro_c=-30 - 40 * s, codo_c=50, hombro_l=-30 + 40 * s,
                         codo_l=50, cabeza=B.cabeza - 14, mano_c='garra', mano_l='garra',
                         extra={'boca': 2, 'pulso': i % 2, 'cola_d': -25, 'cola_onda': 10 * s, 'crin': 1,
                                'alzar': 2 if i in (2, 3, 6, 7) else 0}))
    A['correr'] = Anim(cor, 13, True)
    # Ataque (zarpazo, preparación ~0,5 s): alza la garra atrás, tiembla, y la descarga en diagonal.
    a0 = B.con(tronco=B.tronco - 8, hombro_c=135, codo_c=60, hombro_l=-30, codo_l=30, muslo_c=20, rodilla_c=30,
               muslo_l=-16, rodilla_l=24, cabeza=B.cabeza - 10, mano_c='garra',
               extra={'boca': 2, 'pulso': 1, 'crin': 0.6})
    a1 = a0.con(tronco=B.tronco - 14, hombro_c=160, codo_c=72, cabeza=B.cabeza - 14, extra={'boca': 3, 'pulso': 0})
    a2 = a1.con(hombro_c=164, extra={'boca': 3, 'pulso': 1, 'cab_dx': -0.6, 'crin': 1})
    a3 = a1.con(hombro_c=157, extra={'boca': 3, 'pulso': 0, 'cab_dx': 0.6, 'crin': 1})
    a4 = B.con(tronco=B.tronco + 22, hombro_c=96, codo_c=6, hombro_l=-50, codo_l=30, muslo_c=40, rodilla_c=40,
               pie_c=10, muslo_l=-30, rodilla_l=36, cabeza=B.cabeza + 2, mano_c='garra',
               extra={'boca': 3, 'pulso': 1, 'crin': 1})
    a5 = a4.con(tronco=B.tronco + 30, hombro_c=50, codo_c=0, extra={'boca': 2, 'pulso': 1, 'crin': 0.5})
    a6 = a5.con(tronco=B.tronco + 22, hombro_c=30, codo_c=10, extra={'boca': 1})
    A['ataque'] = Anim([a0, a1, a2, a3, a2, a3, a4, a5, a6], 12, False)
    # Golpe (preparación de la embestida o del salto): se agazapa con las garras adelante y gruñe.
    g0 = B.con(tronco=B.tronco + 26, muslo_c=46, rodilla_c=80, muslo_l=10, rodilla_l=70, pie_l=-10, hunde=1.5,
               hombro_c=60, codo_c=30, hombro_l=40, codo_l=40, mano_c='garra', mano_l='garra',
               cabeza=B.cabeza - 10, extra={'boca': 2, 'pulso': 1, 'crin': 1, 'cola_d': -19})
    A['golpe'] = Anim([g0, g0.con(hunde=2.2, extra={'boca': 3, 'pulso': 0, 'crin': 1.2, 'cola_d': -22,
                                                    'cab_dx': 0.5})], 6, True)
    A['lanzar'] = A['ataque']
    A['disparar'] = A['ataque']
    # Invocar (aullido / llamado): se yergue, brazos abiertos, la cabeza al cielo; chispas de su color.
    iv = B.con(tronco=-6, cabeza=-30, hombro_c=92, codo_c=40, hombro_l=200, codo_l=30, mano_c='garra',
               mano_l='garra', muslo_c=16, rodilla_c=20, muslo_l=-14, rodilla_l=18,
               extra={'boca': 4, 'pulso': 1, 'crin': 1.3, 'cola_d': -12})
    A['invocar'] = Anim([iv.con(extra={'chispas': 0}), iv.con(cabeza=-36, extra={'chispas': 1, 'pulso': 0}),
                         iv.con(hunde=1, extra={'chispas': 2}), iv.con(cabeza=-34, extra={'chispas': 3, 'pulso': 0})],
                        7, True)
    A['conjuro'] = A['invocar']
    # Salto (abalanzarse): se agacha, se estira con las garras al frente; cae garras abajo; aterriza.
    s0 = B.con(tronco=B.tronco + 30, muslo_c=60, rodilla_c=110, muslo_l=40, rodilla_l=100, pie_l=-10, hunde=2,
               hombro_c=-40, codo_c=40, hombro_l=-50, codo_l=40, cabeza=B.cabeza - 6, mano_c='garra', mano_l='garra',
               extra={'boca': 2, 'crin': 1})
    s1 = B.con(tronco=B.tronco + 34, muslo_c=-10, rodilla_c=40, pie_c=-50, muslo_l=-30, rodilla_l=50, pie_l=-60,
               hombro_c=110, codo_c=10, hombro_l=100, codo_l=20, cabeza=B.cabeza - 16, mano_c='garra', mano_l='garra',
               extra={'boca': 4, 'pulso': 1, 'crin': 1.3, 'cola_d': -31})
    A['salto'] = Anim([s0, s1], 8, False)
    A['subida'] = Anim([s1], 1, False)
    A['caida'] = Anim([B.con(tronco=B.tronco + 10, muslo_c=40, rodilla_c=60, pie_c=-20, muslo_l=10, rodilla_l=60,
                             pie_l=-30, hombro_c=70, codo_c=20, hombro_l=50, codo_l=20, mano_c='garra', mano_l='garra',
                             extra={'boca': 3, 'crin': 1, 'cola_d': 12})], 1, False)
    A['aterrizar'] = Anim([B.con(tronco=B.tronco + 34, muslo_c=60, rodilla_c=118, muslo_l=36, rodilla_l=110,
                                 hombro_c=50, codo_c=20, hombro_l=40, codo_l=20, hunde=2, mano_c='garra',
                                 mano_l='garra', extra={'boca': 2}), s0.con(tronco=B.tronco + 16, hunde=1)], 10, False)
    # Esquivar: brinco hacia atrás.
    A['esquivar'] = Anim([s0, B.con(tronco=B.tronco - 16, muslo_c=30, rodilla_c=60, muslo_l=-10, rodilla_l=50,
                                    hombro_c=-40, codo_c=40, hombro_l=-60, codo_l=40, cabeza=B.cabeza - 10,
                                    extra={'alzar': 4, 'crin': 1, 'cola_d': 12}), s0], 10, False)
    # Interactuar: olfatea / rasca el suelo.
    it = B.con(tronco=B.tronco + 30, hombro_c=60, codo_c=10, hombro_l=30, codo_l=20, mano_c='garra',
               muslo_c=36, rodilla_c=60, muslo_l=6, rodilla_l=50, cabeza=B.cabeza + 14)
    A['interactuar'] = Anim([it, it.con(hombro_c=70, codo_c=0), it], 6, False)
    # Daño: respingo hacia atrás.
    A['dano'] = Anim([B.con(tronco=B.tronco - 22, cabeza=B.cabeza - 24, hombro_c=-40, codo_c=60, hombro_l=-60,
                            codo_l=60, muslo_c=24, rodilla_c=14, muslo_l=-20, cara='dolor',
                            extra={'boca': 3, 'pulso': 1, 'crin': 1.4, 'cola_d': 16}),
                      B.con(tronco=B.tronco - 10, cabeza=B.cabeza - 12, hombro_c=-20, codo_c=50, hombro_l=-36,
                            codo_l=50, cara='dolor', extra={'boca': 2, 'crin': 0.8}),
                      B.con(tronco=B.tronco - 2, cara='normal')], 12, False)
    # Aturdido: tambaleo, estrellas.
    at = B.con(tronco=B.tronco + 8, muslo_c=24, rodilla_c=36, muslo_l=-4, rodilla_l=30, hombro_c=-4, codo_c=16,
               hombro_l=-12, codo_l=16, hunde=1.5)
    A['aturdido'] = Anim([at.con(cabeza=B.cabeza + 14 * math.sin(k * math.pi / 2), giro=4 * math.sin(k * math.pi / 2),
                                 cara='parpadeo' if k % 2 else 'dolor', extra={'estrellas': k, 'cola_d': 6})
                          for k in range(4)], 6, True)
    # Agotado (purificable): de rodillas, encorvada, jadea.
    rod = B.con(tronco=B.tronco + 24, muslo_c=80, rodilla_c=150, pie_c=-70, muslo_l=10, rodilla_l=100, pie_l=-80,
                hombro_c=10, codo_c=10, hombro_l=-6, codo_l=10, mano_c='abierta', mano_l='abierta', hunde=1.5,
                cabeza=B.cabeza + 16, cara='parpadeo', extra={'boca': 1, 'crin': -0.5, 'cola_d': 12})
    A['agotado'] = Anim([rod, rod.con(hunde=2.5, cabeza=B.cabeza + 20, extra={'boca': 2, 'pulso': 1}),
                         rod.con(hunde=2, cara='normal', extra={'boca': 1}),
                         rod.con(hunde=2.5, cabeza=B.cabeza + 20, extra={'boca': 2, 'pulso': 1})], 4, True)
    # Purificar: arrodillada se calma; el brillo de los ojos pasa a turquesa sereno y la envuelve la luz.
    A['purificar'] = Anim([rod.con(extra={'pulso': 1, 'chispas': 0}),
                           rod.con(cabeza=B.cabeza + 4, tronco=B.tronco + 14, cara='parpadeo', extra={'chispas': 1}),
                           rod.con(cabeza=B.cabeza - 6, tronco=B.tronco + 8, extra={'purificado': 1, 'chispas': 2}),
                           rod.con(cabeza=B.cabeza - 10, tronco=B.tronco + 4, extra={'purificado': 1, 'chispas': 3}),
                           rod.con(cabeza=B.cabeza - 10, tronco=B.tronco + 4, cara='parpadeo',
                                   extra={'purificado': 1, 'chispas': 4}),
                           rod.con(cabeza=B.cabeza - 8, tronco=B.tronco + 6, extra={'purificado': 1, 'chispas': 5})],
                          6, False)
    # Morir: cae de rodillas y se deshace en humo (sin violencia).
    A['morir'] = Anim([A['dano'].poses[0], rod.con(cara='dolor'), rod.con(tronco=B.tronco + 34, cara='parpadeo'),
                       rod.con(tronco=B.tronco + 34, cara='parpadeo', extra={'disolver': 0.35}),
                       rod.con(tronco=B.tronco + 34, cara='parpadeo', extra={'disolver': 0.65}),
                       rod.con(tronco=B.tronco + 34, cara='parpadeo', extra={'disolver': 0.92})], 8, False)
    return A
