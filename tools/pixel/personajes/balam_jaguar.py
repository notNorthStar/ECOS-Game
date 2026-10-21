"""Balam jaguar (~60 px de alto, ~100 de largo): Balam transformado en el jaguar luminoso aliado del Nivel 10. Diseño
de su hoja Codex: jaguar poderoso de pelaje azul noche con rosetas oscuras, una red de grietas turquesa que brillan
y laten, y un degradado violeta → rosa mexicano hacia la panza, las patas y las garras; orejas con borde rosa y ojo
turquesa encendido.

Cuadrúpedo con el rig de `_criaturas.Cuadrupedo` (patas por cinemática inversa). El cuerpo (pecho, costillar y anca)
se arma con primitivas sombreadas; las rosetas y las grietas salen de un diagrama de Voronoi calculado en
coordenadas del LOMO (celdas alrededor de cada roseta, grietas en sus bordes), así el patrón se estira y se encoge
con el galope sin "nadar" sobre el cuerpo."""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Material, Paleta, desplazar, mas  # noqa: E402
from personajes._criaturas import Cuadrupedo, PoseQ, chispas, con_patas, galope  # noqa: E402

PAL = Paleta([
    Material('pelo',  ['#0f1826', '#152536', '#1c3340', '#24394a', '#33505a'],  '#0a0f1a'),
    Material('turq',  ['#128a8a', '#2ad0c0', '#9af8e8'],                        '#0a3a40'),
    Material('viol',  ['#2a0a40', '#5a1890', '#9a3ae0'],                        '#120e1a'),
    Material('rosa',  ['#a8125e', '#e8207e', '#ff6ab0'],                        '#2a0a40'),
    Material('hueso', ['#9aa0bc', '#dcdff0', '#fff4cc'],                        '#152536'),
])


def _centros(largo: float, paso: float = 7.0, semilla: int = 7):
    """Centros de las rosetas en coordenadas del lomo (s a lo largo en px, h sobre el eje en px)."""
    out = []
    for i in range(-3, int(largo / paso) + 4):
        for j in range(-4, 5):
            hsh = (i * 92821 + j * 68917 + semilla * 1237) & 0xffff
            jx = ((hsh % 100) / 100 - 0.5) * paso * 0.7
            jy = (((hsh >> 7) % 100) / 100 - 0.5) * paso * 0.6
            out.append((i * paso + jx + (j % 2) * paso * 0.5, j * paso * 0.82 + jy))
    return np.array(out, float)


def celdas(capa, sel: np.ndarray, H, v, n, mat_pelo, mat_brillo, pulso: int, semilla: int = 7):
    """Rosetas oscuras + grietas turquesa en los bordes de las celdas, para los píxeles `sel` de la capa."""
    L = math.hypot(*v) or 1.0
    u = (v[0] / L, v[1] / L)
    C = _centros(L, semilla=semilla)
    ys, xs = np.nonzero(sel)
    if not len(ys):
        return
    wx = xs + 0.5 - capa.ox - H[0]
    wy = ys + 0.5 - capa.oy - H[1]
    s = wx * u[0] + wy * u[1]
    h = wx * n[0] + wy * n[1]
    d = np.hypot(s[:, None] - C[None, :, 0], h[:, None] - C[None, :, 1])
    orden = np.argsort(d, axis=1)
    i1, i2 = orden[:, 0], orden[:, 1]
    d1 = d[np.arange(len(d)), i1]
    d2 = d[np.arange(len(d)), i2]
    for k in range(len(ys)):
        y, x = ys[k], xs[k]
        if capa.ton[y, x] < 0:
            continue
        if d2[k] - d1[k] < 0.95:
            # grieta: algunas aristas no se dibujan (la red queda quebrada, no una rejilla)
            a, b = sorted((int(i1[k]), int(i2[k])))
            hs = (a * 7919 + b * 104729) % 7
            if hs in (0, 3):
                continue
            capa.mat[y, x] = mat_brillo
            capa.ton[y, x] = 1 if (pulso and hs % 2) else 0
            capa.fijo[y, x] = True
        elif d1[k] < 1.5:
            capa.ton[y, x] = 0
            capa.fijo[y, x] = True
        elif d1[k] < 2.3 and capa.ton[y, x] > 1:
            capa.ton[y, x] -= 1


class BalamJaguar(Cuadrupedo):
    id = 'balam_jaguar'
    tipo = 'criatura'
    fw, fh = 128, 80
    pivote = (64, 77)
    alto = 60
    paleta = PAL
    L_lomo = 40
    alto_cuerpo = 37
    del_seg = (17.0, 16.0, 5.0)
    tra_seg = (19.0, 17.0, 10.0)
    alto_pata = 2.0
    sep_patas = 3.0
    L_cuello = 11
    cola_n, cola_L = 10, 3.6

    # ---- patas: musculosas arriba, se encienden de violeta a rosa hacia las garras ---------------
    def pata(self, capa, p, lado, delantera, pose):
        P = self.paleta
        pe, vi, ro = P['pelo'], P['viol'], P['rosa']
        a3 = math.radians(p['a3'])
        fwd = (math.cos(a3), -math.sin(a3))
        # zarpa con dedos
        capa.capsula(mas(p['pie'], fwd, -1.2), mas(p['pie'], fwd, 3.0), 2.2, 1.9, ro, tonos=(0, 1, 2))
        capa.capsula(p['muneca'], p['pie'], 2.4, 2.2, vi, tonos=(0, 1, 2))
        t4 = (2, 3, 4)
        if delantera:
            capa.capsula(p['medio'], p['muneca'], 3.1, 2.5, pe, tonos=t4, bandas=[(0.6, 1.2, vi, (0, 1, 2))])
            antes = capa.mascara()
            capa.capsula(p['raiz'], p['medio'], 5.8, 3.4, pe, tonos=t4)
        else:
            capa.capsula(p['medio'], p['muneca'], 3.0, 2.5, pe, tonos=t4, bandas=[(0.55, 1.2, vi, (0, 1, 2))])
            antes = capa.mascara()
            capa.capsula(p['raiz'], p['medio'], 7.4, 3.6, pe, tonos=t4)
        # rosetas y grietas del muslo / brazo, fijas al hueso (se mueven con la pata)
        r, m = p['raiz'], p['medio']
        v = (m[0] - r[0], m[1] - r[1])
        Lv = math.hypot(*v) or 1
        nn = (v[1] / Lv, -v[0] / Lv)
        celdas(capa, capa.mascara() & ~antes, r, v, nn, pe, P['turq'], pose.extra.get('pulso', 0),
               semilla=3 if delantera else 11)
        x, y = capa.a_px(mas(p['pie'], fwd, 1.6))
        capa.pon(x, y - 1, ro, 0, fijo=True)
        capa.pon(x + (1 if fwd[0] >= 0 else -1), y - 1, ro, 2, fijo=True)
        # garras
        if pose.extra.get('garras') and delantera:
            for k in range(3):
                b = mas(mas(p['pie'], fwd, 3.8), (0, 1), -1.5 + k * 1.2)
                capa.pon_m(mas(b, fwd, 1), P['hueso'], 2, fijo=True)

    # ---- cuerpo --------------------------------------------------------------------------------
    def cuerpo(self, p, c, pose):
        P = self.paleta
        pe, tu, vi = P['pelo'], P['turq'], P['viol']
        H, S, n = c['cadera'], c['hombro'], c['n']
        v = (S[0] - H[0], S[1] - H[1])
        enc = pose.extra.get('encorva', 0)

        def Lc(t, h):
            return mas(mas(H, v, t), n, h + enc * 3 * math.sin(math.pi * max(0, min(1, t))))

        t4 = (2, 3, 4)
        p.capsula(Lc(0.05, 1.5), Lc(0.95, 1.0), 9.0, 10.0, pe, tonos=t4)
        p.elipse(Lc(0.0, 1.5), 10.0, 10.5, pe, tonos=t4)            # anca
        p.elipse(Lc(0.96, 0.5), 10.2, 11.5, pe, tonos=t4)            # pecho y hombro
        p.elipse(Lc(0.82, 6.5), 7.0, 4.5, pe, tonos=(3, 4, 4))       # omóplato
        p.elipse(Lc(1.12, -3.5), 5.5, 6.5, pe, tonos=t4)            # pecho delantero
        # sombra de la panza y brillo violeta de abajo
        m = p.mascara()
        bajo1 = m & ~desplazar(m, 0, -1)
        bajo2 = m & ~desplazar(m, 0, -2) & ~bajo1
        bajo3 = m & ~desplazar(m, 0, -5) & ~bajo1 & ~bajo2
        p.ton[bajo3] = np.maximum(1, p.ton[bajo3] - 1)
        celdas(p, m & ~bajo1 & ~bajo2, H, v, n, pe, tu, pose.extra.get('pulso', 0))
        p.mat[bajo1 | bajo2] = vi
        p.ton[bajo1] = 1
        p.ton[bajo2] = 2
        p.fijo[bajo1 | bajo2] = False
        c['Lc'] = Lc

    # ---- cola larga que baja y se enrosca hacia arriba al final ----------------------------------
    def cola(self, capa, pts, pose):
        P = self.paleta
        pe, vi = P['pelo'], P['viol']
        n = len(pts) - 1
        for i in range(n):
            r0 = 3.6 - 1.8 * i / n
            r1 = 3.6 - 1.8 * (i + 1) / n
            if i >= n - 2:
                capa.capsula(pts[i], pts[i + 1], r0, r1, vi, tonos=(0, 1, 2))
            else:
                capa.capsula(pts[i], pts[i + 1], r0, r1, pe, tonos=(2, 3, 4))
        # anillos oscuros hacia la punta
        for i in range(4, n - 2, 2):
            capa.pon_m(pts[i], pe, 0, fijo=True)
            capa.pon_m(mas(pts[i], (0, 1)), pe, 1, fijo=True)

    # ---- cabeza --------------------------------------------------------------------------------
    def cabeza(self, lz, c, pose):
        P = self.paleta
        pe, tu, ro, hu, vi = P['pelo'], P['turq'], P['rosa'], P['hueso'], P['viol']
        cen = c['cuello1']
        ang = math.radians(pose.cabeza + pose.giro)
        R = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
        K = 1.2

        def L(dx, dy):
            q = R @ np.array([dx * K, dy * K])
            return cen[0] + q[0], cen[1] + q[1]

        orej = pose.orejas
        boca = pose.boca
        # oreja lejana
        f = lz.parte()
        f.elipse(L(-5.2 - orej, -6.0 + orej * 2), 2.4 * K, 2.6 * K, pe, tonos=(1, 2, 3))
        # cuello grueso con melena corta
        q = lz.parte()
        q.capsula(c['cuello0'], L(-3, 2), 7.5, 6.0, pe, tonos=(2, 3, 4))
        # mandíbula (baja con la boca abierta)
        j = lz.parte()
        j.capsula(L(1.5, 4.8 + boca * 0.5), L(8.6, 4.6 + boca * 1.1), 2.0 * K, 1.4 * K, pe, tonos=(1, 2, 3))
        # cráneo, mejilla, hocico
        h = lz.parte()
        h.elipse(L(0, 0), 7.0 * K, 6.0 * K, pe, tonos=(2, 3, 4))
        h.elipse(L(-1.5, 3.0), 5.0 * K, 4.2 * K, pe, tonos=(2, 3, 4))
        h.capsula(L(4.5, 0.6), L(9.6, 1.6), 3.4 * K, 2.8 * K, pe, tonos=(2, 3, 4))
        h.elipse(L(-3.6 - orej, -5.4 + orej * 2), 2.6 * K, 2.8 * K, pe, tonos=(2, 3, 4))   # oreja cercana
        g = lz.parte()
        # borde rosa de la oreja e interior violeta
        ox, oy = g.a_px(L(-3.6 - orej, -5.4 + orej * 2))
        for dx, dy in ((-1, -2), (0, -3), (1, -2), (-2, -1), (2, -1)):
            g.pon(ox + dx, oy + dy, ro, 1 if dy < -2 else 0, fijo=True)
        g.pon(ox, oy - 1, vi, 1, fijo=True)
        g.pon(ox, oy, vi, 0, fijo=True)
        # nariz rosa
        g.pon_m(L(11.4, 0.2), ro, 1, fijo=True)
        g.pon_m(L(12.2, 0.2), ro, 2, fijo=True)
        g.pon_m(L(11.8, 1.2), ro, 0, fijo=True)
        g.linea(L(11.4, 1.6), L(11.0, 3.2), pe, 0, fijo=True)            # surco del labio
        # ojo turquesa encendido, ceja y lágrima oscura
        ex, ey = g.a_px(L(4.0, -2.2))
        if pose.ojos in ('cerrado', 'feliz'):
            g.pon(ex - 1, ey, pe, 0, fijo=True)
            g.pon(ex, ey + (0 if pose.ojos == 'cerrado' else -1), pe, 0, fijo=True)
            g.pon(ex + 1, ey, pe, 0, fijo=True)
        else:
            g.pon(ex - 1, ey, tu, 1, fijo=True)
            g.pon(ex, ey, tu, 2, fijo=True)
            g.pon(ex + 1, ey, hu, 2, fijo=True)
            g.pon(ex, ey + 1, tu, 0, fijo=True)
            g.pon(ex + 1, ey + 1, tu, 1, fijo=True)
        g.linea(L(1.0, -4.4), L(5.8, -4.0), pe, 0, fijo=True)
        g.linea(L(3.4, -0.6), L(5.0, 2.4), pe, 1, fijo=True)
        # boca: línea o fauces abiertas con colmillos
        if boca > 0.5:
            for i in range(int(round(boca)) + 1):
                g.linea(L(4.5, 3.8 + i * 0.8), L(10.6, 3.4 + i * 1.0), vi, 0, fijo=True)
            g.pon_m(L(10.0, 3.6), hu, 2, fijo=True)
            g.pon_m(L(10.0, 4.6), hu, 1, fijo=True)
            g.pon_m(L(9.0, 3.4 + boca * 1.1), hu, 2, fijo=True)
        else:
            g.linea(L(5, 4.0), L(10.8, 3.4), pe, 0, fijo=True)
        # rosetas de la cabeza y una grieta que sube por la frente
        for (dx, dy) in ((-3, -2), (-1, -4.5), (-5, 1), (-3, 4.5), (0.5, 4.0), (2, -5)):
            g.pon_m(L(dx, dy), pe, 1, fijo=True)
        pul = pose.extra.get('pulso', 0)
        g.linea(L(-6, 2), L(-2.5, -0.5), tu, 1 if pul else 0, fijo=True)
        g.linea(L(-2.5, -0.5), L(0.5, -5.2), tu, 1 if pul else 0, fijo=True)
        # bigotes
        g.pon_m(L(9.0, 2.2), hu, 0)
        g.pon_m(L(7.6, 2.6), hu, 0)
        c['cabeza_centro'] = cen
        return [(f, 'contorno', 1), (q, 'contorno', 0), (j, 'contorno', 0), (h, 'contorno', 0, 1), (g, None, 0)]

    def retoques(self, lz, c, pose):
        P = self.paleta
        ch = pose.extra.get('chispas')
        if ch is not None:
            cen = c.get('centro', (0, -30))
            chispas(lz, (cen[0], cen[1] - 4), P['turq'], int(ch), radio=34, n=10, tono_alto=2, tono_bajo=0)
        z = pose.extra.get('zzz')
        if z is not None:
            cen = c.get('cabeza_centro', (0, -12))
            x, y = lz.a_px((cen[0] + 8 + z * 2, cen[1] - 12 - z * 3))
            for dx, dy in ((0, 0), (1, 0), (2, 0), (1, 1), (0, 2), (1, 2), (2, 2)):
                lz.pon(x + dx, y + dy, P['turq'], 2, fx=True)


# =============================================================================================
#  Animaciones
# =============================================================================================

B = PoseQ(lomo=1, alto=0, cuello=118, cabeza=4, dc=(2, 0, 8), dl=(-1, 0, 8), tc=(2, 0, 14), tl=(-1, 0, 14),
          cola=(-55, -10, 0))


def animaciones():
    A = {}
    # Reposo: respira hondo, la cola ondula y las grietas laten.
    rep = []
    for i in range(6):
        s = math.sin(i / 6 * 2 * math.pi)
        rep.append(B.con(alto=0.6 * s, cabeza=4 - 2 * s, cola=(-55 + 4 * s, -10 - 2 * s, 3 * s),
                         ojos='cerrado' if i == 4 else 'normal', extra={'pulso': i in (0, 1, 5)}))
    A['reposo'] = Anim(rep, 5, True)
    # Caminar: paso lateral pesado, la cabeza baja y sube.
    cam = []
    for i in range(8):
        f = i / 8
        s = math.sin(f * 4 * math.pi)
        cam.append(con_patas(B, B.con(alto=0.8 * s, cabeza=4 - 2 * s, cola=(-55 + 4 * math.sin(f * 2 * math.pi), -10, 3),
                                      extra={'pulso': i % 4 == 0}),
                             (f + 0.75, f + 0.25, f + 0.5, f), 22, 6, 0.62, ang_d=8, ang_t=14))
    A['caminar'] = Anim(cam, 9, True)
    # Correr: galope poderoso.
    A['correr'] = Anim(galope(B.con(lomo=0, cuello=118, cabeza=8, cola=(-75, -6, 0), orejas=0.4,
                                    extra={'pulso': 1}), B, escala=2.3), 13, True)
    # Ataque (preparación 0,45 s + embestida): se agazapa, la cola latiguea; salta con las garras por delante.
    ag = B.con(lomo=-5, alto=-6, cuello=108, cabeza=10, dc=(5, 0, 8), dl=(2, 0, 8), tc=(-2, 0, 32), tl=(-5, 0, 32),
               cola=(-80, -6, 4), orejas=0.8, boca=1, extra={'pulso': 1})
    salto = B.con(lomo=8, alto=2, cuello=135, cabeza=0, dc=(22, 6, 60), dl=(18, 4, 50), tc=(-18, 3, -30),
                  tl=(-22, 2, -35), cola=(-95, -4, 0), boca=3, orejas=0.6, extra={'pulso': 1, 'garras': 1, 'alzar': 4})
    A['ataque'] = Anim([ag, ag.con(cola=(-70, -8, -4), alto=-7, extra={'pulso': 0}), ag.con(alto=-7.5, boca=2),
                        ag.con(cola=(-85, -5, 5), alto=-7, extra={'pulso': 0}), salto,
                        salto.con(boca=4, dc=(24, 5, 70), extra={'pulso': 0, 'garras': 1, 'alzar': 4})], 10, False)
    # Golpe: zarpazo de pie.
    golpe = [B.con(lomo=8, cuello=140, cabeza=0, dc=(10, 14, 60), boca=2, orejas=0.4, extra={'garras': 1}),
             B.con(lomo=0, cuello=120, cabeza=10, dc=(20, 2, 80), boca=3, extra={'garras': 1, 'pulso': 1}),
             B.con(dc=(8, 0, 10))]
    A['golpe'] = Anim(golpe, 10, False)
    A['disparar'] = A['golpe']
    A['lanzar'] = A['golpe']
    # Rugido (conjuro / invocar): se yergue un poco y ruge al cielo; brillan las grietas.
    rug = B.con(lomo=10, alto=1, cuello=150, cabeza=-22, boca=4, orejas=0.5, cola=(-60, -12, 0),
                dc=(4, 0, 6), dl=(1, 0, 6))
    A['invocar'] = Anim([rug.con(boca=2, cabeza=-10, extra={'pulso': 0, 'chispas': 0}),
                         rug.con(extra={'pulso': 1, 'chispas': 1}),
                         rug.con(cabeza=-26, extra={'pulso': 1, 'chispas': 2}),
                         rug.con(extra={'pulso': 0, 'chispas': 3})], 6, True)
    A['conjuro'] = A['invocar']
    # Salto / caída / aterrizaje.
    agach = B.con(lomo=-3, alto=-5, cuello=115, cabeza=8, tc=(-2, 0, 32), tl=(-5, 0, 32), cola=(-75, -6, 0))
    vuelo = B.con(lomo=12, alto=2, cuello=135, dc=(20, 10, 70), dl=(16, 8, 60), tc=(-18, 3, -20), tl=(-22, 4, -20),
                  cola=(-95, -4, 0), extra={'pulso': 1})
    A['salto'] = Anim([agach, vuelo], 8, False)
    A['subida'] = Anim([vuelo], 1, False)
    A['caida'] = Anim([B.con(lomo=-10, alto=3, cuello=120, cabeza=8, dc=(10, 0, 4), dl=(7, 2, 4), tc=(-4, 10, 40),
                             tl=(-7, 12, 40), cola=(-40, -12, 0))], 1, False)
    A['aterrizar'] = Anim([B.con(lomo=-4, alto=-6, cuello=115, cabeza=10, tc=(1, 0, 30), tl=(-2, 0, 30),
                                 dc=(6, 0, 10), extra={'pulso': 1}), B], 10, False)
    # Esquivar: salto lateral hacia atrás.
    A['esquivar'] = Anim([agach, B.con(lomo=-4, alto=2, cuello=135, cabeza=-4, dc=(0, 8, 30), dl=(-3, 6, 30),
                                       tc=(4, 4, 0), tl=(1, 3, 0), dx=-3, extra={'encorva': 0.5, 'alzar': 3}),
                          agach], 10, False)
    # Interactuar: olfatea.
    hus = B.con(lomo=-4, alto=-1, cuello=92, cabeza=22)
    A['interactuar'] = Anim([hus, hus.con(cabeza=26, alto=-2), hus], 5, False)
    # Daño: respinga hacia atrás.
    A['dano'] = Anim([B.con(lomo=8, alto=1, cuello=145, cabeza=-16, ojos='cerrado', orejas=1, boca=2, dx=-2,
                            cola=(-30, -14, 0)), B.con(lomo=3, cabeza=-4, orejas=0.5)], 8, False)
    # Aturdido: sacude la cabeza.
    A['aturdido'] = Anim([B.con(alto=-2, cuello=115, cabeza=12 + 8 * math.sin(k * 1.7), orejas=0.6,
                                ojos='cerrado' if k % 2 else 'normal') for k in range(4)], 6, True)
    # Agotado / purificar / morir: se echa; en purificar brilla sereno; en morir se duerme (es aliado).
    ech = B.con(lomo=0, alto=-17, cuello=112, cabeza=14, dc=(20, 0, 84), dl=(16, 0, 84), tc=(10, 0, 86), tl=(6, 0, 86),
                cola=(-90, 6, 0), orejas=0.3)
    A['agotado'] = Anim([ech, ech.con(alto=-16.5, cabeza=12, extra={'pulso': 1}), ech, ech.con(ojos='cerrado')],
                        3, True)
    sen = B.con(lomo=34, alto=-6, cuello=160, cabeza=-4, dc=(1, 0, 4), dl=(-3, 0, 4), tc=(-6, 0, 84), tl=(-9, 0, 84),
                cola=(-90, 8, 0))
    A['purificar'] = Anim([sen.con(ojos='feliz', extra={'pulso': k % 2, 'chispas': k}) for k in range(4)], 5, False)
    dor = ech.con(alto=-18, cuello=100, cabeza=26, ojos='cerrado', cola=(-80, 14, 0))
    A['morir'] = Anim([A['dano'].poses[0], ech, dor, dor.con(extra={'zzz': 0}), dor.con(extra={'zzz': 1})], 5, False)
    return A


PERSONAJE = BalamJaguar()
