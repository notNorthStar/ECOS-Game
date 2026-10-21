"""Chaneque Mayor (jefe del Nivel 1, ~100 px): criatura del folclor, piel terracota, nariz larga y ganchuda,
orejas puntiagudas, cabellera/sombrero en forma de cuerno, taparrabo andrajoso, garras. Corrompido por la antena:
vetas moradas que laten y ojos con brillo. Al purificarse las vetas se apagan y los ojos se vuelven cálidos.

Es grande, así que casi todo se dibuja con primitivas sombreadas (cápsulas, elipses, polígonos) en el espacio del
mundo —giran sin deformarse— y los detalles (ojos, dientes, vetas, uñas) se ponen píxel a píxel."""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas, mat_rot  # noqa: E402
from humanoide import Humanoide  # noqa: E402
from manos import dibujar_mano  # noqa: E402

PAL = Paleta([
    Material('piel',     ['#3a1a18', '#6a2e24', '#9a4630', '#c46a40', '#e0905a'],  '#2a100e'),
    Material('pelo',     ['#1e120e', '#3a2418', '#5c3a24', '#8a5a34'],             '#140a08'),
    Material('trapo',    ['#1e1410', '#33241a', '#4a3626', '#64503a'],             '#140a08'),
    Material('hueso',    ['#8a857e', '#d8cfb0', '#fff4cc'],                        '#3a2418'),
    Material('morado',   ['#2a0a40', '#5a1890', '#9a3ae0', '#d89aff'],             '#2a0a40'),
    Material('oro',      ['#d0742c', '#f2a640', '#ffd77a', '#fff4cc'],             '#7a3a1a'),
    Material('una',      ['#5c3a24', '#b3ab9c', '#e8e0c8'],                        '#2a100e'),
])

# Anclas del torso (relativas a la cadera, con el torso ERGUIDO; la pose lo encorva con `tronco`).
ANCLAS = {'o': (0, 0), 'barriga': (1, -9), 'pecho': (1, -17), 'cuello': (2, -27), 'hombro_c': (1, -23),
          'hombro_l': (-3, -23)}
_TORSO_VACIO = Mapa(['.'], {}, PAL, {k: v for k, v in ANCLAS.items()})


class ChanequeMayor(Humanoide):
    id = 'chaneque_mayor'
    tipo = 'criatura'
    fw, fh = 128, 128
    pivote = (64, 124)
    alto = 100
    L_muslo, L_pierna, L_pie, alto_tobillo = 19, 19, 11, 3
    L_brazo, L_ante = 21, 19
    sep_cadera = (2.0, -2.0)
    torso_cizalla_max = 0.0
    paleta = PAL

    def torso_mapa(self, pose):
        return _TORSO_VACIO

    def orden(self, pose):
        o = ['brazo_l', 'pierna_l', 'torso', 'pierna_c', 'taparrabo', 'cabeza', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    # ---- piernas: flacas, rodillas nudosas, pies grandes descalzos -----------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        pi = P['piel']
        t = (1, 2, 3)
        # pie: del talón a la punta, dedos con uñas
        capa.capsula(p['talon'], p['punta'], 2.1, 1.7, pi, tonos=t)
        r = math.radians(p['ang_pie'])
        fwd = (math.cos(r), -math.sin(r))
        for k, off in enumerate((-1.5, 0.5)):
            tip = mas(mas(p['punta'], fwd, 1.5), (math.sin(r), math.cos(r)), off)
            capa.pon_m(tip, P['una'], 1)
        capa.capsula(p['rodilla'], p['tobillo'], 2.9, 2.1, pi, tonos=t)
        capa.capsula(p['cadera'], p['rodilla'], 3.8, 3.0, pi, tonos=t)
        capa.elipse(p['rodilla'], 3.0, 3.0, pi, tonos=(2, 3, 4))   # rodilla nudosa
        if pose.extra.get('vetas', True):
            self.vetas(capa, [p['cadera'], p['rodilla'], p['tobillo']], 0.2 + (0.4 if lado == 'c' else 0.1), pose)

    # ---- brazos: largos, garras ----------------------------------------------------------------
    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        pi = P['piel']
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        dibujar_mano(capa, P, b, 'garra' if mano in ('puno', 'garra') else mano, tam=1.5)
        capa.capsula(b['codo'], b['muneca'], 2.4, 1.9, pi, tonos=(1, 2, 3))
        capa.capsula(b['hombro'], b['codo'], 3.0, 2.4, pi, tonos=(1, 2, 3))
        capa.elipse(b['codo'], 2.6, 2.6, pi, tonos=(2, 3, 4))
        if pose.extra.get('vetas', True):
            self.vetas(capa, [b['hombro'], b['codo'], b['muneca']], 0.55, pose)

    # ---- torso por código: barriga, costillas, joroba ------------------------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        p = lz.parte()
        tor = c['torso']
        cad = c['cadera_torso']
        pi = P['piel']
        bar, pec, cue = tor.punto('barriga'), tor.punto('pecho'), tor.punto('cuello')
        p.capsula(cad, bar, 6.6, 7.4, pi, tonos=(1, 2, 3))
        p.capsula(bar, pec, 7.4, 8.6, pi, tonos=(1, 2, 3), pliegues=[(0.25, 1), (0.5, 1), (0.75, 1)])
        p.capsula(pec, cue, 8.2, 5.0, pi, tonos=(1, 2, 3, ))
        # costillas: arcos cortos en el costado iluminado
        u = (pec[0] - bar[0], pec[1] - bar[1])
        L = math.hypot(*u) or 1
        u = (u[0] / L, u[1] / L)
        n = (u[1], -u[0])       # perpendicular hacia adelante
        for k in range(4):
            a = mas(mas(bar, u, 2 + k * 2.6), n, 1.0)
            p.linea(a, mas(a, n, 3.4 - k * 0.3), pi, 1)
        # ombligo y pecho
        p.pon_m(mas(mas(cad, u, 6), n, 5), pi, 0)
        if pose.extra.get('vetas', True):
            self.vetas(p, [cad, bar, pec, cue], 0.35, pose, ancho=1)
        c['eje_torso'] = (u, n)
        return [(p, 'contorno', 0)]

    # ---- taparrabo andrajoso y cuerda --------------------------------------------------------
    def parte_taparrabo(self, lz, c, pose):
        P = self.paleta
        p = lz.parte()
        tr = P['trapo']
        cad = c['cadera_torso']
        u, n = c.get('eje_torso', ((0, -1), (1, 0)))
        for lado in ('l', 'c'):
            pts = c['pierna_' + lado]
            fin = mas(pts['cadera'], dir_ang(pts['ang_muslo']), self.L_muslo * 0.58)
            p.capsula(mas(pts['cadera'], u, 2), fin, 5.6, 4.6, tr, tonos=(1, 2, 3) if lado == 'c' else (0, 1, 2))
        # borde deshilachado: quita píxeles en diente de sierra en la parte baja
        m = p.mascara()
        ys, xs = np.nonzero(m)
        if len(ys):
            ymax = ys.max()
            for y, x in zip(ys, xs):
                # solo en las puntas de cada tira (se mide respecto a la columna)
                col = np.nonzero(m[:, x])[0]
                if y >= col.max() - 2 and ((x * 7 + 3) % 5) < 2 and y > col.max() - ((x * 3) % 3):
                    p.mat[y, x] = -1
        # solapas (delante y atrás) con flecos
        for lado_n, largo in ((1, 14), (-1, 11)):
            top = mas(mas(cad, u, 3), n, 4.5 * lado_n)
            fondo = mas(top, (0, 1), largo)
            p.poligono([mas(top, n, -2.5), mas(top, n, 2.5), mas(fondo, n, 1.8 * lado_n), mas(fondo, n, -2.0 * lado_n)],
                       tr, sombreado=(1, 2, 3), ks=1)
            for k in range(3):
                f0 = mas(fondo, n, (k - 1) * 1.3 * lado_n)
                p.linea(f0, mas(f0, (0.4 * lado_n, 1), 2 + k % 2), tr, 1)
        # cuerda en la cintura
        a = mas(mas(cad, u, 3), n, -6.5)
        b = mas(mas(cad, u, 4), n, 6.5)
        p.linea(a, b, P['pelo'], 2)
        p.pon_m(mas(b, n, -1), P['pelo'], 3)
        return [(p, 'contorno', 0, 1)]

    # ---- cabeza: cráneo, nariz ganchuda, orejas, sonrisa, ojos que brillan, sombrero-cuerno ------
    def parte_cabeza(self, lz, c, pose):
        P = self.paleta
        pi, pe = P['piel'], P['pelo']
        cue = c['cuello']
        K = 1.3   # tamaño de la cabeza (la del chaneque es enorme respecto al cuerpo)
        ang = math.radians(pose.cabeza + pose.giro)
        R = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
        # el cuello sale hacia adelante y arriba; la cabeza cuelga delante de los hombros
        cen = mas(cue, (6 + pose.extra.get('cab_dx', 0), -6 + pose.extra.get('cab_dy', 0)))

        def L(dx, dy):
            v = R @ np.array([dx * K, dy * K])
            return cen[0] + v[0], cen[1] + v[1]

        # 1) cuello, oreja lejana, cráneo, quijada y nariz
        p = lz.parte()
        p.capsula(cue, L(-2, 3), 3.4, 3.2, pi, tonos=(1, 2, 3))
        p.poligono([L(-3, -2), L(-14, -8), L(-11, -5), L(-5, 2)], pi, sombreado=(0, 1, 2))
        p.elipse(L(0, 0), 7.2 * K, 6.4 * K, pi, tonos=(1, 2, 3))
        p.elipse(L(3.5, 4.2), 5.6 * K, 3.6 * K, pi, tonos=(1, 2, 3))
        p.capsula(L(5, -1.5), L(11.5, 1.5), 2.4 * K, 1.8 * K, pi, tonos=(2, 3, 4))
        p.capsula(L(11.5, 1.5), L(12.8, 6.8), 1.8 * K, 0.9 * K, pi, tonos=(1, 2, 3))
        # 2) sombrero-cuerno: anillos que se adelgazan, nace en la coronilla y se curva hacia atrás
        h = lz.parte()
        curva = pose.extra.get('cuerno', 0)
        pts = []
        for k in range(15):
            t = k / 14
            pts.append(L(-2.0 - 6 * t - 9 * t ** 3 - curva * t, -6.5 - 19 * t + 5 * t ** 3))
        rad = [lerpv(6.0 * K, 0.8, i / 14) for i in range(15)]
        for i in range(14):
            tonos = (0, 1, 2) if i % 3 == 2 else (1, 2, 3)
            h.capsula(pts[i], pts[i + 1], rad[i], rad[i + 1], pe, tonos=tonos)
        for k in range(4):   # mechones que caen por la nuca
            a = L(-6 - k * 1.2, -2 + k)
            h.capsula(a, L(-7.5 - k * 1.8, 5 + k * 1.2), 1.6, 0.6, pe, tonos=(0, 1, 2))
        # 3) oreja cercana y la cara
        f = lz.parte()
        f.poligono([L(-3, -3), L(-16, -11), L(-12, -6), L(-8, -2), L(-3.5, 2)], pi, sombreado=(2, 3, 4), ks=1)
        f.linea(L(-5, -1.5), L(-12, -7), pi, 1)
        g = lz.parte()   # detalles sin línea interior
        g.pon_m(L(9.6, 2.6), pi, 0)                                         # fosa nasal
        g.linea(L(-0.5, -3.8), L(5, -3.2), pi, 0)                           # arco de la ceja
        purif = pose.extra.get('purificado', 0)
        ox, oy = g.a_px(L(2.8, -1.6))
        if pose.cara in ('parpadeo', 'dolor'):
            for d in (-1, 0, 1):
                g.pon(ox + d, oy, pi, 0, fijo=True)
        else:
            col = P['oro'] if purif else P['morado']
            t0, t1 = (2, 1) if purif else (3, 2)
            for dx, dy, t in ((-1, 0, t1), (1, 0, t1), (0, -1, t1), (0, 1, t1 - 1)):
                g.pon(ox + dx, oy + dy, col, t, fijo=True)
            g.pon(ox, oy, P['hueso'], 2, fijo=True)
            g.pon(ox + 1, oy, pe, 0, fijo=True)          # pupila hacia adelante
            if not purif:
                g.pon(ox - 1, oy - 1, col, 1, fijo=True)
        boca = pose.extra.get('boca', 0)
        if boca:
            for i in range(8):
                g.linea(L(0.5 + i, 3.6), L(0.5 + i, 3.6 + boca * 0.7), pi, 0)
            for i in range(0, 8, 2):
                g.pon_m(L(1 + i, 3.7), P['hueso'], 2, fijo=True)
                g.pon_m(L(1.5 + i, 3.0 + boca * 0.7), P['hueso'], 1, fijo=True)
        else:
            g.linea(L(0, 4.2), L(8.5, 3.0), pi, 0)
            for i in range(1, 8, 2):
                g.pon_m(L(0.3 + i, 3.4 - i * 0.14), P['hueso'], 2 if i % 4 == 1 else 1, fijo=True)
            g.pon_m(L(-0.8, 3.4), pi, 0)
        if pose.extra.get('vetas', True):
            self.vetas(g, [L(-4, 4), L(-1, 1), L(0, -4.5)], 0.5, pose)
        c['cabeza_centro'] = cen
        return [(p, 'contorno', 0, 1), (h, 'contorno', 0, 1), (f, 'contorno', 0), (g, None, 0)]

    def vetas(self, capa: Capa, pts, fase: float, pose: Pose, ancho: int = 1):
        """Vetas moradas de la corrupción: una línea quebrada siguiendo la parte, con brillo según el cuadro."""
        if pose.extra.get('purificado'):
            return
        P = self.paleta
        mo = P['morado']
        brillo = pose.extra.get('pulso', 0)
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            d = (b[0] - a[0], b[1] - a[1])
            L = math.hypot(*d) or 1
            n = (-d[1] / L, d[0] / L)
            q0 = mas(mas(a, d, 0.15), n, 1.2 * math.sin(fase * 9 + i))
            q1 = mas(mas(a, d, 0.5), n, -1.0)
            q2 = mas(mas(a, d, 0.8), n, 1.0 * math.cos(fase * 7 + i))
            for (s, e) in ((q0, q1), (q1, q2)):
                capa.linea(s, e, mo, 2 if brillo else 1, fijo=True)
            capa.pon_m(q1, mo, 3 if brillo else 2, fijo=True)

    def retoques(self, lz, c, pose):
        P = self.paleta
        ch = pose.extra.get('chispas')
        if ch is None:
            return
        mat = P['oro'] if pose.extra.get('purificado') else P['morado']
        cen = c.get('cabeza_centro', (0, -80))
        pts = [(-22, -10), (18, -24), (26, 6), (-26, 18), (10, -36), (-12, -30), (30, -12), (-30, -2)]
        for j, (dx, dy) in enumerate(pts):
            if (j + ch) % 2 == 0:
                x, y = lz.a_px((cen[0] + dx, cen[1] + dy - ch * 2))
                lz.pon(x, y, mat, 3, fx=True)
                for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if 0 <= y + ey < lz.h and 0 <= x + ex < lz.w and lz.mat[y + ey, x + ex] < 0:
                        lz.pon(x + ex, y + ey, mat, 1, fx=True)


def lerpv(a, b, t):
    return a + (b - a) * t


BASE = Pose(tronco=34, cabeza=0, hombro_c=10, codo_c=30, hombro_l=-6, codo_l=26,
            muslo_c=26, rodilla_c=44, pie_c=0, muslo_l=-4, rodilla_l=36, pie_l=0, mano_c='garra', mano_l='garra')

CAMINAR = [(30, 20, 10), (18, 34, 0), (2, 30, 0), (-14, 26, -6), (-22, 34, -26), (-8, 66, -30), (14, 70, -10),
           (30, 40, 6)]


def animaciones():
    B = BASE
    A = {}
    A['reposo'] = Anim([B, B.con(hunde=1, hombro_c=12, extra={'pulso': 1}), B.con(hunde=1.5, hombro_c=13, codo_c=34),
                        B.con(hunde=0.5, cara='parpadeo', extra={'pulso': 1})], 4, True)
    cam = []
    for i in range(8):
        a = CAMINAR[i]
        b = CAMINAR[(i + 4) % 8]
        s = -math.sin(i / 8 * 2 * math.pi + 0.4)
        cam.append(B.con(tronco=38, muslo_c=a[0], rodilla_c=a[1], pie_c=a[2], muslo_l=b[0], rodilla_l=b[1], pie_l=b[2],
                         hombro_c=10 + 26 * s, codo_c=30 + max(0, 20 * s), hombro_l=-6 - 26 * s,
                         codo_l=26 + max(0, -20 * s), cabeza=4 * s, extra={'pulso': i % 4 == 0}))
    A['caminar'] = Anim(cam, 9, True)
    cor = [p.con(tronco=46, hombro_c=p.hombro_c * 1.6 - 10, hombro_l=p.hombro_l * 1.6 - 10,
                 muslo_c=p.muslo_c * 1.3, muslo_l=p.muslo_l * 1.3, codo_c=50, codo_l=50) for p in cam]
    A['correr'] = Anim(cor, 13, True)
    # Golpe: alza la garra atrás (anunciado), zarpazo hacia abajo y adelante, se recupera.
    g0 = B.con(tronco=20, hombro_c=170, codo_c=40, hombro_l=-30, codo_l=30, muslo_c=10, rodilla_c=24, muslo_l=-14,
               cabeza=-8, extra={'boca': 3})
    g1 = B.con(tronco=26, hombro_c=190, codo_c=60, hombro_l=-36, codo_l=30, muslo_c=8, rodilla_c=30, muslo_l=-16,
               cabeza=-10, extra={'boca': 4, 'pulso': 1})
    g2 = B.con(tronco=50, hombro_c=70, codo_c=4, hombro_l=-40, codo_l=20, muslo_c=36, rodilla_c=40, muslo_l=-22,
               rodilla_l=20, cabeza=6, extra={'boca': 2})
    g3 = B.con(tronco=46, hombro_c=30, codo_c=10, hombro_l=-20, codo_l=20, muslo_c=30, rodilla_c=40, muslo_l=-18)
    A['golpe'] = Anim([g0, g1, g2, g3], 7, False)
    A['ataque'] = A['golpe']
    # Salto (golpe de suelo): se agacha, salta con los brazos arriba; cae y aterriza aplastando.
    s0 = B.con(tronco=50, muslo_c=50, rodilla_c=100, muslo_l=30, rodilla_l=100, hombro_c=-30, codo_c=30,
               hombro_l=-40, codo_l=30, hunde=2, cabeza=10)
    s1 = B.con(tronco=24, muslo_c=40, rodilla_c=70, pie_c=-30, muslo_l=10, rodilla_l=60, pie_l=-40, hombro_c=160,
               codo_c=20, hombro_l=150, codo_l=20, cabeza=-10, extra={'boca': 4, 'pulso': 1})
    A['salto'] = Anim([s0, s1], 6, False)
    A['subida'] = A['salto']
    A['caida'] = Anim([B.con(tronco=30, muslo_c=30, rodilla_c=30, pie_c=-20, muslo_l=-6, rodilla_l=30, pie_l=-30,
                             hombro_c=130, codo_c=30, hombro_l=120, codo_l=30, extra={'boca': 3})], 1, False)
    A['aterrizar'] = Anim([B.con(tronco=56, muslo_c=56, rodilla_c=110, muslo_l=30, rodilla_l=110, hombro_c=50,
                                 codo_c=10, hombro_l=40, codo_l=10, hunde=2, cabeza=12, extra={'boca': 2, 'pulso': 1}),
                           s0], 10, False)
    # Invocar (llama chaneques / raíces / intro): brazos abiertos al cielo, grita; las vetas laten.
    iv = B.con(tronco=8, hombro_c=150, codo_c=30, hombro_l=140, codo_l=30, cabeza=-18, muslo_c=20, rodilla_c=24,
               muslo_l=-16, rodilla_l=20, extra={'boca': 4, 'pulso': 1, 'chispas': 0})
    A['invocar'] = Anim([iv, iv.con(hombro_c=160, hombro_l=150, extra={'boca': 5, 'chispas': 1, 'pulso': 0}),
                         iv.con(hombro_c=156, hunde=1, extra={'boca': 4, 'chispas': 2, 'pulso': 1}),
                         iv.con(hombro_c=146, extra={'boca': 5, 'chispas': 3, 'pulso': 0})], 6, True)
    A['conjuro'] = A['invocar']
    # Lanzar (piedras): recoge, alza atrás y lanza.
    A['lanzar'] = Anim([
        B.con(tronco=60, hombro_c=60, codo_c=20, hombro_l=40, codo_l=20, muslo_c=40, rodilla_c=70, muslo_l=10,
              rodilla_l=60, hunde=1, cabeza=10),
        B.con(tronco=14, hombro_c=200, codo_c=50, hombro_l=-20, codo_l=30, muslo_c=20, rodilla_c=24, muslo_l=-14,
              cabeza=-10, extra={'boca': 3}),
        B.con(tronco=44, hombro_c=90, codo_c=4, hombro_l=-40, codo_l=20, muslo_c=30, rodilla_c=30, muslo_l=-20,
              extra={'boca': 4, 'pulso': 1})], 7, False)
    # Aturdido / agotado (ventana para calmarlo): muy encorvado, la cabeza se bambolea, ojos entrecerrados.
    at = B.con(tronco=54, muslo_c=30, rodilla_c=60, muslo_l=6, rodilla_l=56, hombro_c=4, codo_c=10, hombro_l=-4,
               codo_l=10, cabeza=16, hunde=2)
    A['aturdido'] = Anim([at, at.con(cabeza=24, extra={'cab_dx': 1}), at.con(cabeza=18, cara='parpadeo'),
                          at.con(cabeza=8, extra={'cab_dx': -1})], 4, True)
    A['agotado'] = A['aturdido']
    # Daño: sacudida hacia atrás.
    A['dano'] = Anim([B.con(tronco=10, cabeza=-20, hombro_c=-30, codo_c=40, hombro_l=-50, codo_l=40, cara='dolor',
                            extra={'boca': 3, 'pulso': 1}),
                      B.con(tronco=24, cabeza=-8, hombro_c=-10, codo_c=30, hombro_l=-20, codo_l=30, cara='dolor')],
                     8, False)
    # Purificar: se arrodilla, las vetas se apagan, los ojos se vuelven cálidos, luz dorada.
    pu = B.con(tronco=30, muslo_c=60, rodilla_c=120, pie_c=-50, muslo_l=30, rodilla_l=130, pie_l=-60, hombro_c=30,
               codo_c=30, hombro_l=20, codo_l=30, cabeza=10)
    A['purificar'] = Anim([pu.con(extra={'chispas': 0, 'pulso': 1}),
                           pu.con(cabeza=4, extra={'purificado': 1, 'chispas': 1}),
                           pu.con(cabeza=-6, tronco=24, extra={'purificado': 1, 'chispas': 2}),
                           pu.con(cabeza=-10, tronco=20, cara='parpadeo', extra={'purificado': 1, 'chispas': 3})],
                          4, False)
    A['morir'] = Anim([A['dano'].poses[0], pu, pu.con(tronco=70, cabeza=20, cara='parpadeo', extra={'purificado': 1})],
                      5, False)
    A['esquivar'] = Anim([s0, B.con(tronco=40, muslo_c=-10, rodilla_c=30, muslo_l=-30, rodilla_l=40, hombro_c=-20,
                                    hombro_l=-30, dx=-3)], 8, False)
    A['interactuar'] = Anim([B.con(hombro_c=70, codo_c=10), B.con(hombro_c=80, codo_c=4, tronco=40)], 4, False)
    A['disparar'] = A['lanzar']
    return A


PERSONAJE = ChanequeMayor()
