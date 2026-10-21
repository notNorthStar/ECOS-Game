"""Espíritus de Catemaco (variantes `hombre` y `mujer`, ~72 px): almas atormentadas, pálidas, gris azulado, con
túnica raída que se arrastra hacia atrás como humo. Flotan: los pies cuelgan con la punta hacia abajo y nunca
pisan; el cuadro se ancla a la altura de la pose base (no al píxel más bajo) para que el cuerpo no salte.

Lo etéreo se simula con paleta fría y tramado: los jirones de la túnica, las puntas del cabello y las mangas usan
el material 'velo' (ver `_espectros.py`), que se trama al 50 % con alpha 0/255 y sin contorno.
`purificar` = se calma (ojos cerrados, se aclara, motas de luz); `morir` = se deshace en luz de los pies a la
cabeza. Sin gore."""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas, previo  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import animaciones_humanas  # noqa: E402
from personajes._espectros import RigEspectro, eje, kit_variantes, motas, torso_vacio  # noqa: E402

NAVY = '#141c2c'
ECTO = ['#2c3c56', '#4d6684', '#7e98b2', '#b2c6d8', '#e2ecf4']

PAL = Paleta([
    Material('ecto',  ECTO,                                             NAVY),
    Material('velo',  ECTO,                                             NAVY),
    Material('piel',  ['#3e4e68', '#6c849c', '#a4b8ca', '#d6e4ee'],    NAVY),
    Material('pelo',  ['#1e2a40', '#3a4c6a', '#62799a', '#93abc6'],    '#101828'),
    Material('ojo',   ['#3ab0d4', '#c4f8ff'],                          NAVY),
    Material('luz',   ['#6cc8e8', '#bef2ff', '#f4ffff'],               '#3ab0d4'),
])

# ------------------------------------------------------------------------------------------------
# Cabezas 12×13 (mirando a la derecha). 0-3 pelo · s k l piel · d hueco (sombra profunda) · g brillo del ojo
# · m boca (oscura). Ancla 'cuello' (donde se apoya) y 'nuca' (de donde cae el pelo largo).
# ------------------------------------------------------------------------------------------------
LEY_CABEZA = {
    '0': ('pelo', 0), '1': ('pelo', 1), '2': ('pelo', 2), '3': ('pelo', 3),
    's': ('piel', 1), 'k': ('piel', 2), 'l': ('piel', 3), 'd': ('piel', 0, 'f'),
    'g': ('ojo', 1, 'f'), 'G': ('ojo', 0, 'f'), 'm': ('pelo', 0, 'f'),
}

CAB = {
    'hombre': """
        ...01111....
        ..0122221...
        .012233321..
        01223333321.
        0122333llk..
        012233lkkkk.
        01223lkdddk.
        0122lkkdgdk.
        0122kkkkdkkk
        .012ksskkkk.
        .012ksdkmmk.
        ..01sskkmk..
        ...0sss.....
    """,
    'mujer': """
        ...011110...
        ..01222210..
        .0122333210.
        012233333211
        0122333332l.
        012233332lk.
        01223332ldk.
        0122332kdgk.
        0122322kddkk
        012232kkkkkk
        0122322ksmk.
        0122322ssk..
        01222..ss...
    """,
}
# filas de la cara que cambian con la expresión: (fila, contenido)
EXPR = {
    'hombre': {
        'parpadeo': {7: '0122lkkdGdk.'},
        'grito': {10: '.012ksdmmmk.', 11: '..01ssmmmk..'},
        'dolor': {6: '01223lddkdk.', 7: '0122lkkdddk.', 10: '.012ksdmmmk.', 11: '..01ssmmmk..'},
        'concentrado': {6: '01223lddddk.', 7: '0122lkkdgdk.'},
        'calma': {6: '01223lkkkkk.', 7: '0122lkkddkk.', 10: '.012ksskkmk.', 11: '..01sskkk...'},
    },
    'mujer': {
        'parpadeo': {7: '0122332kdGk.'},
        'grito': {10: '0122322kmmk.', 11: '0122322smmk.'},
        'dolor': {6: '01223332dkd.', 7: '0122332kddk.', 10: '0122322kmmk.', 11: '0122322smmk.'},
        'concentrado': {6: '01223332ddd.'},
        'calma': {6: '01223332lkk.', 7: '0122332kddk.', 10: '0122322kskk.'},
    },
}
ANCLAS_CAB = {'hombre': {'cuello': (5, 12), 'nuca': (1, 7), 'coronilla': (4, 0)},
              'mujer': {'cuello': (7, 12), 'nuca': (1, 6), 'coronilla': (4, 0)}}

_cache = {}


def cabeza(var: str, cara: str) -> Mapa:
    k = (var, cara)
    if k not in _cache:
        ls = [l.strip() for l in CAB[var].strip('\n').split('\n')]
        for i, f in EXPR[var].get(cara, {}).items():
            ls[i] = f
        _cache[k] = Mapa(ls, LEY_CABEZA, PAL, dict(ANCLAS_CAB[var]))
    return _cache[k]


ANCLAS_TORSO = {'o': (0, 0), 'cintura': (0, -7), 'pecho': (1, -14), 'cuello': (2, -22),
                'hombro_c': (1, -18), 'hombro_l': (-2, -18)}
_TORSO = torso_vacio(PAL, ANCLAS_TORSO)


class Espiritu(RigEspectro):
    id = 'espiritu'
    tipo = 'humanoide'
    fw, fh = 80, 96
    pivote = (40, 92)
    alto = 72
    L_muslo, L_pierna, L_pie, alto_tobillo = 15, 16, 7, 2
    L_brazo, L_ante = 11, 10
    sep_cadera = (1.0, -1.0)
    torso_cizalla_max = 0.0
    paleta = PAL
    paletas = {'hombre': PAL, 'mujer': PAL}
    variantes = ('hombre', 'mujer')
    ancla_fija = True
    largo_falda = {'hombre': 24, 'mujer': 27}

    def pose_base(self):
        return BASE

    def torso_mapa(self, pose):
        return _TORSO

    def cabeza_mapa(self, pose):
        return cabeza(self.var(pose), pose.cara if pose.cara in EXPR['hombre'] or pose.cara == 'normal' else 'normal')

    def orden(self, pose):
        o = ['brazo_l', 'pierna_l', 'pierna_c', 'torso', 'pelo_atras', 'cabeza', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    # ---- piernas: flacas, descalzas, colgando ------------------------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        pi = self.paleta['piel']
        capa.capsula(p['talon'], p['punta'], 1.2, 0.7, pi, tonos=(1, 2, 3))
        capa.capsula(p['rodilla'], p['tobillo'], 1.7, 1.1, pi, tonos=(1, 2, 3))
        capa.capsula(p['cadera'], p['rodilla'], 2.6, 2.0, pi, tonos=(1, 2, 3))

    # ---- brazos: manga ancha y raída hasta media antebrazo, mano huesuda ---------------------
    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        dibujar_mano(capa, P, b, mano if mano in ('abierta', 'garra', 'puno') else 'abierta', tam=0.9)
        capa.capsula(b['codo'], b['muneca'], 1.5, 1.2, P['piel'], tonos=(1, 2, 3), redondo_b=False)
        fin = mas(b['codo'], dir_ang(b['ang_ante']), self.L_ante * 0.45)
        capa.capsula(b['codo'], fin, 2.6, 3.0, P['ecto'], tonos=(1, 2, 3), redondo_b=False)
        capa.capsula(b['hombro'], b['codo'], 2.8, 2.6, P['ecto'], tonos=(1, 2, 3), pliegues=[(0.5, 1)])
        # jirón que cuelga de la boca de la manga (velo), siempre hacia abajo y un poco atrás
        vien = pose.extra.get('viento', 1)
        d = dir_ang(b['ang_ante'])
        n = (-d[1], d[0])
        a, bb = mas(fin, n, 2.6), mas(fin, n, -2.6)
        lo = a if a[1] > bb[1] else bb
        capa.poligono([a, bb, mas(lo, (-1.5 - vien * 0.5, 4.5))], P['velo'], ton=2)

    # ---- túnica: torso y faldón en UNA capa (sin línea en la cintura) -------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        p = lz.parte()
        v = c['variante']
        tor = c['torso']
        cad = c['cadera_torso']
        R = c['R']
        E = P['ecto']
        vien = pose.extra.get('viento', 1)
        fase = pose.extra.get('fase', 0)
        largo = self.largo_falda[v] + pose.extra.get('falda_dy', 0)
        cin, pec, cue = tor.punto('cintura'), tor.punto('pecho'), tor.punto('cuello')
        u, n = eje(cad, cue)

        def L(dx, dy):
            q = R @ np.array([dx, dy])
            return cad[0] + q[0], cad[1] + q[1]

        # 1) faldón: de la cintura al borde, arrastrado hacia atrás, con borde en dientes
        kx = max(math.sin(math.radians(pose.muslo_c)), math.sin(math.radians(pose.muslo_l))) * self.L_muslo
        frente = 4.5 + max(0.0, kx * 0.6)
        borde = []
        N = 11
        for i in range(N + 1):
            t = i / N
            x = lerp(frente + 1.5, -7.5 - vien * 1.3, t)
            y = largo + (2.5 if i % 2 == 0 else -0.5) + math.sin(fase * 1.3 + i * 1.7) * 1.0 - t * (1 + vien * 0.7)
            borde.append(L(x, y))
        pts = [mas(cin, n, 4.6), L(frente, 1)] + borde + [L(-6 - vien * 0.5, 0), mas(cin, n, -4.4)]
        p.poligono(pts, E, sombreado=(1, 2, 3), ks=2)
        # pliegues verticales de la tela
        for k, dx in enumerate((-3.0, 0.5, 3.5)):
            a = L(dx, 2 + k)
            b = L(dx - vien * 0.5 - 1 + k * 0.6, largo - 2 + (k % 2))
            p.linea(a, b, E, 1 if k != 1 else 2)
        # jirones largos que se arrastran hacia atrás (más con viento)
        for k in range(2 + int(vien > 4)):
            a = L(-5 - k * 2.0 - vien * 0.9, largo - 3 - k * 3)
            b = L(-9 - vien * 2.1 - k * 1.5, largo - 3 - k * 4 + math.sin(fase + k) * 1.5)
            p.capsula(a, mas(b, (0, 2)), 1.6, 0.6, P['velo'], tonos=(1, 2, 3))
        self.franja_velo(p, 2)
        # 2) torso encorvado: espalda redonda, hombros caídos
        p.capsula(cad, cin, 4.4, 4.2, E, tonos=(1, 2, 3))
        p.capsula(cin, pec, 4.2, 5.0, E, tonos=(1, 2, 3))
        p.capsula(pec, mas(cue, (0, 2)), 5.0, 3.4, E, tonos=(1, 2, 3))
        p.capsula(mas(mas(pec, n, -1.5), u, 2), mas(mas(cue, n, -2.5), u, -1), 3.0, 2.4, E, tonos=(1, 2, 3))
        p.capsula(mas(cue, (0, 2)), mas(cue, (1, -1)), 1.6, 1.5, P['piel'], tonos=(1, 2, 3))
        # pliegue del manto que cruza del hombro a la cintura
        p.linea(mas(mas(cue, u, -3), n, -2.5), mas(mas(cin, u, 1), n, 2.5), E, 1)
        p.linea(mas(mas(pec, u, 1), n, 1.5), mas(mas(cin, u, -2), n, 3.5), E, 1)
        # clavícula hundida asomando por el escote
        p.pon_m(mas(mas(cue, u, -2.5), n, 2.5), P['piel'], 1)
        p.pon_m(mas(mas(cue, u, -2.5), n, 1.5), P['piel'], 2)
        return [(p, 'contorno', 0, 1)]

    def franja_velo(self, p: Capa, alto: int):
        """Los últimos `alto` px de cada columna pasan a 'velo' (se tramarán: borde translúcido)."""
        P = self.paleta
        m = p.mascara()
        cols = np.nonzero(m.any(axis=0))[0]
        for x in cols:
            ys = np.nonzero(m[:, x])[0]
            yb = ys.max()
            sel = ys[ys > yb - alto]
            p.mat[sel, x] = P['velo']

    # ---- cabello: una masa que cae por la espalda (larga en la mujer) -------------------------
    def parte_pelo_atras(self, lz, c, pose):
        P = self.paleta
        v = c['variante']
        p = lz.parte()
        cab = previo(self.cabeza_mapa(pose), c['cuello'], c['M_cabeza'], 'cuello')
        nuca = cab.punto('nuca')
        cad = c['cadera_torso']
        R = c['R']
        vien = pose.extra.get('viento', 1)
        fase = pose.extra.get('fase', 0)
        muj = v == 'mujer'
        largo = (cad[1] - nuca[1]) + (12 if muj else -9)
        ancho = 5.5 if muj else 4.6

        def W(dx, dy):
            q = R @ np.array([dx, dy])
            return nuca[0] + q[0], nuca[1] + q[1]

        def curva(off, t):
            atras = vien * (0.9 if muj else 0.5) * t * t * 4
            ola = math.sin(fase * 1.2 + t * 6) * (1.6 if muj else 0.8) * t
            return off - atras + ola

        N = 8
        izq, der = [], []
        for i in range(N + 1):
            t = i / N
            izq.append(W(curva(-ancho * (0.75 + 0.45 * t), t), largo * t - 3))
            der.append(W(curva(2.5 - t * 2.0, t) + vien * 0.15 * t, largo * t - 4))
        fondo = []
        for k in range(7):
            t = k / 6
            fondo.append((lerp(izq[-1][0], der[-1][0], t),
                          lerp(izq[-1][1], der[-1][1], t) + (3.5 if k % 2 == 1 else -0.5)))
        p.poligono(izq + fondo[1:-1] + der[::-1], P['pelo'], sombreado=(1, 2, 3), ks=1)
        # mechones (líneas oscuras y claras a lo largo)
        for k in range(4 if muj else 2):
            off = 0.5 - k * 1.6
            prev = W(off, 0)
            for i in range(1, N + 1):
                t = i / N
                pt = W(curva(off * (1 + 0.3 * t), t), largo * t - 2)
                p.linea(prev, pt, P['pelo'], 0 if k % 2 == 0 else 3)
                prev = pt
        self.franja_velo(p, 3)
        return [(p, 'contorno', 0)]

    # ---- efectos --------------------------------------------------------------------------
    def post(self, lz, c, pose):
        if pose.extra.get('aclara'):
            lz.aclarar(1, self.paleta)
        ch = pose.extra.get('chispas')
        if ch is not None:
            cen = c['torso'].punto('pecho')
            motas(lz, cen, self.paleta['luz'], ch, tono=(0, 2 if pose.extra.get('aclara') else 1))


def lerp(a, b, t):
    return a + (b - a) * t


PERSONAJE = Espiritu()
VARIANTES_KIT, cuadro_variante, revision_variantes = kit_variantes(PERSONAJE, ['hombre', 'mujer'])
FONDO = ('nivel-03-catemaco', 'altar_olmeca', 296)

# ------------------------------------------------------------------------------------------------
# Animaciones (flotando: pies colgando, la túnica ondula; 'fase' mueve las ondas, 'viento' alarga los jirones)
# ------------------------------------------------------------------------------------------------
BASE = Pose(tronco=6, cabeza=4, hombro_c=12, codo_c=26, hombro_l=4, codo_l=22,
            muslo_c=8, rodilla_c=20, pie_c=-52, muslo_l=-3, rodilla_l=24, pie_l=-58,
            mano_c='abierta', mano_l='abierta', extra={'viento': 1})


def animaciones():
    B = BASE
    A = animaciones_humanas(B)
    sin = lambda i, n, f=0.0: math.sin(i / n * 2 * math.pi + f)  # noqa: E731

    # Reposo: sube y baja 2 px, la túnica y el pelo ondulan, los brazos se mecen.
    A['reposo'] = Anim([B.con(dy=-round(1 + sin(i, 6)), hombro_c=12 + 4 * sin(i, 6, 1), hombro_l=4 + 3 * sin(i, 6, 2),
                              muslo_c=8 + 3 * sin(i, 6, 1), muslo_l=-3 + 3 * sin(i, 6, 2.5),
                              cara='parpadeo' if i == 4 else 'normal',
                              extra={'fase': i, 'viento': 1.5 + sin(i, 6)}) for i in range(6)], 5, True)

    # Caminar (deriva): las piernas "reman" en el aire, el cuerpo se inclina, los brazos cuelgan al frente.
    cam = []
    for i in range(8):
        s = sin(i, 8)
        cam.append(B.con(tronco=10, cabeza=6, dy=-round(1 + sin(i, 8, 0.8)),
                         muslo_c=6 + 12 * s, rodilla_c=26 - 10 * s, pie_c=-50,
                         muslo_l=-2 - 12 * s, rodilla_l=26 + 10 * s, pie_l=-56,
                         hombro_c=20 + 8 * s, codo_c=30, hombro_l=10 - 8 * s, codo_l=26,
                         extra={'fase': i, 'viento': 3 + sin(i, 8, 1)}))
    A['caminar'] = Anim(cam, 8, True)

    # Correr (se abalanza volando): muy inclinado, piernas atrás, brazos tendidos, jirones largos.
    cor = []
    for i in range(8):
        s = sin(i, 8)
        cor.append(B.con(tronco=24, cabeza=-6, dy=-round(1 + sin(i, 8, 0.5)),
                         muslo_c=-12 + 10 * s, rodilla_c=40 - 10 * s, pie_c=-70,
                         muslo_l=-22 - 10 * s, rodilla_l=44 + 10 * s, pie_l=-74,
                         hombro_c=70 + 8 * s, codo_c=14, hombro_l=56 - 8 * s, codo_l=18, mano_c='garra',
                         mano_l='garra', extra={'fase': i * 2, 'viento': 8 + sin(i, 8)}))
    A['correr'] = Anim(cor, 12, True)

    # Ataque: se encoge con las garras atrás (anticipación), se lanza a tocar con ambas manos y vuelve.
    a0 = B.con(tronco=-8, cabeza=-8, hombro_c=150, codo_c=50, hombro_l=130, codo_l=50, muslo_c=20, rodilla_c=40,
               muslo_l=6, rodilla_l=44, mano_c='garra', mano_l='garra', cara='grito', extra={'viento': 2, 'fase': 1})
    a1 = a0.con(tronco=-12, hombro_c=160, hombro_l=140, dy=-1, extra={'viento': 3, 'fase': 2})
    a2 = B.con(tronco=26, cabeza=-4, hombro_c=88, codo_c=2, hombro_l=78, codo_l=6, muslo_c=-14, rodilla_c=36,
               muslo_l=-24, rodilla_l=40, pie_c=-70, pie_l=-74, dx=3, mano_c='garra', mano_l='garra', cara='grito',
               extra={'viento': 9, 'fase': 3})
    a3 = B.con(tronco=16, hombro_c=60, codo_c=20, hombro_l=50, codo_l=24, mano_c='garra', mano_l='garra',
               extra={'viento': 5, 'fase': 4})
    A['ataque'] = Anim([a0, a1, a2, a2.con(hombro_c=84, extra={'viento': 8, 'fase': 5}), a3], 10, False)
    A['golpe'] = A['ataque']
    A['disparar'] = Anim([a1, a2, a3], 10, False)
    A['lanzar'] = Anim([a0, a2, a3], 9, False)

    # Conjuro: manos juntas frente a la boca, temblando (lamento).
    con = B.con(tronco=4, cabeza=10, hombro_c=58, codo_c=110, hombro_l=50, codo_l=110, mano_c='abierta',
                mano_l='abierta', cara='concentrado', brazo_l_delante=False)
    A['conjuro'] = Anim([con.con(extra={'fase': i, 'viento': 2, 'chispas': i}, hombro_c=58 + (i % 2) * 3, dy=-(i % 2))
                         for i in range(4)], 6, True)
    # Invocar: brazos al cielo, gime (codex: ambos brazos arriba).
    inv = B.con(tronco=-6, cabeza=-14, hombro_c=160, codo_c=20, hombro_l=145, codo_l=26, mano_c='garra',
                mano_l='garra', cara='grito', muslo_c=12, muslo_l=-6)
    A['invocar'] = Anim([inv.con(hombro_c=160 - 6 * (i % 2), dy=-(i % 2), extra={'fase': i, 'viento': 2, 'chispas': i})
                         for i in range(4)], 6, True)

    # Saltar / caer: sube con los brazos atrás; cae con la túnica hacia arriba.
    A['subida'] = Anim([B.con(tronco=4, cabeza=-8, hombro_c=-30, codo_c=20, hombro_l=-40, codo_l=20, muslo_c=-6,
                              rodilla_c=30, muslo_l=-12, rodilla_l=34, extra={'viento': 3, 'falda_dy': 2, 'fase': k})
                        for k in range(2)], 8, False)
    A['salto'] = A['subida']
    A['caida'] = Anim([B.con(tronco=6, cabeza=6, hombro_c=110, codo_c=30, hombro_l=100, codo_l=30, muslo_c=16,
                             rodilla_c=30, muslo_l=4, rodilla_l=40, extra={'viento': 2, 'falda_dy': -3, 'fase': k})
                       for k in range(2)], 6, False)
    A['aterrizar'] = Anim([B.con(dy=1, tronco=10, cabeza=8, extra={'viento': 1, 'falda_dy': 1}), B], 12, False)

    # Esquivar: se vuelve humo un instante (se trama) y se desliza.
    esq = B.con(tronco=30, cabeza=4, hombro_c=-40, codo_c=10, hombro_l=-50, codo_l=10, muslo_c=-20, rodilla_c=30,
                muslo_l=-30, rodilla_l=30, pie_c=-80, pie_l=-80)
    A['esquivar'] = Anim([esq.con(extra={'viento': 8, 'disuelve': 0.30, 'disuelve_dir': 'centro', 'fase': 1}),
                          esq.con(dx=2, extra={'viento': 10, 'disuelve': 0.45, 'disuelve_dir': 'centro', 'fase': 2}),
                          esq.con(tronco=18, extra={'viento': 6, 'disuelve': 0.18, 'disuelve_dir': 'centro', 'fase': 3})],
                         12, False)

    A['interactuar'] = Anim([B.con(tronco=10, hombro_c=60, codo_c=20, extra={'fase': 1, 'viento': 2}),
                             B.con(tronco=14, hombro_c=80, codo_c=6, extra={'fase': 2, 'viento': 2})], 5, False)

    # Daño: se sacude hacia atrás gritando.
    A['dano'] = Anim([B.con(tronco=-14, cabeza=-14, hombro_c=-30, codo_c=40, hombro_l=-40, codo_l=40, dx=-2,
                            cara='grito', extra={'viento': -2, 'fase': 2}),
                      B.con(tronco=-4, cabeza=-4, hombro_c=-10, codo_c=30, hombro_l=-20, codo_l=30, cara='dolor',
                            extra={'viento': 0, 'fase': 3})], 8, False)

    # Aturdido: encorvado, se agarra la cabeza y se mece.
    atu = B.con(tronco=22, cabeza=18, hombro_c=130, codo_c=120, hombro_l=120, codo_l=120, mano_c='abierta',
                cara='dolor', muslo_c=14, rodilla_c=40, muslo_l=4, rodilla_l=44)
    A['aturdido'] = Anim([atu.con(tronco=22 + 4 * sin(i, 4), cabeza=18 + 4 * sin(i, 4, 1), dy=-(i % 2),
                                  extra={'fase': i, 'viento': 1}) for i in range(4)], 4, True)
    # Agotado: baja y queda hincado en el aire, abrazándose (ventana para purificar).
    ago = B.con(tronco=30, cabeza=24, hombro_c=50, codo_c=100, hombro_l=40, codo_l=100, muslo_c=70, rodilla_c=130,
                pie_c=-70, muslo_l=60, rodilla_l=130, pie_l=-80, cara='parpadeo', dy=6)
    A['agotado'] = Anim([ago.con(dy=6 + (i % 2), cara='parpadeo' if i % 2 else 'dolor', extra={'fase': i, 'viento': 0.5})
                         for i in range(4)], 3, True)

    # Purificar: se endereza, cierra los ojos, se aclara y lo rodean motas de luz.
    pur = B.con(tronco=0, cabeza=-8, hombro_c=40, codo_c=10, hombro_l=30, codo_l=10, cara='calma',
                muslo_c=4, rodilla_c=14, muslo_l=-4, rodilla_l=18)
    A['purificar'] = Anim([pur.con(extra={'fase': 0, 'viento': 1, 'chispas': 0}),
                           pur.con(hombro_c=50, hombro_l=40, dy=-1, extra={'fase': 1, 'viento': 1, 'chispas': 1, 'aclara': 1}),
                           pur.con(hombro_c=56, hombro_l=46, dy=-2, extra={'fase': 2, 'viento': 1, 'chispas': 2, 'aclara': 1}),
                           pur.con(hombro_c=60, hombro_l=50, dy=-3, extra={'fase': 3, 'viento': 1, 'chispas': 3, 'aclara': 1})],
                          5, False)

    # Morir: grita, se arquea hacia el cielo y se deshace en luz de los pies a la cabeza.
    arc = B.con(tronco=-10, cabeza=-18, hombro_c=150, codo_c=20, hombro_l=135, codo_l=20, cara='calma',
                mano_l='abierta')
    A['morir'] = Anim([A['dano'].poses[0],
                       arc.con(extra={'fase': 1, 'viento': 1, 'disuelve': 0.15, 'chispas': 0}),
                       arc.con(dy=-2, extra={'fase': 2, 'viento': 1, 'disuelve': 0.35, 'chispas': 1, 'aclara': 1}),
                       arc.con(dy=-4, extra={'fase': 3, 'viento': 1, 'disuelve': 0.55, 'chispas': 2, 'aclara': 1}),
                       arc.con(dy=-6, extra={'fase': 4, 'viento': 1, 'disuelve': 0.78, 'chispas': 3, 'aclara': 1}),
                       arc.con(dy=-8, extra={'fase': 5, 'viento': 1, 'disuelve': 0.95, 'chispas': 4, 'aclara': 1})],
                      7, False)
    return A
