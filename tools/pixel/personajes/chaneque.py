"""Chaneque (~56 px): el enemigo más común (Nivel 1 en adelante). Duende del folclor veracruzano, de la MISMA familia
que el Chaneque Mayor (personajes/chaneque_mayor.py): misma paleta (piel terracota, sombrero-cuerno de anillos,
taparrabo de trapo), nariz grande y ganchuda, orejas puntiagudas hacia atrás, sonrisa de dientes y vetas moradas de
la corrupción que laten y se apagan al purificarse (los ojos pasan de morado a dorado).

De su hoja Codex toma la complexión: cabezón y rechoncho, piernas cortas, puños, cinturón con argolla dorada y
faldita deshilachada. Es pequeño, así que el cuerpo se arma con primitivas sombreadas (cápsulas y elipses en el
espacio del mundo, como el Mayor) y los detalles de la cara se ponen píxel a píxel."""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Pose, dir_ang, mas  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import CAMINAR, CORRER  # noqa: E402
from personajes.chaneque_mayor import PAL, ChanequeMayor  # noqa: E402
from personajes._criaturas import chispas, disolver  # noqa: E402

ANCLAS = {'o': (0, 0), 'barriga': (1, -5), 'pecho': (1, -10), 'cuello': (1, -14), 'hombro_c': (1, -11),
          'hombro_l': (-2, -11)}
_TORSO_VACIO = Mapa(['.'], {}, PAL, {k: v for k, v in ANCLAS.items()})
HUMO = [PAL.mat(PAL['morado']).color(1), PAL.mat(PAL['trapo']).color(3), PAL.mat(PAL['hueso']).color(0)]


class Chaneque(ChanequeMayor):
    id = 'chaneque'
    tipo = 'criatura'
    fw, fh = 80, 72
    pivote = (40, 69)
    alto = 56
    L_muslo, L_pierna, L_pie, alto_tobillo = 7.5, 7.0, 6, 2
    L_brazo, L_ante = 7.5, 7.0
    sep_cadera = (1.5, -1.5)
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

    # ---- piernas cortas y gruesas, pies grandes descalzos ------------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        pi = P['piel']
        t = (2, 3, 4)
        r = math.radians(p['ang_pie'])
        fwd = (math.cos(r), -math.sin(r))
        capa.capsula(p['talon'], p['punta'], 2.2, 1.9, pi, tonos=t)
        tip = mas(p['punta'], fwd, 1.2)
        capa.pon_m(mas(tip, (0, 1)), P['una'], 1)
        capa.capsula(p['rodilla'], p['tobillo'], 2.5, 2.0, pi, tonos=t)
        capa.capsula(p['cadera'], p['rodilla'], 3.2, 2.7, pi, tonos=t)
        if pose.extra.get('vetas', True) and lado == 'c':
            self.vetas(capa, [p['rodilla'], p['tobillo']], 0.3, pose)

    # ---- brazos: puños o garras --------------------------------------------------------------
    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        pi = P['piel']
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        dibujar_mano(capa, P, b, mano if mano in ('garra', 'abierta') else 'puno', tam=1.25)
        capa.capsula(b['codo'], b['muneca'], 2.1, 1.8, pi, tonos=(2, 3, 4))
        capa.capsula(b['hombro'], b['codo'], 2.6, 2.1, pi, tonos=(2, 3, 4))
        if pose.extra.get('vetas', True) and lado == 'c':
            self.vetas(capa, [b['hombro'], b['codo'], b['muneca']], 0.55, pose)

    # ---- torso: barriga redonda --------------------------------------------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        p = lz.parte()
        tor = c['torso']
        cad = c['cadera_torso']
        pi = P['piel']
        bar, pec, cue = tor.punto('barriga'), tor.punto('pecho'), tor.punto('cuello')
        p.capsula(cad, bar, 6.0, 7.0, pi, tonos=(2, 3, 4))
        p.elipse(mas(bar, (1.8, 0.2)), 6.6, 6.0, pi, tonos=(2, 3, 4))            # panza
        p.capsula(bar, pec, 7.0, 7.2, pi, tonos=(2, 3, 4))
        p.elipse(mas(pec, (1.0, 0.5)), 6.2, 5.0, pi, tonos=(2, 3, 4))            # pecho
        p.capsula(pec, cue, 6.6, 4.2, pi, tonos=(2, 3, 4))
        u = (pec[0] - bar[0], pec[1] - bar[1])
        L = math.hypot(*u) or 1
        u = (u[0] / L, u[1] / L)
        n = (-u[1], u[0])
        if n[0] < 0:
            n = (-n[0], -n[1])
        # pliegue del pecho y ombligo
        p.linea(mas(mas(pec, n, 1.5), u, -1), mas(mas(pec, n, 4.5), u, -2.2), pi, 2)
        p.pon_m(mas(mas(bar, n, 5.2), u, -0.5), pi, 1)
        if pose.extra.get('vetas', True):
            self.vetas(p, [mas(cad, n, -1), mas(bar, n, 1), mas(pec, n, 2), cue], 0.35, pose)
        c['eje_torso'] = (u, n)
        return [(p, 'contorno', 0)]

    # ---- faldita deshilachada con cinturón y argolla dorada ------------------------------------
    def parte_taparrabo(self, lz, c, pose):
        P = self.paleta
        p = lz.parte()
        tr = P['trapo']
        cad = c['cadera_torso']
        u, n = c.get('eje_torso', ((0, -1), (1, 0)))
        for lado in ('l', 'c'):
            pts = c['pierna_' + lado]
            fin = mas(pts['cadera'], dir_ang(pts['ang_muslo']), self.L_muslo * 0.55)
            p.capsula(mas(pts['cadera'], u, 1.0), fin, 4.4, 3.8, tr, tonos=(1, 2, 3) if lado == 'c' else (0, 1, 2))
        p.capsula(mas(mas(cad, u, 2.2), n, -5.2), mas(mas(cad, u, 2.2), n, 5.6), 2.4, 2.4, tr, tonos=(1, 2, 3))
        # bastilla en zigzag: quita píxeles alternos del borde de abajo
        m = p.mascara()
        ys, xs = np.nonzero(m)
        for y, x in zip(ys, xs):
            col = np.nonzero(m[:, x])[0]
            if y == col.max() and (x % 3 == 0 or (x * 5) % 7 == 1):
                p.mat[y, x] = -1
            elif y == col.max() - 1 and x % 3 == 0 and (x * 5) % 7 < 3:
                p.mat[y, x] = -1
        # cinturón y argolla
        a = mas(mas(cad, u, 4.0), n, -6.0)
        b = mas(mas(cad, u, 4.0), n, 6.6)
        p.linea(a, b, P['pelo'], 1)
        p.linea(mas(a, u, -0.8), mas(b, u, -0.8), tr, 3)
        x, y = p.a_px(mas(mas(cad, u, 4.0), n, 5.0))
        for dx, dy, t in ((-1, 0, 1), (1, 0, 2), (0, -1, 2), (0, 1, 0)):
            p.pon(x + dx, y + dy, P['oro'], t, fijo=True)
        p.pon(x, y, P['pelo'], 0, fijo=True)
        return [(p, 'contorno', 0, 1)]

    # ---- cabeza: grande, nariz ganchuda, oreja puntiaguda, sombrero-cuerno --------------------
    def parte_cabeza(self, lz, c, pose):
        P = self.paleta
        pi, pe, hu = P['piel'], P['pelo'], P['hueso']
        cue = c['cuello']
        K = 1.1
        ang = math.radians(pose.cabeza + pose.giro)
        R = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
        cen = mas(cue, (3.5 + pose.extra.get('cab_dx', 0), -6.0 + pose.extra.get('cab_dy', 0)))

        def L(dx, dy):
            v = R @ np.array([dx * K, dy * K])
            return cen[0] + v[0], cen[1] + v[1]

        boca = pose.extra.get('boca', 0)
        purif = pose.extra.get('purificado', 0)
        # 1) oreja lejana, cuello, cráneo, quijada, nariz
        f = lz.parte()
        f.poligono([L(-3, -2), L(-12, -6.5), L(-5, 1)], pi, sombreado=(1, 2, 3))
        p = lz.parte()
        p.capsula(cue, L(-1, 4), 3.2, 3.0, pi, tonos=(2, 3, 4))
        p.elipse(L(0, 0), 7.6 * K, 7.0 * K, pi, tonos=(2, 3, 4))
        p.elipse(L(2.8, 3.8 + boca * 0.4), 5.6 * K, 3.6 * K, pi, tonos=(2, 3, 4))
        # nariz: puente que sale de la frente y bulbo que cuelga (ganchuda, como la del Mayor)
        p.capsula(L(4.5, -1.5), L(9.5, 0.8), 2.0, 2.2, pi, tonos=(2, 3, 4))
        p.capsula(L(9.5, 0.8), L(10.4, 4.2), 2.2, 1.3, pi, tonos=(2, 3, 4))
        # 2) sombrero-cuerno: casquete que tapa la frente + anillos que suben y se doblan hacia atrás
        h = lz.parte()
        curva = pose.extra.get('cuerno', 0)
        h.elipse(L(-1.2, -4.2), 8.4, 4.4, pe, tonos=(1, 2, 3))
        pts = []
        N = 11
        for k in range(N + 1):
            t = k / N
            pts.append(L(-1.5 - 5 * t - 7.5 * t ** 3 - curva * t * t, -6.0 - 12.5 * t + 4.5 * t ** 3))
        rad = [7.0 - 6.2 * (i / N) for i in range(N + 1)]
        for i in range(N):
            tonos = (0, 1, 2) if i % 3 == 2 else (1, 2, 3)
            h.capsula(pts[i], pts[i + 1], rad[i], rad[i + 1], pe, tonos=tonos)
        # ala del sombrero sobre la oreja y mechón de la nuca
        h.capsula(L(-7.5, -2.5), L(-9.5, 2.5), 1.8, 0.8, pe, tonos=(0, 1, 2))
        # 3) oreja cercana (puntiaguda, hacia atrás) y la cara
        o = lz.parte()
        o.poligono([L(-3.5, -1.5), L(-14.5, -6.5), L(-11, -2.5), L(-4.5, 2.5)], pi, sombreado=(2, 3, 4), ks=1)
        o.linea(L(-5.5, 0.2), L(-11.5, -4.2), pi, 2)
        g = lz.parte()
        g.pon_m(L(8.8, 3.0), pi, 1)                                          # fosa nasal
        # ojo grande: blanco con iris morado (corrupto) o dorado (purificado) y ceja enojada
        ox, oy = g.a_px(L(3.0, -1.2))
        cara = pose.cara
        if cara in ('parpadeo', 'dolor', 'cerrado'):
            for d in (-1, 0, 1):
                g.pon(ox + d, oy, pi, 0, fijo=True)
            if cara == 'dolor':
                g.pon(ox + 2, oy - 1, pi, 0, fijo=True)
                g.pon(ox - 2, oy + 1, pi, 0, fijo=True)
        elif cara == 'feliz':
            g.pon(ox - 1, oy, pi, 0, fijo=True)
            g.pon(ox, oy - 1, pi, 0, fijo=True)
            g.pon(ox + 1, oy, pi, 0, fijo=True)
        else:
            col = P['oro'] if purif else P['morado']
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    g.pon(ox + dx, oy + dy, hu, 2 if dy < 1 else 1, fijo=True)
            g.pon(ox + 2, oy, hu, 1, fijo=True)
            px = ox + 1 if cara != 'susto' else ox
            g.pon(px, oy, col, 1 if purif else 2, fijo=True)
            g.pon(px, oy + 1, col, 0 if purif else 1, fijo=True)
            if not purif and pose.extra.get('pulso'):
                g.pon(px, oy - 1, col, 3, fijo=True)
        if cara not in ('feliz',) and not purif:
            g.linea(L(0.2, -5.0), L(5.6, -3.2), pi, 0, fijo=True)            # ceja fruncida
        else:
            g.linea(L(0.4, -4.6), L(5.4, -4.8), pi, 1, fijo=True)
        # boca: sonrisa de dientes (o boca abierta / gesto de dolor / sonrisa tranquila)
        if purif and boca == 0:
            g.linea(L(1.5, 5.0), L(5.5, 5.6), pi, 1, fijo=True)
            g.pon_m(L(6.2, 5.0), pi, 1, fijo=True)
        elif boca:
            for i in range(6):
                g.linea(L(1.0 + i, 4.6), L(1.0 + i, 4.6 + boca * 0.8), pi, 0, fijo=True)
            for i in range(0, 6, 2):
                g.pon_m(L(1.5 + i, 4.7), hu, 2, fijo=True)
        else:
            g.linea(L(0.8, 5.2), L(7.2, 4.4), pi, 0, fijo=True)
            for i in (1, 3, 5):
                g.pon_m(L(0.8 + i, 4.6 - i * 0.12), hu, 2 if i != 5 else 1, fijo=True)
        if pose.extra.get('vetas', True):
            self.vetas(g, [L(-4.5, 4.5), L(-2.5, 1.0)], 0.5, pose)
        c['cabeza_centro'] = cen
        return [(f, 'contorno', 1), (p, 'contorno', 0, 1), (h, 'contorno', 0, 1), (o, 'contorno', 0), (g, None, 0)]

    def retoques(self, lz, c, pose):
        P = self.paleta
        cen = c.get('cabeza_centro', (0, -40))
        ch = pose.extra.get('chispas')
        if ch is not None:
            mat = P['oro'] if pose.extra.get('purificado') else P['morado']
            chispas(lz, (cen[0] - 2, cen[1] + 8), mat, int(ch), radio=17, n=8, tono_alto=3, tono_bajo=1)
        est = pose.extra.get('estrellas')
        if est is not None:
            for j in range(3):
                a = est * 0.9 + j * 2.09
                x, y = lz.a_px((cen[0] - 2 + math.cos(a) * 8, cen[1] - 14 + math.sin(a) * 2.5))
                lz.pon(x, y, P['oro'], 3, fx=True)
                if (j + est) % 2 == 0:
                    for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        lz.pon(x + ex, y + ey, P['oro'], 1, fx=True)
        sud = pose.extra.get('sudor')
        if sud is not None:
            x, y = lz.a_px((cen[0] + 7, cen[1] - 6 + sud))
            lz.pon(x, y, P['hueso'], 2, fx=True)
            lz.pon(x, y + 1, P['hueso'], 1, fx=True)

    def cuadro(self, pose, depurar=False):
        img = super().cuadro(pose, depurar)
        t = pose.extra.get('disolver', 0)
        if t:
            img = disolver(img, t, HUMO, semilla=int(t * 10))
        return img


# =============================================================================================
#  Animaciones (el enemigo más común: muy vivas)
# =============================================================================================

B = Pose(tronco=10, cabeza=-2, hombro_c=14, codo_c=50, hombro_l=-10, codo_l=46, muslo_c=16, rodilla_c=22, pie_c=0,
         muslo_l=-10, rodilla_l=16, pie_l=0, mano_c='puno', mano_l='puno')


def animaciones():
    A = {}
    # Reposo: respira con la panza, se mece de un pie al otro, sonríe y parpadea; las vetas laten.
    rep = []
    for i in range(6):
        s = math.sin(i / 6 * 2 * math.pi)
        rep.append(B.con(hunde=0.6 + 0.6 * s, tronco=10 + 2 * s, cabeza=-2 - 3 * s, hombro_c=14 + 4 * s,
                         hombro_l=-10 - 3 * s, codo_c=50 + 6 * s, muslo_c=16 + 2 * s, muslo_l=-10 + 2 * s,
                         cara='parpadeo' if i == 4 else 'normal',
                         extra={'pulso': i in (0, 1), 'cuerno': 1.5 * s}))
    A['reposo'] = Anim(rep, 7, True)
    # Caminar: andar de duende, saltarín, brazos que se balancean muy marcados.
    cam = []
    for i in range(8):
        a = CAMINAR[i]
        b = CAMINAR[(i + 4) % 8]
        s = math.sin(i / 8 * 2 * math.pi)
        rebote = abs(math.cos(i / 8 * 2 * math.pi))
        cam.append(B.con(tronco=12 + 2 * rebote, muslo_c=a[0] * 1.25, rodilla_c=a[1] * 1.3 + 8, pie_c=a[2],
                         muslo_l=b[0] * 1.25, rodilla_l=b[1] * 1.3 + 8, pie_l=b[2],
                         hombro_c=14 - 34 * s, codo_c=50 + max(0, 30 * s), hombro_l=-8 + 34 * s,
                         codo_l=46 + max(0, -30 * s), cabeza=-2 + 4 * s, hunde=0.8 * (1 - rebote),
                         extra={'pulso': i % 4 == 0, 'cuerno': -2 * s, 'alzar': 1 if rebote < 0.5 else 0}))
    A['caminar'] = Anim(cam, 11, True)
    # Correr: inclinado, brazos de remo, zancadas con vuelo.
    cor = []
    for i in range(8):
        a = CORRER[i]
        b = CORRER[(i + 4) % 8]
        s = math.sin(i / 8 * 2 * math.pi)
        cor.append(B.con(tronco=28, muslo_c=a[0], rodilla_c=a[1], pie_c=a[2], muslo_l=b[0], rodilla_l=b[1],
                         pie_l=b[2], hombro_c=30 - 60 * s, codo_c=80, hombro_l=10 + 60 * s, codo_l=80,
                         cabeza=-10 + 3 * s, extra={'boca': 2, 'pulso': i % 2, 'cuerno': 5,
                                                    'alzar': 2 if i in (2, 3, 6, 7) else 0}))
    A['correr'] = Anim(cor, 14, True)
    # Ataque (preparación 0,55 s + golpe): se agacha, echa el puño atrás temblando, salta y suelta el puñetazo.
    p0 = B.con(tronco=18, hombro_c=-70, codo_c=70, hombro_l=30, codo_l=70, muslo_c=30, rodilla_c=50, muslo_l=-14,
               rodilla_l=40, hunde=1, cabeza=4, cara='normal', extra={'boca': 1, 'pulso': 1})
    p1 = p0.con(tronco=4, hombro_c=-115, codo_c=70, hombro_l=40, codo_l=60, cabeza=-6, extra={'boca': 2, 'pulso': 0,
                                                                                            'cuerno': -3})
    p2 = p1.con(hombro_c=-122, cabeza=-8, extra={'boca': 2, 'pulso': 1, 'cab_dx': -0.5})
    p3 = p1.con(hombro_c=-110, cabeza=-5, extra={'boca': 2, 'pulso': 0, 'cab_dx': 0.5})
    p4 = B.con(tronco=26, hombro_c=40, codo_c=40, hombro_l=-40, codo_l=60, muslo_c=44, rodilla_c=30, pie_c=10,
               muslo_l=-30, rodilla_l=40, pie_l=-30, cabeza=-6, extra={'boca': 3, 'pulso': 1, 'cuerno': 4})
    p5 = p4.con(tronco=30, hombro_c=96, codo_c=0, hombro_l=-60, codo_l=50, cabeza=-4,
                extra={'boca': 3, 'pulso': 1, 'cuerno': 6, 'chispas': 0})
    p6 = p5.con(tronco=28, hombro_c=90, codo_c=6, extra={'boca': 2, 'cuerno': 4})
    A['ataque'] = Anim([p0, p1, p2, p3, p4, p5, p6], 11, False)
    # Golpe: martillazo con los dos puños desde arriba.
    g0 = B.con(tronco=-14, hombro_c=196, codo_c=40, hombro_l=186, codo_l=40, brazo_l_delante=False, cabeza=-10,
               muslo_c=20, rodilla_c=20, muslo_l=-14, extra={'boca': 2, 'pulso': 1})
    g1 = g0.con(tronco=-18, hombro_c=212, hombro_l=204, codo_c=50, codo_l=50, extra={'boca': 3, 'cuerno': -4})
    g2 = B.con(tronco=34, hombro_c=80, codo_c=10, hombro_l=70, codo_l=10, muslo_c=36, rodilla_c=56, muslo_l=-10,
               rodilla_l=50, hunde=1.5, cabeza=8, extra={'boca': 3, 'pulso': 1, 'cuerno': 6})
    A['golpe'] = Anim([g0, g1, g2, g2.con(tronco=30, extra={'boca': 1})], 9, False)
    # Lanzar (piedrita): recoge, echa el brazo atrás y lanza.
    l0 = B.con(tronco=36, hombro_c=60, codo_c=20, hombro_l=20, codo_l=40, muslo_c=36, rodilla_c=70, muslo_l=0,
               rodilla_l=60, hunde=1, cabeza=10)
    l1 = B.con(tronco=-4, hombro_c=200, codo_c=60, hombro_l=40, codo_l=40, muslo_c=10, rodilla_c=24, muslo_l=-20,
               cabeza=-8, extra={'boca': 1})
    l2 = B.con(tronco=26, hombro_c=100, codo_c=0, hombro_l=-40, codo_l=40, muslo_c=36, rodilla_c=26, muslo_l=-26,
               rodilla_l=30, extra={'boca': 2, 'pulso': 1})
    A['lanzar'] = Anim([l0, l1, l2, l2.con(hombro_c=70, codo_c=20, tronco=22)], 9, False)
    A['disparar'] = A['lanzar']
    # Invocar: brazos al cielo, dedos en garra que se agitan, chispas moradas.
    iv = B.con(tronco=-8, hombro_c=128, codo_c=24, hombro_l=205, codo_l=30, mano_c='garra', mano_l='garra',
               cabeza=-12, muslo_c=20, rodilla_c=20, muslo_l=-14, rodilla_l=14, extra={'boca': 2, 'pulso': 1})
    A['invocar'] = Anim([iv.con(extra={'chispas': 0}),
                         iv.con(hombro_c=138, hombro_l=196, codo_c=14, extra={'boca': 3, 'pulso': 0, 'chispas': 1}),
                         iv.con(hunde=1, extra={'chispas': 2}),
                         iv.con(hombro_c=122, hombro_l=212, codo_l=20, extra={'boca': 3, 'pulso': 0, 'chispas': 3})],
                        8, True)
    # Conjuro: manos en garra hacia adelante (hechizo de travesura).
    cj = B.con(tronco=16, hombro_c=84, codo_c=10, hombro_l=70, codo_l=20, mano_c='garra', mano_l='garra',
               brazo_l_delante=True, cabeza=-4, muslo_c=26, rodilla_c=30, muslo_l=-16, rodilla_l=24,
               extra={'boca': 2, 'pulso': 1})
    A['conjuro'] = Anim([cj.con(extra={'chispas': 0}), cj.con(hombro_c=90, extra={'boca': 3, 'pulso': 0, 'chispas': 1}),
                         cj.con(hombro_c=80, hunde=0.5, extra={'chispas': 2}),
                         cj.con(hombro_c=88, extra={'boca': 3, 'pulso': 0, 'chispas': 3})], 8, True)
    # Salto: se agacha, brinca estirado con los brazos arriba, se encoge arriba; cae y aterriza en cuclillas.
    s0 = B.con(tronco=30, muslo_c=60, rodilla_c=110, muslo_l=40, rodilla_l=100, pie_l=-10, hombro_c=-40, codo_c=40,
               hombro_l=-50, codo_l=40, hunde=1.5, cabeza=8, extra={'boca': 1})
    s1 = B.con(tronco=4, muslo_c=10, rodilla_c=10, pie_c=-40, muslo_l=-10, rodilla_l=20, pie_l=-50, hombro_c=150,
               codo_c=20, hombro_l=140, codo_l=30, cabeza=-10, extra={'boca': 3, 'pulso': 1, 'cuerno': -5})
    s2 = B.con(tronco=16, muslo_c=70, rodilla_c=110, pie_c=-20, muslo_l=50, rodilla_l=110, pie_l=-30, hombro_c=60,
               codo_c=80, hombro_l=40, codo_l=80, cabeza=4, extra={'boca': 2, 'cuerno': 3})
    A['salto'] = Anim([s0, s1, s2], 10, False)
    A['subida'] = Anim([s1, s2], 8, False)
    A['caida'] = Anim([B.con(tronco=6, muslo_c=30, rodilla_c=30, pie_c=-10, muslo_l=-10, rodilla_l=40, pie_l=-30,
                             hombro_c=130, codo_c=40, hombro_l=110, codo_l=40, cabeza=-6, cara='susto',
                             extra={'boca': 2, 'cuerno': -6}),
                       B.con(tronco=8, muslo_c=26, rodilla_c=34, pie_c=-10, muslo_l=-6, rodilla_l=40, pie_l=-30,
                             hombro_c=150, codo_c=30, hombro_l=125, codo_l=30, cabeza=-8, cara='susto',
                             extra={'boca': 3, 'cuerno': -8})], 10, True)
    A['aterrizar'] = Anim([B.con(tronco=34, muslo_c=60, rodilla_c=118, muslo_l=36, rodilla_l=110, hombro_c=40,
                                 codo_c=30, hombro_l=30, codo_l=30, hunde=2, cabeza=10, extra={'boca': 1}),
                           s0.con(tronco=20, hunde=1)], 12, False)
    # Esquivar: voltereta corta hacia atrás.
    A['esquivar'] = Anim([s0, B.con(giro=-40, tronco=40, muslo_c=80, rodilla_c=120, muslo_l=70, rodilla_l=120,
                                    hombro_c=40, codo_c=90, hombro_l=30, codo_l=90, cabeza=10, extra={'alzar': 4}),
                          B.con(giro=-110, tronco=50, muslo_c=90, rodilla_c=130, muslo_l=80, rodilla_l=130,
                                hombro_c=40, codo_c=100, hombro_l=30, codo_l=100, cabeza=10, extra={'alzar': 3}),
                          s0], 12, False)
    # Interactuar: se agacha y hurga en el suelo.
    it = B.con(tronco=44, hombro_c=60, codo_c=10, hombro_l=40, codo_l=20, mano_c='garra', muslo_c=40, rodilla_c=70,
               muslo_l=10, rodilla_l=60, cabeza=14)
    A['interactuar'] = Anim([it, it.con(hombro_c=70, codo_c=0), it.con(hombro_c=56, codo_c=20, extra={'boca': 1})],
                            6, False)
    # Daño: sacudida hacia atrás con cara de dolor.
    A['dano'] = Anim([B.con(tronco=-14, cabeza=-22, hombro_c=-40, codo_c=60, hombro_l=-60, codo_l=60, muslo_c=24,
                            rodilla_c=10, muslo_l=-20, cara='dolor', extra={'boca': 2, 'pulso': 1, 'cuerno': -8}),
                      B.con(tronco=-6, cabeza=-12, hombro_c=-20, codo_c=60, hombro_l=-36, codo_l=60, cara='dolor',
                            extra={'boca': 1, 'cuerno': -4}),
                      B.con(tronco=4, cabeza=-4, cara='normal')], 12, False)
    # Aturdido: se tambalea, la cabeza da vueltas, estrellitas.
    at = B.con(tronco=16, muslo_c=24, rodilla_c=36, muslo_l=-4, rodilla_l=30, hombro_c=-6, codo_c=20, hombro_l=-14,
               codo_l=20, hunde=1)
    A['aturdido'] = Anim([at.con(cabeza=12 * math.sin(k * math.pi / 2), giro=4 * math.sin(k * math.pi / 2),
                                 cara='cerrado' if k % 2 else 'dolor', extra={'estrellas': k, 'cab_dx': math.sin(k)})
                          for k in range(4)], 6, True)
    # Agotado (se puede purificar): sentado en cuclillas, manos en las rodillas, jadea; las vetas laten despacio.
    ag = B.con(tronco=34, muslo_c=76, rodilla_c=130, pie_c=0, muslo_l=60, rodilla_l=130, pie_l=0, hombro_c=40,
               codo_c=10, hombro_l=30, codo_l=10, mano_c='abierta', mano_l='abierta', hunde=1.5, cabeza=18,
               cara='parpadeo', extra={'boca': 1, 'cuerno': 3})
    A['agotado'] = Anim([ag, ag.con(hunde=2.5, cabeza=22, extra={'boca': 2, 'pulso': 1, 'sudor': 0}),
                         ag.con(hunde=2, cabeza=20, cara='normal', extra={'boca': 1, 'sudor': 2}),
                         ag.con(hunde=2.5, cabeza=22, extra={'boca': 2, 'pulso': 1, 'sudor': 4})], 4, True)
    A['agotado'].poses[0] = ag.con(extra={'boca': 1})
    # Purificar (1,1 s): se endereza, las vetas se apagan, ojos dorados, sonríe y lo envuelve luz dorada.
    pu = B.con(tronco=6, cabeza=-8, hombro_c=10, codo_c=30, hombro_l=-6, codo_l=30, mano_c='abierta',
               mano_l='abierta')
    A['purificar'] = Anim([ag.con(extra={'pulso': 1, 'chispas': 0}),
                           ag.con(tronco=24, cabeza=8, cara='parpadeo', extra={'pulso': 0, 'chispas': 1}),
                           pu.con(cara='parpadeo', extra={'purificado': 1, 'chispas': 2}),
                           pu.con(cara='feliz', extra={'purificado': 1, 'chispas': 3}),
                           pu.con(cara='feliz', hombro_c=30, hombro_l=20, extra={'purificado': 1, 'chispas': 4}),
                           pu.con(cara='normal', cabeza=-4, extra={'purificado': 1, 'chispas': 5})], 6, False)
    # Morir: cae de espaldas, queda inconsciente y se deshace en humo.
    tumb = B.con(giro=-84, tronco=0, hombro_c=150, codo_c=20, hombro_l=130, codo_l=20, muslo_c=20, rodilla_c=10,
                 muslo_l=30, rodilla_l=20, cabeza=-6, cara='cerrado', extra={'boca': 0, 'pulso': 0})
    A['morir'] = Anim([A['dano'].poses[0], B.con(giro=-40, tronco=-10, hombro_c=120, codo_c=40, hombro_l=100,
                                                  muslo_c=30, rodilla_c=20, cara='dolor', extra={'boca': 2}),
                       tumb, tumb.con(extra={'disolver': 0.35}), tumb.con(extra={'disolver': 0.65}),
                       tumb.con(extra={'disolver': 0.9})], 8, False)
    return A


PERSONAJE = Chaneque()
