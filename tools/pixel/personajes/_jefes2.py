"""Utilidades compartidas de los jefes finales (lote "jefes2"): Rey del Olvido, Tzitzimitl e Itzpapálotl.

Los tres son figuras esqueléticas grandes (105–140 px) con cabellera/plumas/túnica que ondean. Se arman sobre el
rig `Humanoide` con el torso dibujado por código (como `chaneque_mayor.py`) y comparten:

  * `Jefe`: base con torso sin mapa (anclas por clase), cráneo dibujado a mano (Mapa), disolución en humo para
    `morir` (post-proceso con tramado ordenado: sin semitransparencias) y chispas de efecto.
  * Trazos: `curva`/`trazo` (mechones y plumas que se adelgazan), `pluma_navaja` (pluma-navaja de obsidiana con filo
    brillante), `dentado` (bastillas deshilachadas), `hueso` (miembros óseos con articulaciones nudosas), manos y pies
    de hueso.
  * `animaciones_jefe(B)`: las 20 animaciones con anticipación (cuadros de carga antes del golpe, sacudida,
    recuperación), ondas de pelo/tela por cuadro (`extra['fase']`, `extra['viento']`) y brillo (`extra['carga']`).
"""
from __future__ import annotations

import math
import os
import sys
from typing import Dict, List, Sequence

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Pose, dir_ang, lerp, mas  # noqa: E402
from humanoide import Humanoide  # noqa: E402

# ---------------------------------------------------------------------------------------------------
#  Geometría de trazos
# ---------------------------------------------------------------------------------------------------


def curva(p0, ang0: float, largo: float, giro: float = 0.0, n: int = 6, onda: float = 0.0, fase: float = 0.0):
    """Puntos de un trazo que sale de p0 con ángulo ang0 (dir_ang) y se curva `giro` grados en total;
    `onda` agrega un serpenteo (grados) que se desplaza con `fase`."""
    pts = [p0]
    a = ang0
    paso = largo / n
    for i in range(n):
        a += giro / n + onda * math.sin(fase + i * 0.95)
        pts.append(mas(pts[-1], dir_ang(a), paso))
    return pts


def trazo(capa: Capa, pts, r0: float, r1: float, mat: int, tonos=(1, 2, 3), **kw):
    n = len(pts) - 1
    for i in range(n):
        capa.capsula(pts[i], pts[i + 1], lerp(r0, r1, i / n), lerp(r0, r1, (i + 1) / n), mat, tonos=tonos, **kw)


def dentado(a, b, n: int, prof: float, normal=None, sem: int = 0):
    """Puntos entre a y b en zigzag (bastilla deshilachada). `normal`: hacia dónde salen los picos."""
    d = (b[0] - a[0], b[1] - a[1])
    L = math.hypot(*d) or 1
    nrm = normal or (d[1] / L, -d[0] / L)
    out = []
    for i in range(n + 1):
        t = i / n
        k = prof * (1.0 if i % 2 else 0.25) * (0.6 + 0.4 * ((i * 7 + sem) % 3) / 2)
        out.append(mas(mas(a, d, t), nrm, k if 0 < i < n else 0))
    return out


def pluma_navaja(capa: Capa, base, ang: float, largo: float, ancho: float, mat: int, filo: int,
                 tonos=(0, 1, 2), curva_g: float = 0.0, filo_t: int = 2, raquis: bool = True):
    """Pluma-navaja de obsidiana: hoja alargada con punta, raquis oscuro y el filo de ARRIBA brillante."""
    n = 6
    pts = curva(base, ang, largo, curva_g, n)
    izq, der = [], []
    for i, p in enumerate(pts):
        t = i / n
        w = ancho * min(1.0, 0.25 + t * 3.0) * (1 - t ** 2.2)
        a = math.radians(ang + curva_g * t)
        nx, ny = math.cos(a), -math.sin(a)   # perpendicular a dir_ang(a)
        izq.append(mas(p, (nx, ny), w))
        der.append(mas(p, (nx, ny), -w))
    poly = izq + der[::-1]
    capa.poligono(poly, mat, sombreado=tonos, ks=1)
    # filo: el borde más alto (el que da a la luz) en el material del filo
    lado = izq if sum(p[1] for p in izq) < sum(p[1] for p in der) else der
    for i in range(1, len(lado) - 1):
        capa.linea(lado[i], lado[i + 1], filo, filo_t if i < len(lado) - 2 else filo_t - 1)
    if raquis:
        for i in range(len(pts) - 2):
            capa.linea(pts[i], pts[i + 1], mat, tonos[0])
    return pts[-1]


def hueso(capa: Capa, a, b, ra: float, rb: float, mat: int, tonos=(1, 2, 3), nudo: float = 0.0, surco: bool = True):
    """Hueso largo: cápsula delgada, cabeza nudosa en `a` (si nudo > 0) y un surco del lado de la sombra
    (sugiere dos huesos: tibia/peroné, radio/cúbito)."""
    capa.capsula(a, b, ra, rb, mat, tonos=tonos)
    if nudo:
        capa.elipse(a, nudo, nudo, mat, tonos=(tonos[0], tonos[1], tonos[-1]))
    if surco:
        d = (b[0] - a[0], b[1] - a[1])
        L = math.hypot(*d) or 1
        n = (-d[1] / L, d[0] / L)
        # del lado contrario a la luz (abajo-derecha)
        s = 1 if (n[0] * 0.62 + n[1] * 0.78) > 0 else -1
        capa.linea(mas(mas(a, d, 0.25), n, s * 0.6), mas(mas(a, d, 0.8), n, s * 0.6), mat, tonos[0])


def mano_hueso(capa: Capa, b, mat: int, tipo: str = 'garra', tam: float = 1.0, una: int = None, una_t: int = 2):
    """Mano esquelética en la muñeca de `b`: palma pequeña y falanges largas.
    garra = dedos curvos hacia abajo; abierta = dedos extendidos y separados; puno = cerrada."""
    d = dir_ang(b['ang_ante'])
    n = (-d[1], d[0])
    w = b['muneca']
    capa.elipse(mas(w, d, 1.4 * tam), 1.8 * tam, 1.8 * tam, mat, tonos=(1, 2, 3))
    if tipo == 'puno':
        capa.elipse(mas(w, d, 2.4 * tam), 2.0 * tam, 2.0 * tam, mat, tonos=(1, 2, 3))
        return
    for k, off in enumerate((-1.7, 0.0, 1.7)):
        base = mas(mas(w, d, 2.6 * tam), n, off * tam)
        if tipo == 'abierta':
            m1 = mas(mas(base, d, 2.6 * tam), n, off * 0.5)
            tip = mas(mas(m1, d, 2.2 * tam), n, off * 0.4)
        else:   # garra: la segunda falange se dobla (hacia abajo en pantalla si el brazo apunta adelante)
            m1 = mas(mas(base, d, 2.4 * tam), n, off * 0.35)
            dd = dir_ang(b['ang_ante'] - 55)
            tip = mas(m1, dd, 2.2 * tam)
        capa.linea(base, m1, mat, 2)
        capa.linea(m1, tip, mat, 1)
        capa.pon_m(m1, mat, 3)
        if una is not None:
            capa.pon_m(tip, una, una_t)
    # pulgar
    capa.linea(mas(w, n, -1.6 * tam), mas(mas(w, d, 2.2 * tam), n, -2.8 * tam), mat, 1)


def pie_hueso(capa: Capa, p, mat: int, tonos=(1, 2, 3)):
    """Pie de hueso: talón redondo, metatarsos finos y dedos separados con nudillos."""
    r = math.radians(p['ang_pie'])
    fwd = (math.cos(r), -math.sin(r))
    dn = (math.sin(r), math.cos(r))
    capa.elipse(mas(p['talon'], fwd, 0.8), 1.6, 1.5, mat, tonos=tonos)
    capa.capsula(mas(p['talon'], fwd, 1), mas(p['punta'], fwd, -1.5), 1.4, 1.1, mat, tonos=tonos)
    for k, off in enumerate((-0.3, 0.7)):
        a = mas(mas(p['punta'], fwd, -2.0), dn, off)
        capa.linea(a, mas(a, fwd, 3.0), mat, tonos[1] if k else tonos[2])
    capa.pon_m(mas(mas(p['punta'], fwd, -2.2), dn, -0.8), mat, tonos[2])


def chispa(lz, p, mat: int, tam: int = 1, t_centro: int = 3, t_brazo: int = 2):
    """Destello en cruz (efecto, sin contorno)."""
    x, y = lz.a_px(p)
    lz.pon(x, y, mat, t_centro, fx=True)
    for k in range(1, tam + 1):
        t = t_brazo if k == 1 else max(0, t_brazo - 1)
        for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
            if lz.dentro(x + dx, y + dy) and (lz.mat[y + dy, x + dx] < 0 or lz.fx[y + dy, x + dx]):
                lz.pon(x + dx, y + dy, mat, t, fx=True)


def anillo(lz, c, r: float, mat: int, ton: int, paso: int = 1, fase: int = 0, solo_vacio: bool = True):
    """Anillo de 1 px (efecto) de radio r; con paso > 1 queda punteado."""
    n = max(8, int(2 * math.pi * r))
    vistos = set()
    for i in range(n):
        if (i // max(1, paso // 1)) % paso != fase % paso if paso > 1 else False:
            continue
        a = 2 * math.pi * i / n
        x, y = lz.a_px((c[0] + r * math.cos(a), c[1] + r * math.sin(a)))
        if (x, y) in vistos or not lz.dentro(x, y):
            continue
        vistos.add((x, y))
        if solo_vacio and lz.mat[y, x] >= 0 and not lz.fx[y, x]:
            continue
        lz.pon(x, y, mat, ton, fx=True)


BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], float) / 16.0


# ---------------------------------------------------------------------------------------------------
#  Base de los jefes
# ---------------------------------------------------------------------------------------------------


class Jefe(Humanoide):
    tipo = 'humanoide'
    torso_cizalla_max = 0.0
    ANCLAS: Dict[str, tuple] = {}
    # material y tonos del humo con el que se deshacen al morir (tono claro primero)
    humo = ('pelo', (2, 1))

    _tm = None

    def torso_mapa(self, pose):
        if self._tm is None or self._tm.paleta is not self.paleta:
            type(self)._tm = Mapa(['.'], {}, self.paleta, dict(self.ANCLAS))
        return self._tm

    @staticmethod
    def suelo_y(c) -> float:
        """y del mundo donde pisa (el pie más bajo): los efectos de suelo se ponen respecto a esto."""
        return max(c['pierna_' + l][k][1] + (1.5 if k in ('talon', 'punta') else 2.5)
                   for l in ('c', 'l') for k in ('talon', 'punta', 'rodilla', 'tobillo'))

    @staticmethod
    def pisar(pts, sy: float, dx: float = -0.8):
        """Lo que cuelga (pelo, tela) no atraviesa el suelo: se arrastra sobre él (corre un poco hacia atrás)."""
        out = []
        for x, y in pts:
            if y > sy - 1:
                x += (y - (sy - 1)) * dx
                y = sy - 1
            out.append((x, y))
        return out

    def cuadro(self, pose: Pose, depurar: bool = False) -> np.ndarray:
        img = super().cuadro(pose, depurar)
        k = float(pose.extra.get('disolver', 0))
        if k > 0:
            img = self._disolver(img, k, int(pose.extra.get('fase_humo', 0)))
        return img

    def _disolver(self, img: np.ndarray, k: float, fase: int) -> np.ndarray:
        """Se deshace en humo por ARRIBA (banda superior con tramado ordenado que avanza con k) y deja volutas de
        humo que suben serpenteando. El grueso del cuerpo queda sólido: se lee como "se apaga", no como gore."""
        a = img[..., 3] > 0
        ys, xs = np.nonzero(a)
        if not len(ys):
            return img
        y0, y1 = ys.min(), ys.max()
        out = img.copy()
        mi = self.paleta[self.humo[0]]
        cl = self.paleta.mat(mi).color(self.humo[1][0])
        cs = self.paleta.mat(mi).color(self.humo[1][1])
        H, W = a.shape
        for y, x in zip(ys, xs):
            alto = (y1 - y) / max(1, y1 - y0)            # 0 abajo, 1 arriba
            umbral = (alto - (1 - k * 1.5)) * 2.2
            if umbral > 0 and BAYER4[y % 4, x % 4] < umbral:
                out[y, x, :3] = cl if BAYER4[y % 4, x % 4] < umbral * 0.5 else cs
                if BAYER4[y % 4, x % 4] < umbral * 0.35:
                    out[y, x, 3] = 0
        # volutas: hilos de humo que suben serpenteando (punteados, cada vez más ralos)
        cols = [x for x in range(xs.min() + 4, xs.max() - 3, 9)]
        for j, x0 in enumerate(cols):
            col = np.nonzero(a[:, x0])[0]
            if not len(col):
                continue
            ytop = col.min() - 1 - (j * 3 + fase * 2) % 4
            largo = int(5 + 9 * k + (j * 5 + fase * 3) % 6)
            for i in range(1, largo):
                yy = ytop - i
                xx = int(round(x0 + 2.0 * math.sin(i * 0.32 + j * 1.7 + fase * 0.8)))
                if i > largo * 0.5 and (i + j + fase) % 3 == 0:
                    continue
                if 0 <= yy < H and 0 <= xx < W and out[yy, xx, 3] == 0:
                    out[yy, xx, :3] = cl if i < largo * 0.4 else cs
                    out[yy, xx, 3] = 255
        return out


# ---------------------------------------------------------------------------------------------------
#  Animaciones con anticipación
# ---------------------------------------------------------------------------------------------------

CAMINAR = [(24, 4, 14), (15, 12, 2), (3, 6, 0), (-9, 4, -4), (-19, 12, -24), (-9, 38, -26), (11, 40, -8), (24, 16, 8)]
CORRER = [(30, 22, 2), (12, 44, 0), (-12, 22, -10), (-32, 30, -40), (-24, 92, -50), (12, 118, -30), (54, 96, -10),
          (50, 44, 0)]


def _ex(p: Pose, **kw) -> Pose:
    return p.con(extra=kw)


def animaciones_jefe(B: Pose, paso: float = 1.0, lean: float = 6, lean_correr: float = 18,
                     mano_atk: str = 'garra') -> Dict[str, Anim]:
    """Juego completo para un jefe humanoide. `extra`: fase (onda de pelo/tela, 0–7), viento (0 quieto, 1 camina,
    2 corre/embiste), carga (0–3 brillo de energía en las manos/núcleo), boca (0–3), chispas, purificado,
    disolver (0–1)."""
    A: Dict[str, Anim] = {}
    # Reposo: respira (6 cuadros), el pelo/tela ondea lento, parpadeo del brillo de los ojos al final.
    rep = []
    for i in range(6):
        s = math.sin(i / 6 * 2 * math.pi)
        rep.append(B.con(hunde=0.8 + 0.8 * s, hombro_c=B.hombro_c + 2 * s, hombro_l=B.hombro_l - 2 * s,
                         codo_c=B.codo_c + 3 * s, cabeza=B.cabeza + 1.5 * s,
                         cara='parpadeo' if i == 5 else B.cara,
                         extra={'fase': i * 8 / 6, 'viento': 0.15, 'carga': 1 if i in (1, 2) else 0}))
    A['reposo'] = Anim(rep, 5, True)

    cam = []
    for i in range(8):
        (mc, rc, pc), (ml, rl, pl) = CAMINAR[i], CAMINAR[(i + 4) % 8]
        s = -math.sin(i / 8 * 2 * math.pi + 0.35)
        cam.append(B.con(tronco=B.tronco + lean, muslo_c=mc * paso, rodilla_c=rc, pie_c=pc, muslo_l=ml * paso,
                         rodilla_l=rl, pie_l=pl, hombro_c=B.hombro_c + 18 * s, codo_c=B.codo_c + max(0, 16 * s),
                         hombro_l=B.hombro_l - 18 * s, codo_l=B.codo_l + max(0, -16 * s),
                         hunde=0.8 if i % 4 in (1, 2) else 0, cabeza=B.cabeza + 2 * s,
                         extra={'fase': i, 'viento': 1.0}))
    A['caminar'] = Anim(cam, 9, True)

    cor = []
    for i in range(8):
        (mc, rc, pc), (ml, rl, pl) = CORRER[i], CORRER[(i + 4) % 8]
        s = -math.sin(i / 8 * 2 * math.pi + 0.5)
        cor.append(B.con(tronco=lean_correr, muslo_c=mc * paso, rodilla_c=rc, pie_c=pc, muslo_l=ml * paso,
                         rodilla_l=rl, pie_l=pl, hombro_c=-20 + 40 * s, codo_c=60 + 12 * s, hombro_l=-20 - 40 * s,
                         codo_l=60 - 12 * s, cabeza=-6, extra={'fase': i, 'viento': 2.0,
                                                                'alzar': 2 if i % 4 == 3 else 0}))
    A['correr'] = Anim(cor, 13, True)

    # GOLPE = carga (en el juego es el "windup"): se echa atrás, alza los brazos por encima de la cabeza, la energía
    # crece; el último cuadro se sostiene (anticipación larga, se lee bien antes del golpe).
    g0 = B.con(tronco=B.tronco - 4, hombro_c=110, codo_c=30, hombro_l=90, codo_l=30, muslo_c=14, rodilla_c=16,
               muslo_l=-14, rodilla_l=10, hunde=1, cabeza=B.cabeza - 6, mano_c=mano_atk, mano_l=mano_atk,
               extra={'fase': 1, 'viento': 0.3, 'carga': 1, 'boca': 1})
    g1 = g0.con(tronco=B.tronco - 14, hombro_c=165, codo_c=40, hombro_l=145, codo_l=40, muslo_c=22, rodilla_c=30,
                muslo_l=-20, rodilla_l=18, hunde=2, cabeza=B.cabeza - 12, extra={'fase': 2, 'carga': 2, 'boca': 2})
    g2 = g1.con(tronco=B.tronco - 18, hombro_c=185, codo_c=50, hombro_l=165, codo_l=50, hunde=2.5,
                extra={'fase': 3, 'carga': 3, 'boca': 3, 'chispas': 1})
    A['golpe'] = Anim([g0, g1, g2, g2.con(hunde=2, hombro_c=188, extra={'fase': 4, 'carga': 3, 'boca': 3,
                                                                         'chispas': 2})], 7, False)

    # ATAQUE = descarga: los brazos bajan de golpe por delante (cuadro de impacto con estela), seguimiento y
    # recuperación.
    a0 = B.con(tronco=B.tronco + 20, hombro_c=120, codo_c=10, hombro_l=100, codo_l=16, muslo_c=36, rodilla_c=30,
               muslo_l=-24, rodilla_l=10, pie_l=-14, cabeza=B.cabeza + 2, mano_c=mano_atk, mano_l=mano_atk,
               extra={'fase': 5, 'viento': 1.4, 'carga': 3, 'boca': 3, 'estela': 1})
    a1 = a0.con(tronco=B.tronco + 34, hombro_c=58, codo_c=4, hombro_l=44, codo_l=10, muslo_c=46, rodilla_c=50,
                rodilla_l=16, hunde=2, cabeza=B.cabeza + 8,
                extra={'fase': 6, 'viento': 1.8, 'carga': 2, 'boca': 2, 'estela': 2, 'impacto': 1})
    a2 = a1.con(tronco=B.tronco + 28, hombro_c=40, codo_c=14, hombro_l=30, hunde=1.5,
                extra={'fase': 7, 'viento': 1.0, 'carga': 1, 'boca': 1, 'impacto': 2})
    a3 = B.con(tronco=B.tronco + 10, hombro_c=36, codo_c=30, hombro_l=10, muslo_c=24, rodilla_c=20, muslo_l=-16,
               mano_c=mano_atk, extra={'fase': 0, 'viento': 0.5})
    A['ataque'] = Anim([a0, a1, a2, a3], 11, False)

    # CONJURO: junta energía entre las manos frente al pecho (bucle de 6 cuadros, el brillo crece y late).
    con = B.con(tronco=B.tronco - 2, hombro_c=50, codo_c=70, hombro_l=40, codo_l=80, muslo_c=12, rodilla_c=8,
                muslo_l=-12, rodilla_l=6, mano_c='abierta', mano_l='abierta', brazo_l_delante=False,
                cabeza=B.cabeza - 4)
    A['conjuro'] = Anim([con.con(hombro_c=50 + 4 * math.sin(i), codo_c=70 - 4 * math.sin(i), hunde=0.5 * (i % 2),
                                 extra={'fase': i, 'viento': 0.6, 'carga': [1, 2, 3, 3, 2, 3][i], 'orbe': i,
                                        'boca': 1 if i % 3 == 2 else 0})
                         for i in range(6)], 8, True)

    # INVOCAR (intro / clones / llamada): se yergue, brazos al cielo con un grito; ráfaga de chispas.
    inv = B.con(tronco=-8, hombro_c=150, codo_c=24, hombro_l=136, codo_l=26, cabeza=-16, muslo_c=14, rodilla_c=8,
                muslo_l=-12, rodilla_l=6, mano_c='abierta', mano_l='abierta')
    A['invocar'] = Anim([
        B.con(tronco=B.tronco + 14, hombro_c=10, codo_c=60, hombro_l=0, codo_l=60, hunde=2.5, muslo_c=20, rodilla_c=30,
              muslo_l=-6, rodilla_l=26, cabeza=B.cabeza + 8, extra={'fase': 0, 'viento': 0.3, 'carga': 1}),
        inv.con(hombro_c=130, hombro_l=118, hunde=0.5, extra={'fase': 1, 'viento': 1.2, 'carga': 2, 'boca': 2,
                                                              'chispas': 0}),
        inv.con(extra={'fase': 2, 'viento': 1.6, 'carga': 3, 'boca': 3, 'chispas': 1}),
        inv.con(hombro_c=156, hombro_l=142, hunde=0.5, extra={'fase': 3, 'viento': 1.4, 'carga': 3, 'boca': 3,
                                                              'chispas': 2}),
        inv.con(hombro_c=152, extra={'fase': 4, 'viento': 1.2, 'carga': 2, 'boca': 2, 'chispas': 3}),
    ], 7, True)

    # LANZAR (rayo / grieta / proyectil): echa el brazo atrás, carga y suelta con destello.
    l0 = B.con(tronco=B.tronco - 12, hombro_c=228, codo_c=-36, hombro_l=60, codo_l=30, muslo_c=10, rodilla_c=20,
               muslo_l=-20, rodilla_l=10, hunde=1.5, cabeza=B.cabeza - 6, mano_c='garra',
               extra={'fase': 0, 'viento': 0.4, 'carga': 2})
    l1 = B.con(tronco=B.tronco + 14, hombro_c=84, codo_c=4, hombro_l=-36, codo_l=30, muslo_c=30, rodilla_c=24,
               muslo_l=-24, rodilla_l=8, pie_l=-10, mano_c='abierta', cabeza=B.cabeza,
               extra={'fase': 1, 'viento': 1.4, 'carga': 3, 'boca': 3, 'destello': 2})
    l2 = l1.con(hombro_c=88, codo_c=6, tronco=B.tronco + 10, extra={'fase': 2, 'viento': 1.0, 'carga': 3,
                                                                   'boca': 2, 'destello': 1})
    l3 = l1.con(hombro_c=74, codo_c=14, tronco=B.tronco + 8, extra={'fase': 3, 'viento': 0.6, 'carga': 1})
    A['lanzar'] = Anim([l0, l1, l2, l3], 9, False)
    A['disparar'] = Anim([l1, l2, l3], 10, False)

    # Salto: se agacha (anticipación) y sube recogido; caída con brazos abiertos; aterrizaje que aplasta.
    s0 = B.con(tronco=B.tronco + 24, muslo_c=50, rodilla_c=96, muslo_l=30, rodilla_l=96, hombro_c=-40, codo_c=40,
               hombro_l=-50, codo_l=40, hunde=2.5, cabeza=B.cabeza + 8, extra={'fase': 0, 'viento': 0.3, 'carga': 1})
    s1 = B.con(tronco=B.tronco - 4, muslo_c=60, rodilla_c=90, pie_c=-30, muslo_l=30, rodilla_l=100, pie_l=-40,
               hombro_c=140, codo_c=30, hombro_l=120, codo_l=30, cabeza=B.cabeza - 10,
               extra={'fase': 2, 'viento': 2.0, 'carga': 2, 'boca': 2, 'subiendo': 1})
    s2 = s1.con(muslo_c=70, rodilla_c=110, muslo_l=44, rodilla_l=116, hombro_c=110, hombro_l=96,
                extra={'fase': 3, 'viento': 1.6, 'carga': 2, 'subiendo': 1})
    A['salto'] = Anim([s0, s1, s2], 8, False)
    A['subida'] = Anim([s1, s2], 8, False)
    c1 = B.con(tronco=B.tronco + 6, muslo_c=30, rodilla_c=40, pie_c=-20, muslo_l=0, rodilla_l=36, pie_l=-30,
               hombro_c=120, codo_c=30, hombro_l=100, codo_l=30, mano_c='abierta', mano_l='abierta',
               extra={'fase': 4, 'viento': -1.6, 'boca': 2})
    A['caida'] = Anim([c1, c1.con(hombro_c=110, hombro_l=92, extra={'fase': 5, 'viento': -1.8, 'boca': 2})],
                      8, True)
    t0 = B.con(tronco=B.tronco + 30, muslo_c=56, rodilla_c=110, muslo_l=32, rodilla_l=112, hombro_c=40, codo_c=20,
               hombro_l=20, codo_l=20, hunde=3, cabeza=B.cabeza + 12, extra={'fase': 6, 'viento': 0.8, 'polvo': 1})
    A['aterrizar'] = Anim([t0, t0.con(hunde=2, extra={'fase': 7, 'viento': 0.4, 'polvo': 2}), s0.con(extra={})],
                          12, False)

    # Esquivar: retrocede de un salto ladeado.
    A['esquivar'] = Anim([
        s0,
        B.con(tronco=B.tronco - 16, muslo_c=-6, rodilla_c=40, muslo_l=-36, rodilla_l=50, hombro_c=-30, codo_c=40,
              hombro_l=-50, codo_l=30, cabeza=B.cabeza - 6, dx=-3, extra={'fase': 3, 'viento': -1.5}),
        B.con(tronco=B.tronco - 6, muslo_c=10, rodilla_c=20, muslo_l=-20, rodilla_l=20, hombro_c=-10, hombro_l=-20,
              dx=-2, extra={'fase': 5, 'viento': -0.6})], 10, False)

    A['interactuar'] = Anim([
        B.con(tronco=B.tronco + 8, hombro_c=60, codo_c=20, mano_c='abierta', extra={'fase': 0, 'viento': 0.2}),
        B.con(tronco=B.tronco + 12, hombro_c=78, codo_c=8, mano_c='abierta', hunde=1, extra={'fase': 1, 'viento': 0.2})],
        4, False)

    # Daño: sacudida hacia atrás, cabeza atrás; se recompone.
    d0 = B.con(tronco=B.tronco - 18, cabeza=B.cabeza - 18, hombro_c=-40, codo_c=50, hombro_l=-50, codo_l=40,
               muslo_c=16, rodilla_c=16, muslo_l=-10, rodilla_l=12, cara='dolor', mano_c='abierta', mano_l='abierta',
               dx=-2, extra={'fase': 2, 'viento': -1.2, 'boca': 3, 'golpeado': 1})
    d1 = d0.con(tronco=B.tronco - 8, cabeza=B.cabeza - 6, hombro_c=-16, hombro_l=-26, dx=-1,
                extra={'fase': 3, 'viento': -0.5, 'boca': 2, 'golpeado': 0})
    A['dano'] = Anim([d0, d1, B.con(extra={'fase': 4, 'viento': 0.2})], 9, False)

    # Aturdido / agotado: encorvado, la cabeza cuelga y se bambolea, estrellitas (chispas) alrededor.
    at = B.con(tronco=B.tronco + 26, cabeza=B.cabeza + 18, hombro_c=6, codo_c=10, hombro_l=-2, codo_l=10,
               muslo_c=24, rodilla_c=40, muslo_l=-2, rodilla_l=36, hunde=2, cara='parpadeo', mano_c='abierta',
               mano_l='abierta')
    A['aturdido'] = Anim([at.con(extra={'fase': i, 'viento': 0.1, 'mareo': i, 'apagado': 1},
                                 cabeza=at.cabeza + [0, 6, 2, -4][i], dx=[0, 1, 0, -1][i], hunde=2 + (i % 2) * 0.5)
                          for i in range(4)], 5, True)
    A['agotado'] = A['aturdido']

    # Purificar: se arrodilla, la corrupción se apaga y queda envuelto en luz cálida.
    pu = B.con(tronco=B.tronco + 10, muslo_c=24, rodilla_c=114, pie_c=-80, muslo_l=8, rodilla_l=98, pie_l=-84,
               hombro_c=20, codo_c=40, hombro_l=10, codo_l=40, cabeza=B.cabeza + 10, mano_c='abierta',
               mano_l='abierta')
    A['purificar'] = Anim([
        at.con(extra={'fase': 0, 'chispas': 0, 'apagado': 1}),
        pu.con(extra={'fase': 1, 'chispas': 1, 'purificado': 1}),
        pu.con(cabeza=B.cabeza + 2, tronco=B.tronco + 4, extra={'fase': 2, 'chispas': 2, 'purificado': 1}),
        pu.con(cabeza=B.cabeza - 6, tronco=B.tronco, hombro_c=60, hombro_l=50,
               extra={'fase': 3, 'chispas': 3, 'purificado': 1}),
        pu.con(cabeza=B.cabeza - 8, tronco=B.tronco - 2, hombro_c=70, hombro_l=60, cara='parpadeo',
               extra={'fase': 4, 'chispas': 4, 'purificado': 1})], 5, False)

    # Morir (calmado / vencido, sin violencia): se dobla, cae de rodillas, se desploma y parte de él se deshace
    # en humo; el último cuadro queda inconsciente y en calma.
    m0 = d0.con(extra={'fase': 1, 'viento': -1.0, 'boca': 3})
    m1 = B.con(tronco=B.tronco + 30, cabeza=B.cabeza + 20, hombro_c=10, codo_c=30, hombro_l=0, codo_l=30,
               muslo_c=40, rodilla_c=80, muslo_l=16, rodilla_l=80, cara='dolor', mano_c='abierta', mano_l='abierta',
               extra={'fase': 2, 'apagado': 1})
    m2 = pu.con(tronco=B.tronco + 40, cabeza=B.cabeza + 24, hombro_c=30, hombro_l=20, cara='parpadeo',
                extra={'fase': 3, 'apagado': 1, 'disolver': 0.15, 'fase_humo': 0})
    m3 = pu.con(tronco=B.tronco + 62, cabeza=B.cabeza + 20, hombro_c=56, codo_c=20, hombro_l=46, codo_l=20,
                muslo_c=60, rodilla_c=150, muslo_l=44, rodilla_l=134, cara='parpadeo',
                extra={'fase': 4, 'apagado': 1, 'disolver': 0.3, 'fase_humo': 1})
    # postrado: el pecho sobre las rodillas, brazos al suelo; queda inconsciente (la corrupción se fue en humo)
    tend = pu.con(tronco=86, cabeza=16, hombro_c=166, codo_c=8, hombro_l=158, codo_l=14, muslo_c=88, rodilla_c=178,
                  pie_c=-84, muslo_l=74, rodilla_l=164, pie_l=-84, cara='parpadeo', hunde=1)
    m4 = tend.con(extra={'fase': 5, 'apagado': 1, 'tendido': 1, 'disolver': 0.3, 'fase_humo': 2})
    m5 = tend.con(extra={'fase': 6, 'apagado': 1, 'tendido': 1, 'disolver': 0.12, 'fase_humo': 3})
    A['morir'] = Anim([m0, m1, m2, m3, m4, m5], 6, False)
    return A
