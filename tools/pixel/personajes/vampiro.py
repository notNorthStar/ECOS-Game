"""Vampiro de la hacienda (jefe, ~100 px, el MISMO tamaño en pantalla que su kit anterior): caballero pálido y
elegante, cabello gris oscuro peinado hacia atrás con pico de viuda, oreja puntiaguda, ojos rojos, levita negra
larga, chaleco vino, corbatín y puños blancos, y una capa con cuello alto forrado de rojo.

Grande como el Chaneque Mayor, así que la cabeza, la capa y la levita se dibujan con primitivas sombreadas en el
espacio del mundo (giran sin deformarse) y los rasgos se ponen píxel a píxel.
`esquivar` = se vuelve niebla (tramado); `agotado` = de rodillas en forma humana; `morir` (liberado) = se
arrodilla en paz y se deshace en niebla. Sin colmillos ensangrentados ni gore."""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Material, Paleta, Pose, dir_ang, mas  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import animaciones_humanas, CAMINAR  # noqa: E402
from personajes._espectros import RigEspectro, eje, motas, torso_vacio  # noqa: E402

PAL = Paleta([
    Material('piel',    ['#686270', '#a39aa4', '#d2cac6', '#efe8e0'],  '#28202e'),
    Material('pelo',    ['#18161c', '#2c2a32', '#43414a', '#62606a'],  '#0c0a10'),
    Material('abrigo',  ['#131118', '#211d27', '#322e39', '#48444f'],  '#09070b'),
    Material('forro',   ['#380a12', '#5c1420', '#84222c', '#a6383a'],  '#1c0408'),
    Material('camisa',  ['#898590', '#cdc9ca', '#f1eee8'],             '#29252f'),
    Material('ojo',     ['#9c1020', '#ff3a3a', '#ffb4a4'],             '#380a12'),
    Material('oro',     ['#7a5a1a', '#d0a030'],                        '#380a12'),
    Material('niebla',  ['#5c5064', '#a898b2', '#e6def0'],             '#3a3040'),
])

ANCLAS_TORSO = {'o': (0, 0), 'cintura': (0, -8), 'pecho': (1, -17), 'cuello': (2, -28),
                'hombro_c': (1, -23), 'hombro_l': (-3, -23)}
_TORSO = torso_vacio(PAL, ANCLAS_TORSO)


def rot(v, ang):
    r = math.radians(ang)
    return (v[0] * math.cos(r) - v[1] * math.sin(r), v[0] * math.sin(r) + v[1] * math.cos(r))


def lerp(a, b, t):
    return a + (b - a) * t


class Vampiro(RigEspectro):
    id = 'vampiro'
    tipo = 'humanoide'
    fw, fh = 128, 120
    pivote = (60, 116)
    alto = 100
    L_muslo, L_pierna, L_pie, alto_tobillo = 20, 20, 11, 3
    L_brazo, L_ante = 17, 16
    sep_cadera = (2.0, -2.0)
    torso_cizalla_max = 0.0
    paleta = PAL

    def torso_mapa(self, pose):
        return _TORSO

    def orden(self, pose):
        o = ['capa', 'brazo_l', 'pierna_l', 'pierna_c', 'levita', 'torso', 'cuello_capa', 'cabeza', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    # ---- piernas: pantalón negro, botines lustrados -----------------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        A = P['abrigo']
        capa.capsula(p['talon'], p['punta'], 3.0, 2.3, A, tonos=(0, 1, 3))
        r = math.radians(p['ang_pie'])
        capa.pon_m(mas(p['punta'], (-math.cos(r) * 2.5, math.sin(r) * 2.5 - 1.2)), P['camisa'], 0)   # lustre
        capa.capsula(p['rodilla'], mas(p['tobillo'], dir_ang(p['ang_pierna']), 1), 3.6, 3.2, A, tonos=(1, 2, 3),
                     redondo_b=False)
        capa.capsula(p['cadera'], p['rodilla'], 4.6, 3.6, A, tonos=(1, 2, 3), pliegues=[(0.9, 0)])

    # ---- brazos: manga de levita, puño blanco, mano pálida de dedos largos ----------------------
    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        dibujar_mano(capa, P, b, mano if mano in ('abierta', 'garra', 'puno') else 'abierta', tam=1.25)
        capa.capsula(b['codo'], b['muneca'], 3.0, 2.6, P['abrigo'], tonos=(1, 2, 3),
                     bandas=[(0.84, 1.1, P['camisa'], (0, 1, 2))], redondo_b=False)
        capa.capsula(b['hombro'], b['codo'], 3.6, 3.0, P['abrigo'], tonos=(1, 2, 3), pliegues=[(0.6, 0)])
        capa.elipse(b['hombro'], 3.8, 3.6, P['abrigo'], tonos=(1, 2, 3))

    # ---- torso: levita abierta, chaleco vino, corbatín blanco --------------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        A, F, Cm = P['abrigo'], P['forro'], P['camisa']
        p = lz.parte()
        tor = c['torso']
        cad = c['cadera_torso']
        cin, pec, cue = tor.punto('cintura'), tor.punto('pecho'), tor.punto('cuello')
        u, n = eje(cad, cue)
        c['eje_torso'] = (u, n)
        p.capsula(cad, cin, 6.8, 6.2, A, tonos=(1, 2, 3))
        p.capsula(cin, pec, 6.2, 8.2, A, tonos=(1, 2, 3))
        p.capsula(pec, mas(cue, u, -1), 8.2, 5.6, A, tonos=(1, 2, 3))
        # chaleco: franja del frente, de la cintura al pecho
        p.poligono([mas(mas(cad, u, 3), n, 7.0), mas(mas(cad, u, 3), n, 0.5), mas(mas(pec, u, 2), n, 0.5),
                    mas(mas(cue, u, -3), n, 4.0), mas(mas(pec, u, 0), n, 8.2)], F, sombreado=(1, 2, 3), ks=1)
        for k in range(3):
            p.pon_m(mas(mas(cin, u, 1 + k * 3.5), n, 6.2), P['oro'], 1)
        # cadena del reloj
        p.linea(mas(mas(cin, u, 3), n, 5), mas(mas(cin, u, 1.5), n, 1.5), P['oro'], 0)
        # camisa y corbatín
        p.poligono([mas(mas(cue, u, -1), n, 1.0), mas(mas(cue, u, -1), n, 5.2), mas(mas(cue, u, -6.5), n, 4.6)],
                   Cm, sombreado=(0, 1, 2), ks=1)
        p.capsula(mas(mas(cue, u, -2.5), n, 4.6), mas(mas(cue, u, -5.5), n, 4.0), 1.4, 1.0, Cm, tonos=(1, 2, 2))
        # solapa de la levita (línea sobre el pecho)
        p.linea(mas(mas(cue, u, -2), n, 1.0), mas(mas(cin, u, 2), n, 1.2), A, 3)
        p.linea(mas(mas(cue, u, -2), n, 0.0), mas(mas(cin, u, 2), n, 0.2), A, 0)
        return [(p, 'contorno', 0)]

    # ---- faldones de la levita (hasta la rodilla) -------------------------------------------
    def parte_levita(self, lz, c, pose):
        P = self.paleta
        A = P['abrigo']
        p = lz.parte()
        cad = c['cadera_torso']
        u, n = eje(cad, c['torso'].punto('cuello'))
        R = c['R']
        vuelo = pose.extra.get('vuelo', 0)
        caida = (R @ np.array([0, 1])).tolist()
        rod = [c['pierna_' + l]['rodilla'] for l in ('c', 'l')]
        fr = max(rod, key=lambda q: q[0])
        at = min(rod, key=lambda q: q[0])
        top_f, top_b = mas(mas(cad, u, 4), n, 6), mas(mas(cad, u, 4), n, -6)
        hem_f = mas(mas(fr, n, 3), caida, 3)
        hem_b = mas(mas(at, n, -6 - vuelo), caida, 3 - vuelo * 0.4)
        mid_b = mas(mas(cad, n, -7 - vuelo * 0.4), caida, 4)
        p.poligono([top_b, top_f, mas(mas(cad, n, 6.5), caida, 2), hem_f, hem_b, mid_b], A, sombreado=(0, 1, 2), ks=2)
        # abertura y pliegues
        p.linea(mas(cad, caida, 3), mas(lerp_p(hem_f, hem_b, 0.35), u, 1), A, 0)
        p.linea(mas(mas(cad, n, -3), caida, 4), lerp_p(hem_f, hem_b, 0.75), A, 0)
        p.linea(mas(mas(cad, n, 5.5), caida, 2), mas(hem_f, u, 1), A, 3)
        return [(p, 'contorno', 0, 1)]

    # ---- capa: cae de los hombros a la pantorrilla; se abre como alas ('abre') ----------------
    def parte_capa(self, lz, c, pose):
        P = self.paleta
        A, F = P['abrigo'], P['forro']
        p = lz.parte()
        tor = c['torso']
        cue = tor.punto('cuello')
        hl, hc = tor.punto('hombro_l'), tor.punto('hombro_c')
        R = c['R']
        cad = c['cadera_torso']
        vuelo = pose.extra.get('vuelo', 0)
        abre = pose.extra.get('abre', 0)
        fase = pose.extra.get('fase', 0)

        def W(dx, dy):
            q = R @ np.array([dx, dy])
            return cad[0] + q[0], cad[1] + q[1]

        largo = 34 - abre * 6
        borde = []
        N = 8
        for i in range(N + 1):
            t = i / N
            x = lerp(2 - abre * 2, -17 - vuelo * 2.2 - abre * 14, t)
            y = largo - t * (vuelo * 2.0 + abre * 22) + math.sin(fase * 1.4 + i * 1.3) * (0.8 + vuelo * 0.2) \
                + (1.2 if i % 2 else 0) * (abre > 0)
            borde.append(W(x, y))
        alto = mas(hl, (-3 - abre * 3, -3 - abre * 4))
        pts = [mas(cue, (-1, -1)), mas(hc, (1, 0))] + borde + [mas(alto, (-vuelo * 1.0, 3)), alto]
        p.poligono(pts, A, sombreado=(0, 1, 2), ks=2)
        # forro rojo visible en el borde trasero (más cuando se abre o vuela)
        g = int(1 + min(4, vuelo * 0.6 + abre * 3))
        m = p.mascara()
        if g:
            ys, xs = np.nonzero(m)
            for y, x in zip(ys, xs):
                # píxeles a ≤ g del borde izquierdo de su fila
                fila = np.nonzero(m[y])[0]
                if x - fila.min() < g and y > np.nonzero(m.any(axis=1))[0].min() + 4:
                    p.mat[y, x] = F
                    p.ton[y, x] = 2 if x - fila.min() == 0 else 1
        # pliegues largos
        for k in range(3):
            a = mas(lerp_p(hl, cue, 0.3 + k * 0.2), (-1 - k * 2, 2))
            b = borde[2 + k * 2]
            p.linea(a, mas(b, (0, -2)), A, 0 if k % 2 == 0 else 2)
        return [(p, 'contorno', 0, 0)]

    def parte_cuello_capa(self, lz, c, pose):
        """Cuello alto de la capa, levantado detrás de la cabeza, forro rojo hacia adelante."""
        P = self.paleta
        p = lz.parte()
        cue = c['cuello']
        u, n = c.get('eje_torso', ((0, -1), (1, 0)))
        abre = pose.extra.get('abre', 0)
        base_b = mas(cue, n, -5)
        base_f = mas(cue, n, 0.5)
        punta = mas(mas(cue, u, 15 + abre * 2), n, -11 - abre * 2)
        p.poligono([mas(base_f, n, 1.5), base_b, punta, mas(mas(cue, u, 10), n, -5)], P['forro'], sombreado=(1, 2, 3), ks=1)
        p.poligono([base_b, mas(base_b, n, -2), mas(punta, n, -1.5), punta], P['abrigo'], ton=1)
        return [(p, 'contorno', 0)]

    # ---- cabeza por código ----------------------------------------------------------------
    def parte_cabeza(self, lz, c, pose):
        P = self.paleta
        pi, pe = P['piel'], P['pelo']
        cue = c['cuello']
        ang = pose.cabeza + pose.giro
        cen = mas(cue, rot((2.0, -12.0), ang))

        def L(dx, dy):
            q = rot((dx, dy), ang)
            return cen[0] + q[0], cen[1] + q[1]

        a = lz.parte()
        a.capsula(cue, L(1, 8), 3.0, 2.8, pi, tonos=(0, 1, 2))
        a.elipse(L(0, -1), 8.6, 9.6, pi, tonos=(1, 2, 3))
        a.poligono([L(0, -3), L(8.6, -4), L(9.6, 1), L(9.0, 5), L(7.8, 9), L(4.6, 11.6), L(1.2, 11), L(-2, 6)],
                   pi, sombreado=(1, 2, 3), ks=2)
        a.poligono([L(8.4, -1.5), L(11.6, 4.6), L(10.4, 5.4), L(8.8, 5.2)], pi, sombreado=(1, 2, 3), ks=1)   # nariz
        # pelo engominado hacia atrás con pico de viuda
        h = lz.parte()
        pelo = [L(9.4, -7.0), L(7.4, -4.4), L(6.2, -2.6), L(4.6, -5.0), L(1.6, -4.6), L(-1.2, -3.0), L(-3.4, -1.6),
                L(-4.4, 2.0), L(-4.0, 6.0), L(-3.0, 9.4), L(-6.0, 10.4), L(-9.4, 7.6), L(-10.6, 1.0), L(-9.6, -6.0),
                L(-5.6, -10.6), L(0.4, -12.4), L(5.4, -11.6), L(8.8, -9.4)]
        h.poligono(pelo, pe, sombreado=(1, 2, 3), ks=2)
        for k, (y0, t) in enumerate(((-9.6, 3), (-7.4, 2), (-4.6, 3), (-1.0, 2))):
            h.linea(L(6 - k * 1.5, y0), L(-8 + k * 0.4, y0 + 3 + k * 1.6), pe, t)
        h.linea(L(-5, -8), L(-9, 2), pe, 0)
        # oreja puntiaguda (delante del pelo)
        o = lz.parte()
        o.poligono([L(-1.6, 1.0), L(-5.4, -5.6), L(-3.6, 1.6), L(-2.6, 5.2), L(-0.6, 4.6)], pi, sombreado=(1, 2, 3), ks=1)
        o.linea(L(-2.4, 0.4), L(-3.4, -2.8), pi, 0)
        # rasgos
        g = lz.parte()
        cara = pose.cara
        ex, ey = g.a_px(L(6.4, 0.6))
        if cara in ('parpadeo', 'calma'):
            for dx in (-1, 0, 1):
                g.pon(ex + dx, ey, pi, 0, fijo=True)
        else:
            g.pon(ex - 1, ey, P['ojo'], 0, fijo=True)
            g.pon(ex, ey, P['ojo'], 1 if pose.extra.get('libre') else 2, fijo=True)
            g.pon(ex + 1, ey, P['ojo'], 1, fijo=True)
            g.pon(ex, ey - 1, P['ojo'], 0, fijo=True)
            g.pon(ex, ey + 1, pi, 0, fijo=True)
            g.pon(ex - 1, ey + 1, pi, 1, fijo=True)
            g.pon(ex + 1, ey + 1, pi, 1, fijo=True)
        # ceja (fruncida salvo en calma)
        if cara == 'calma' or pose.extra.get('libre'):
            g.linea(L(4.0, -2.2), L(8.0, -2.2), pe, 1, fijo=True)
        else:
            g.linea(L(3.6, -3.2), L(8.6, -1.4), pe, 0, fijo=True)
            g.pon_m(L(8.8, -1.0), pe, 0, fijo=True)
        # ojera / pómulo
        g.linea(L(4.6, 4.2), L(7.4, 6.2), pi, 1)
        # boca
        if cara in ('grito', 'dolor'):
            g.poligono([L(6.0, 7.0), L(9.4, 6.4), L(9.0, 8.8), L(6.6, 9.0)], P['forro'], ton=0)
            g.pon_m(L(8.6, 6.8), P['camisa'], 2, fijo=True)
            g.pon_m(L(7.0, 7.2), P['camisa'], 2, fijo=True)
        else:
            g.linea(L(6.2, 7.6), L(9.2, 7.0), P['pelo'], 1, fijo=True)
            if cara != 'calma':
                g.pon_m(L(8.4, 8.2), P['camisa'], 2, fijo=True)   # colmillo
        c['cabeza_centro'] = cen
        return [(a, 'contorno', 0, 1), (h, 'contorno', 0, 1), (o, 'contorno', 0), (g, None, 0)]

    def post(self, lz, c, pose):
        ch = pose.extra.get('chispas')
        if ch is not None:
            cen = c.get('cabeza_centro', (0, -80))
            motas(lz, (cen[0], cen[1] + 10), self.paleta['niebla'] if not pose.extra.get('libre') else self.paleta['oro'],
                  ch, pts=((-24, -6), (20, -14), (26, 10), (-28, 18), (8, -24), (-14, -22), (30, -4), (-30, 4)),
                  tono=(0, 2) if not pose.extra.get('libre') else (0, 1))


def lerp_p(a, b, t):
    return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t


PERSONAJE = Vampiro()
FONDO = ('nivel-10-guadalajara', 'catedral', 310)

BASE = Pose(tronco=2, cabeza=2, hombro_c=6, codo_c=16, hombro_l=-6, codo_l=14,
            muslo_c=5, rodilla_c=3, pie_c=0, muslo_l=-4, rodilla_l=2, pie_l=0, mano_c='abierta', mano_l='abierta')


def animaciones():
    B = BASE
    A = animaciones_humanas(B, paso=0.85, lean_correr=14)
    sin = lambda i, n, f=0.0: math.sin(i / n * 2 * math.pi + f)  # noqa: E731
    # Reposo: erguido, respira despacio, la capa se mece.
    A['reposo'] = Anim([B.con(hunde=[0, 0.6, 1, 0.6][i], cara='parpadeo' if i == 3 else 'normal',
                              extra={'fase': i, 'vuelo': 0.5 + 0.5 * sin(i, 4)}) for i in range(4)], 3, True)
    # Caminar: paso largo y elegante, la capa ondea.
    cam = []
    for i in range(8):
        a = CAMINAR[i]
        b = CAMINAR[(i + 4) % 8]
        s = -math.sin(i / 8 * 2 * math.pi + 0.35)
        cam.append(B.con(tronco=4, muslo_c=a[0] * 0.85, rodilla_c=a[1], pie_c=a[2], muslo_l=b[0] * 0.85, rodilla_l=b[1],
                         pie_l=b[2], hombro_c=14 * s, codo_c=16 + max(0, 14 * s) * 0.6, hombro_l=-14 * s,
                         codo_l=16 + max(0, -14 * s) * 0.6, hunde=0.5 if i % 4 in (1, 2) else 0,
                         extra={'fase': i, 'vuelo': 2 + sin(i, 8)}))
    A['caminar'] = Anim(cam, 9, True)
    A['correr'] = Anim([p.con(mano_c='garra', mano_l='garra', extra={'fase': i, 'vuelo': 6 + sin(i, 8)})
                        for i, p in enumerate(A['correr'].poses)], 13, True)
    # Golpe (anuncia el zarpazo): se yergue, garra atrás, capa abierta.
    g0 = B.con(tronco=-8, cabeza=-6, hombro_c=-140, codo_c=30, hombro_l=-40, codo_l=40, muslo_c=14, rodilla_c=10,
               muslo_l=-14, rodilla_l=8, mano_c='garra', mano_l='garra', cara='grito', extra={'abre': 0.6, 'vuelo': 1})
    g1 = g0.con(tronco=-12, hombro_c=-155, codo_c=40, hunde=1, extra={'abre': 1, 'vuelo': 2, 'fase': 1})
    A['golpe'] = Anim([g0, g1], 6, False)
    # Ataque (zarpazo): barre hacia adelante y abajo, la capa sigue el giro.
    k1 = B.con(tronco=22, cabeza=6, hombro_c=96, codo_c=6, hombro_l=-40, codo_l=30, muslo_c=34, rodilla_c=30,
               muslo_l=-22, rodilla_l=10, pie_l=-14, mano_c='garra', mano_l='garra', cara='grito',
               extra={'vuelo': 6, 'fase': 2})
    k2 = k1.con(tronco=28, hombro_c=56, codo_c=20, extra={'vuelo': 7, 'fase': 3})
    k3 = B.con(tronco=12, hombro_c=30, codo_c=24, hombro_l=-20, codo_l=24, muslo_c=24, rodilla_c=18, muslo_l=-16,
               mano_c='garra', extra={'vuelo': 4, 'fase': 4})
    A['ataque'] = Anim([g1, k1, k2, k3], 11, False)
    A['disparar'] = Anim([k1, k3], 9, False)
    A['lanzar'] = Anim([g0, k1, k3], 9, False)
    # Invocar (transformación / murciélagos): brazos en alto, capa abierta como alas.
    inv = B.con(tronco=-6, cabeza=-10, hombro_c=112, codo_c=36, hombro_l=150, codo_l=20, mano_c='garra',
                mano_l='garra', cara='grito', muslo_c=14, muslo_l=-12)
    A['invocar'] = Anim([inv.con(hombro_c=112 + 6 * (i % 2), hunde=i % 2,
                                 extra={'abre': 1, 'vuelo': 1 + i % 2, 'fase': i, 'chispas': i}) for i in range(4)],
                        6, True)
    # Conjuro (raíces): se inclina y hunde la garra hacia el suelo.
    rai = B.con(tronco=30, cabeza=10, hombro_c=50, codo_c=-10, hombro_l=-30, codo_l=30, muslo_c=40, rodilla_c=60,
                muslo_l=-20, rodilla_l=30, mano_c='garra', mano_l='garra', cara='concentrado')
    A['conjuro'] = Anim([rai.con(hombro_c=50 + 4 * (i % 2), hunde=i % 2, extra={'fase': i, 'vuelo': 2, 'chispas': i})
                         for i in range(4)], 6, True)
    # Esquivar (niebla): se envuelve en la capa y se trama.
    esq = B.con(tronco=10, cabeza=8, hombro_c=60, codo_c=110, hombro_l=50, codo_l=110, muslo_c=10, muslo_l=-6,
                extra={'vuelo': 3})
    A['esquivar'] = Anim([esq.con(extra={'vuelo': 3, 'disuelve': 0.25, 'disuelve_dir': 'centro'}),
                          esq.con(extra={'vuelo': 4, 'disuelve': 0.55, 'disuelve_dir': 'centro', 'fase': 1}),
                          esq.con(extra={'vuelo': 4, 'disuelve': 0.75, 'disuelve_dir': 'centro', 'fase': 2})],
                         10, False)
    # Aturdido (vulnerable a SOL/LUZ): se cubre el rostro con el brazo, tambaleándose.
    atu = B.con(tronco=-10, cabeza=-12, hombro_c=120, codo_c=100, hombro_l=-30, codo_l=30, muslo_c=14, rodilla_c=14,
                muslo_l=-10, cara='dolor', brazo_l_delante=False)
    A['aturdido'] = Anim([atu.con(tronco=-10 + 4 * sin(i, 4), extra={'fase': i, 'vuelo': 1}) for i in range(4)], 4, True)
    # Agotado: de rodillas, cabeza gacha (forma humana).
    ago = B.con(tronco=16, cabeza=22, muslo_c=24, rodilla_c=110, pie_c=-60, muslo_l=2, rodilla_l=104, pie_l=-70,
                hombro_c=12, codo_c=20, hombro_l=4, codo_l=20, cara='parpadeo')
    A['agotado'] = Anim([ago.con(hunde=i % 2, extra={'fase': i}) for i in range(4)], 3, True)
    # Daño.
    A['dano'] = Anim([p.con(extra={'vuelo': 2}) for p in A['dano'].poses], 8, False)
    # Purificar / morir (liberado): de rodillas, levanta la cara en paz y se deshace en niebla.
    paz = ago.con(cabeza=-6, tronco=6, cara='calma', extra={'libre': 1})
    A['purificar'] = Anim([ago.con(extra={'chispas': 0}), paz.con(extra={'libre': 1, 'chispas': 1}),
                           paz.con(extra={'libre': 1, 'chispas': 2})], 4, False)
    A['morir'] = Anim([ago, paz.con(extra={'libre': 1, 'chispas': 0}),
                       paz.con(extra={'libre': 1, 'chispas': 1, 'disuelve': 0.25}),
                       paz.con(extra={'libre': 1, 'chispas': 2, 'disuelve': 0.5}),
                       paz.con(extra={'libre': 1, 'chispas': 3, 'disuelve': 0.75}),
                       paz.con(extra={'libre': 1, 'chispas': 4, 'disuelve': 0.95})], 6, False)
    return A
