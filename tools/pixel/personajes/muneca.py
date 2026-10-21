"""Muñecas poseídas de la Isla de las Muñecas (variantes `1`…`4`, ~54 px): muñecas de porcelana antiguas, cabeza
grande, vestido con encaje en el bajo y el cuello, mangas abullonadas, zapatitos oscuros, articulaciones de
muñeca marcadas y un ojo que brilla con el color de la variante.

  1 · melena lisa rubia ceniza, vestido morado, ojo violeta.
  2 · cabello castaño revuelto con moño rojo, vestido vino, ojo rosa; mejilla cuarteada.
  3 · cabello corto castaño claro con listón, vestido olivo con peto, ojo verde.
  4 · cabello largo ondulado verde, vestido verde azulado con peto claro, ojo turquesa; mejilla cuarteada.

La cabeza es por código (cráneo, pelo, moño y ojo con primitivas que giran sin deformarse), así puede rodar
suelta en `morir`: la muñeca se ROMPE EN PIEZAS (cabeza, brazo y pierna se separan y quedan en el suelo junto al
cuerpo sentado, con esquirlas de porcelana). Sin gore: solo porcelana y tela."""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Material, Paleta, Pose, dir_ang, fk_brazo, mas  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import animaciones_humanas  # noqa: E402
from personajes._espectros import (RigEspectro, eje, kit_variantes, motas,  # noqa: E402
                                   torso_vacio)

PIEL = ['#6a6070', '#a49aa2', '#d6cec8', '#f2ece2']
ENCAJE = ['#857a68', '#c4b89c', '#ebe1c4']
ZAPATO = ['#1e161e', '#3a2e36', '#584a50']
LUZ = ['#c8b070', '#fff0b8', '#fffdf0']

VAR = {
    '1': dict(pelo=['#3a3024', '#625238', '#8c7a5a', '#b6a27e'], vestido=['#22172c', '#3b2849', '#573e6c', '#775a8e'],
              ojo=['#7a3ac8', '#dcb0ff'], lazo=['#2a2034', '#463656', '#665276']),
    '2': dict(pelo=['#2a1810', '#4a2e1e', '#6e462c', '#946640'], vestido=['#2a0f12', '#4a1b1e', '#6c2a2a', '#8e4036'],
              ojo=['#c02a48', '#ffa0b0'], lazo=['#561212', '#8a2222', '#b8403a']),
    '3': dict(pelo=['#36220f', '#5e3e22', '#865e34', '#ae8250'], vestido=['#262012', '#423820', '#625632', '#837548'],
              ojo=['#3a8a2a', '#c0f292'], lazo=['#54280f', '#864222', '#b06a3a']),
    '4': dict(pelo=['#102a26', '#1b443a', '#2a6252', '#428672'], vestido=['#0c2224', '#153838', '#22524e', '#346e66'],
              ojo=['#16a2b4', '#b0fcff'], lazo=['#12302a', '#1e4a40', '#2e6a5a']),
}


def paleta(v: str) -> Paleta:
    d = VAR[v]
    return Paleta([
        Material('piel',    PIEL,          '#2c2430'),
        Material('pelo',    d['pelo'],     '#140c0a' if v != '4' else '#081a18'),
        Material('vestido', d['vestido'],  '#120a10'),
        Material('encaje',  ENCAJE,        '#3a3028'),
        Material('zapato',  ZAPATO,        '#0e0a0e'),
        Material('ojo',     d['ojo'],      '#2c2430'),
        Material('lazo',    d['lazo'],     '#140a0a'),
        Material('luz',     LUZ,           '#8a7038'),
    ])


PALS = {v: paleta(v) for v in VAR}
PAL = PALS['1']

ANCLAS_TORSO = {'o': (0, 0), 'cintura': (0, -4), 'pecho': (1, -8), 'cuello': (1, -12),
                'hombro_c': (1, -10), 'hombro_l': (-1, -10)}
_TORSO = torso_vacio(PAL, ANCLAS_TORSO)


def rot(v, ang):
    r = math.radians(ang)
    return (v[0] * math.cos(r) - v[1] * math.sin(r), v[0] * math.sin(r) + v[1] * math.cos(r))


class Muneca(RigEspectro):
    id = 'muneca'
    tipo = 'humanoide'
    fw, fh = 80, 68
    pivote = (36, 65)
    alto = 54
    L_muslo, L_pierna, L_pie, alto_tobillo = 8, 8, 5, 2
    L_brazo, L_ante = 6, 6
    sep_cadera = (1.0, -1.0)
    torso_cizalla_max = 0.0
    paleta = PAL
    paletas = PALS
    variantes = ('1', '2', '3', '4')

    def torso_mapa(self, pose):
        return _TORSO

    def orden(self, pose):
        o = ['pelo_atras', 'brazo_l', 'pierna_l', 'pierna_c', 'torso', 'cabeza', 'brazo_c', 'esquirlas']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    # ---- piezas sueltas (morir) -------------------------------------------------------------
    def ctx(self, pose):
        c = super().ctx(pose)
        c['ang_cab'] = pose.cabeza + pose.giro
        pz = dict(pose.extra.get('piezas') or {})
        # piezas tiradas en el suelo: (x respecto a la cadera, ángulo)
        suelo = max(max(c['pierna_' + l]['punta'][1], c['pierna_' + l]['talon'][1]) for l in ('c', 'l')) + 1
        cad = c['cadera']
        if 'cabeza_suelo' in pz:
            hx, ang = pz.pop('cabeza_suelo')
            c['ang_cab'] = ang
            cen = (cad[0] + hx, suelo - 8.6)
            q = rot((1.0, -9.0), ang)
            c['cuello'] = (cen[0] - q[0], cen[1] - q[1])
            pz['cabeza'] = (0, 0, 0)
        if 'brazo_suelo' in pz:
            hx, ang = pz.pop('brazo_suelo')
            c['brazo_c'] = fk_brazo((cad[0] + hx, suelo - 2.5), ang, 0, self.L_brazo, self.L_ante)
            c['brazo_c']['suelto'] = True
        for nombre, (dx, dy, ang) in pz.items():
            if nombre == 'cabeza' and (dx, dy, ang) == (0, 0, 0):
                continue
            if nombre == 'cabeza':
                c['cuello'] = mas(c['cuello'], (dx, dy))
                c['ang_cab'] += ang
            elif nombre.startswith('brazo'):
                b = c[nombre]
                h = mas(b['hombro'], (dx, dy))
                c[nombre] = fk_brazo(h, b['ang_brazo'] + ang, b['ang_ante'] - b['ang_brazo'], self.L_brazo, self.L_ante)
                c[nombre]['suelto'] = True
            elif nombre.startswith('pierna'):
                p = c[nombre]
                cen = p['cadera']
                nuevo = {}
                for k, v in p.items():
                    if isinstance(v, tuple):
                        q = rot((v[0] - cen[0], v[1] - cen[1]), -ang)
                        nuevo[k] = (cen[0] + q[0] + dx, cen[1] + q[1] + dy)
                    elif k.startswith('ang_'):
                        nuevo[k] = v + ang
                    else:
                        nuevo[k] = v
                nuevo['suelto'] = True
                c[nombre] = nuevo
        return c

    # ---- piernas: medias de porcelana, rodilla articulada, zapatito ---------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        pi = P['piel']
        capa.capsula(p['talon'], p['punta'], 1.8, 1.5, P['zapato'], tonos=(0, 1, 2))
        capa.capsula(p['rodilla'], p['tobillo'], 1.6, 1.3, pi, tonos=(1, 2, 3))
        capa.capsula(p['cadera'], p['rodilla'], 1.9, 1.6, pi, tonos=(1, 2, 3))
        capa.pon_m(p['rodilla'], pi, 0)          # articulación de muñeca
        if p.get('suelto'):
            capa.elipse(p['cadera'], 1.8, 1.8, pi, tonos=(0, 1, 2))   # bola de la cadera, rota

    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        dibujar_mano(capa, P, b, mano if mano in ('abierta', 'garra', 'puno') else 'abierta', tam=0.7)
        capa.capsula(b['codo'], b['muneca'], 1.2, 1.0, P['piel'], tonos=(1, 2, 3), redondo_b=False)
        capa.capsula(b['hombro'], b['codo'], 1.3, 1.2, P['piel'], tonos=(1, 2, 3))
        capa.pon_m(b['codo'], P['piel'], 0)
        # manga abullonada
        capa.elipse(mas(b['hombro'], dir_ang(b['ang_brazo']), 1.2), 2.6, 2.4, P['vestido'], tonos=(1, 2, 3))
        capa.linea(mas(b['hombro'], dir_ang(b['ang_brazo']), 3.2), mas(b['hombro'], dir_ang(b['ang_brazo']), 3.4),
                   P['encaje'], 1)

    # ---- torso: corpiño + falda acampanada con encaje ----------------------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        v = c['variante']
        p = lz.parte()
        tor = c['torso']
        cad = c['cadera_torso']
        Ve = P['vestido']
        cin, pec, cue = tor.punto('cintura'), tor.punto('pecho'), tor.punto('cuello')
        u, n = eje(cad, cue)
        R = c['R']
        vuelo = pose.extra.get('vuelo', 0)

        def L(dx, dy):
            q = R @ np.array([dx, dy])
            return cad[0] + q[0], cad[1] + q[1]

        # falda: campana del talle al bajo (a la altura de la rodilla), se abre hacia atrás al moverse
        largo = 9 + pose.extra.get('falda_dy', 0)
        kx = max(math.sin(math.radians(pose.muslo_c)), math.sin(math.radians(pose.muslo_l))) * self.L_muslo
        fr = 6.5 + max(0, kx * 0.5)
        at = -6.5 - vuelo
        borde = []
        N = 8
        for i in range(N + 1):
            t = i / N
            borde.append(L(lerp(fr, at, t), largo + (0.6 if i % 2 else 0) - t * vuelo * 0.4))
        pts = [mas(cin, n, 3.6), L(fr - 2, 0)] + borde + [L(at + 2, 0), mas(cin, n, -3.6)]
        p.poligono(pts, Ve, sombreado=(1, 2, 3), ks=2)
        for k, dx in enumerate((-3.2, 0.2, 3.4)):
            p.linea(L(dx * 0.6, 1.5), L(dx - vuelo * 0.3, largo - 1), Ve, 0 if k != 1 else 1)
        # encaje del bajo: dos filas (base y festón)
        for i in range(N):
            a, b = borde[i], borde[i + 1]
            p.linea(mas(a, u, 1), mas(b, u, 1), P['encaje'], 1)
            p.linea(a, b, P['encaje'], 2 if i % 2 == 0 else 1)
        # corpiño
        p.capsula(cad, cin, 3.4, 3.2, Ve, tonos=(1, 2, 3))
        p.capsula(cin, mas(cue, (0, 1)), 3.2, 3.4, Ve, tonos=(1, 2, 3))
        if v in ('3', '4'):   # peto claro al frente
            p.linea(mas(mas(cin, n, 2.2), u, -1), mas(mas(cue, n, 2.2), u, -2), P['encaje'] if v == '4' else Ve,
                    1 if v == '4' else 3)
            p.linea(mas(mas(cin, n, 1.2), u, 0), mas(mas(cue, n, 1.2), u, -2), P['encaje'] if v == '4' else Ve,
                    0 if v == '4' else 3)
        # botones y cuello de encaje
        for k in range(2):
            p.pon_m(mas(mas(pec, u, -k * 2.5), n, 2.6), P['encaje'], 2)
        p.capsula(mas(mas(cue, n, -2), u, -0.5), mas(mas(cue, n, 2.5), u, -0.5), 1.2, 1.2, P['encaje'], tonos=(0, 1, 2))
        return [(p, 'contorno', 0, 1)]

    # ---- cabeza por código ----------------------------------------------------------------
    def _L(self, c):
        cue = c['cuello']
        ang = c['ang_cab']
        cen = mas(cue, rot((1.0, -9.0), ang))

        def L(dx, dy):
            q = rot((dx, dy), ang)
            return cen[0] + q[0], cen[1] + q[1]
        return L, cen

    def parte_pelo_atras(self, lz, c, pose):
        """Melena que cae detrás (variante 4: hasta la cintura)."""
        if c['variante'] != '4':
            return []
        P = self.paleta
        L, cen = self._L(c)
        p = lz.parte()
        f = pose.extra.get('fase', 0)
        vien = pose.extra.get('vuelo', 0)
        izq = [L(-9, -2), L(-10.5, 6), L(-10.5 - vien * 0.6, 14), L(-9 - vien, 21)]
        der = [L(-2, 21), L(-1, 14), L(0, 6), L(0, 0)]
        ondas = []
        for k in range(5):
            ondas.append(L(lerp(-9 - vien, -2, k / 4) + math.sin(f + k) * 0.5, 21 + (2 if k % 2 else 0)))
        p.poligono(izq + ondas[1:-1] + der, P['pelo'], sombreado=(0, 1, 2), ks=1)
        for k in range(3):
            a = L(-7 + k * 2, 4)
            p.linea(a, L(-8 + k * 2 - vien * 0.6 + math.sin(f + k), 20), P['pelo'], 0 if k % 2 else 2)
        return [(p, 'contorno', 0)]

    def parte_cabeza(self, lz, c, pose):
        P = self.paleta
        v = c['variante']
        L, cen = self._L(c)
        pi, pe = P['piel'], P['pelo']
        cue = c['cuello']
        # cuello y cráneo de porcelana
        a = lz.parte()
        pz = pose.extra.get('piezas') or {}
        if 'cabeza' not in pz and 'cabeza_suelo' not in pz:
            a.capsula(mas(cue, (0, 1)), L(0.5, 7), 1.6, 1.6, pi, tonos=(1, 2, 3))
        a.elipse(L(0.3, 0), 8.0, 8.4, pi, tonos=(1, 2, 3), sombra=-0.35)
        a.elipse(L(3.5, 4.0), 4.5, 3.6, pi, tonos=(1, 2, 3), sombra=-0.4)       # mejilla redonda
        # cara: ojo grande hundido con el brillo, nariz diminuta, boca pequeña
        g = lz.parte()
        cara = pose.cara
        poseida = not pose.extra.get('libre')
        ex, ey = g.a_px(L(4.6, 1.2))
        apagado = cara in ('parpadeo', 'calma') or not poseida
        for dx, dy in ((-1, -1), (0, -1), (1, -1), (-1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (2, -1), (2, 1)):
            g.pon(ex + dx, ey + dy, pi, 0, fijo=True)
        if apagado:
            g.pon(ex, ey, pi, 0, fijo=True)
            g.pon(ex + 1, ey, pi, 0, fijo=True)
            g.pon(ex, ey - 1, pi, 1, fijo=True)
            g.pon(ex + 1, ey - 1, pi, 1, fijo=True)
        else:
            g.pon(ex, ey, P['ojo'], 1, fijo=True)
            g.pon(ex + 1, ey, P['ojo'], 0, fijo=True)
            g.pon(ex, ey + 1, P['ojo'], 0, fijo=True)
        g.pon_m(L(8.6, 2.6), pi, 2)
        if cara in ('grito', 'dolor'):
            g.pon_m(L(6.8, 5.6), pi, 0, fijo=True)
            g.pon_m(L(7.6, 5.6), pi, 0, fijo=True)
            g.pon_m(L(7.0, 6.4), pi, 0, fijo=True)
        else:
            g.pon_m(L(7.2, 5.8), P['lazo'], 1, fijo=True)
        # grietas de la porcelana (2 y 4 siempre; todas al recibir daño o romperse)
        if v in ('2', '4') or pose.extra.get('grieta'):
            pts = [L(4.2, 3.0), L(5.0, 4.4), L(4.4, 5.6), L(5.4, 7.0)]
            for q0, q1 in zip(pts, pts[1:]):
                g.linea(q0, q1, pi, 0, fijo=True)
        if pose.extra.get('grieta', 0) > 1:
            g.linea(L(-1, -6), L(1, -2), pi, 0, fijo=True)
            g.linea(L(1, -2), L(0, 1), pi, 0, fijo=True)
        # pelo (delante del cráneo)
        h = lz.parte()
        self.pelo(h, L, v, pose)
        return [(a, 'contorno', 0, 1), (g, None, 0), (h, 'contorno', 0, 1)]

    def pelo(self, h: Capa, L, v, pose):
        P = self.paleta
        pe = P['pelo']
        f = pose.extra.get('fase', 0)
        if v == '1':      # melena lisa a la barbilla con flequillo recto
            pts = [L(9.0, -3.0), L(7.5, -7.0), L(4.0, -9.8), L(-1.0, -10.4), L(-6.0, -8.6), L(-9.4, -4.0),
                   L(-9.8, 2.0), L(-9.0, 7.5), L(-5.0, 8.6), L(-1.6, 8.2), L(-0.8, 3.0), L(0.4, -1.5),
                   L(2.5, -2.4), L(4.5, -1.6), L(6.5, -2.6), L(8.0, -1.6)]
            h.poligono(pts, pe, sombreado=(1, 2, 3), ks=2)
            for k in range(4):
                h.linea(L(-7 + k * 2.2, -6 + k * 0.4), L(-8 + k * 2.0, 7.5 - (k == 3) * 3), pe, 1 if k % 2 else 3)
        elif v == '2':    # castaño revuelto con moño rojo
            pts = [L(9.0, -3.0), L(8.0, -7.5), L(4.0, -10.2), L(-1.0, -10.6), L(-6.5, -9.0), L(-10.0, -4.0),
                   L(-11.0, 1.0), L(-10.0, 4.0), L(-11.2, 7.0), L(-8.0, 6.6), L(-7.0, 9.6), L(-4.0, 7.4),
                   L(-2.0, 9.0), L(-1.0, 3.0), L(0.5, -1.0), L(2.0, -3.0), L(3.6, -0.8), L(5.4, -2.8), L(7.4, -1.0)]
            h.poligono(pts, pe, sombreado=(1, 2, 3), ks=2)
            for k in range(4):
                h.linea(L(-6 + k * 2, -7), L(-9 + k * 2.2, 6 + (k % 2) * 2), pe, 0 if k % 2 else 3)
            h.pon_m(L(-11.5, 3), pe, 2)
            h.pon_m(L(-12.2, 2), pe, 1)
            self.mono(h, L(-2.5, -10.2), 2.6)
        elif v == '3':    # corto, ondas y listón atrás
            pts = [L(8.8, -3.5), L(7.0, -8.0), L(3.0, -10.4), L(-2.0, -10.2), L(-7.0, -8.0), L(-9.6, -3.5),
                   L(-9.6, 1.5), L(-8.4, 4.4), L(-6.0, 5.0), L(-4.8, 3.2), L(-2.5, 4.6), L(-1.0, 2.0), L(0.6, -1.4),
                   L(3.0, -2.0), L(5.0, -1.0), L(7.0, -2.2)]
            h.poligono(pts, pe, sombreado=(1, 2, 3), ks=2)
            for k in range(3):
                h.linea(L(-5 + k * 2.4, -8), L(-7 + k * 2.2, 2), pe, 1 if k % 2 else 3)
            self.mono(h, L(-7.5, -6.5), 2.0)
            h.capsula(L(-8.0, -5.0), L(-10.0, 2.0 + math.sin(f) * 0.5), 0.9, 0.8, P['lazo'], tonos=(0, 1, 2))
        else:             # '4' larga y ondulada (la masa de atrás va en pelo_atras)
            pts = [L(9.0, -3.0), L(7.8, -7.6), L(4.0, -10.4), L(-1.5, -10.6), L(-7.0, -8.6), L(-10.0, -3.5),
                   L(-10.4, 3.0), L(-9.0, 8.0), L(-3.0, 8.0), L(-1.0, 3.0), L(-0.2, -1.0), L(1.6, -2.6),
                   L(3.5, -1.2), L(5.6, -2.8), L(7.6, -1.4)]
            h.poligono(pts, pe, sombreado=(1, 2, 3), ks=2)
            for k in range(4):
                h.linea(L(-7 + k * 2, -7), L(-8 + k * 2 + math.sin(f + k) * 0.6, 7), pe, 1 if k % 2 else 3)

    def mono(self, h: Capa, centro, r):
        P = self.paleta
        lz_ = P['lazo']
        h.elipse(mas(centro, (-r * 0.9, 0)), r, r * 0.8, lz_, tonos=(0, 1, 2))
        h.elipse(mas(centro, (r * 0.9, 0)), r, r * 0.8, lz_, tonos=(0, 1, 2))
        h.elipse(centro, r * 0.45, r * 0.45, lz_, tonos=(1, 2, 2))

    # ---- esquirlas de porcelana al romperse ---------------------------------------------------
    def parte_esquirlas(self, lz, c, pose):
        k = pose.extra.get('esquirlas')
        if not k:
            return []
        P = self.paleta
        p = lz.parte()
        base = (0, 0)
        for j, (dx, dy) in enumerate(((-9, -1), (-5, -3), (7, -1), (11, -2), (2, -4), (-13, -2), (14, -1))):
            if j >= k * 2 + 2:
                break
            p.pon_m(mas(base, (dx, dy)), P['piel'], 3 if j % 2 else 2)
            if j % 3 == 0:
                p.pon_m(mas(base, (dx + 1, dy)), P['piel'], 1)
        return [(p, 'contorno', 0)]

    def post(self, lz, c, pose):
        ch = pose.extra.get('chispas')
        if ch is not None:
            L, cen = self._L(c)
            motas(lz, cen, self.paleta['luz'], ch, pts=((-10, -6), (9, -12), (12, 2), (-12, 6), (4, -18), (-5, -15)),
                  tono=(0, 2))


def lerp(a, b, t):
    return a + (b - a) * t


PERSONAJE = Muneca()
VARIANTES_KIT, cuadro_variante, revision_variantes = kit_variantes(PERSONAJE, ['1', '2', '3', '4'])
FONDO = ('nivel-06-cdmx', 'xochimilco', 300)

BASE = Pose(tronco=2, cabeza=0, hombro_c=8, codo_c=10, hombro_l=-6, codo_l=8,
            muslo_c=4, rodilla_c=2, pie_c=0, muslo_l=-4, rodilla_l=2, pie_l=0, mano_c='abierta', mano_l='abierta')


def animaciones():
    B = BASE
    A = animaciones_humanas(B, lean_correr=10)
    # Reposo: inmóvil… y de pronto la cabeza se ladea a tirones (inquietante).
    A['reposo'] = Anim([B, B, B.con(cabeza=8), B.con(cabeza=14), B.con(cabeza=14, cara='parpadeo'), B.con(cabeza=6)],
                       4, True)
    # Caminar / correr: los del rig con la falda que vuela un poco.
    A['caminar'] = Anim([p.con(cabeza=(i % 4 == 1) * 4, extra={'vuelo': 1, 'fase': i}) for i, p in
                         enumerate(A['caminar'].poses)], 10, True)
    A['correr'] = Anim([p.con(mano_c='garra', mano_l='garra', extra={'vuelo': 3, 'fase': i}) for i, p in
                        enumerate(A['correr'].poses)], 14, True)
    # Ataque (arañazo): brazo atrás, zarpazo al frente, recupera.
    k0 = B.con(tronco=-6, cabeza=-6, hombro_c=150, codo_c=40, hombro_l=-30, codo_l=30, muslo_c=14, muslo_l=-12,
               mano_c='garra', cara='grito')
    k1 = B.con(tronco=16, cabeza=4, hombro_c=90, codo_c=0, hombro_l=-40, codo_l=20, muslo_c=24, rodilla_c=20,
               muslo_l=-20, mano_c='garra', cara='grito', extra={'vuelo': 2})
    k2 = B.con(tronco=10, hombro_c=50, codo_c=30, hombro_l=-20, codo_l=20, muslo_c=18, rodilla_c=12, muslo_l=-14,
               mano_c='garra')
    A['ataque'] = Anim([k0, k1, k1, k2], 12, False)
    A['disparar'] = Anim([k1, k2], 10, False)
    # Golpe (prepara el salto): se agacha con la cabeza ladeada.
    A['golpe'] = Anim([B.con(tronco=24, cabeza=16, muslo_c=50, rodilla_c=90, muslo_l=30, rodilla_l=90, hombro_c=-30,
                             codo_c=20, hombro_l=-40, codo_l=20, hunde=1, mano_c='garra', mano_l='garra'),
                       B.con(tronco=30, cabeza=20, muslo_c=56, rodilla_c=100, muslo_l=36, rodilla_l=100, hombro_c=-40,
                             codo_c=20, hombro_l=-50, codo_l=20, hunde=1.5, mano_c='garra', mano_l='garra',
                             cara='grito')], 8, False)
    # Salto (abalanzarse): brazos al frente, piernas recogidas, falda al viento.
    sal = B.con(tronco=20, cabeza=-4, hombro_c=96, codo_c=6, hombro_l=84, codo_l=10, muslo_c=50, rodilla_c=90,
                pie_c=-20, muslo_l=30, rodilla_l=100, pie_l=-30, mano_c='garra', mano_l='garra', cara='grito',
                extra={'vuelo': 4, 'falda_dy': -1})
    A['salto'] = Anim([sal, sal.con(hombro_c=100, extra={'vuelo': 5, 'falda_dy': -1, 'fase': 1})], 8, False)
    A['subida'] = A['salto']
    # Aturdido / agotado: la cabeza da vueltas sobre el cuello.
    atu = B.con(tronco=10, hombro_c=10, codo_c=10, hombro_l=-10, codo_l=10, muslo_c=8, rodilla_c=10, muslo_l=-6)
    A['aturdido'] = Anim([atu.con(cabeza=a, cara='dolor' if i % 2 else 'parpadeo') for i, a in
                          enumerate((-14, 4, 16, 4))], 5, True)
    ago = B.con(tronco=30, cabeza=26, muslo_c=20, rodilla_c=110, pie_c=-60, muslo_l=6, rodilla_l=110, pie_l=-70,
                hombro_c=-6, codo_c=10, hombro_l=-10, codo_l=10)
    A['agotado'] = Anim([ago, ago.con(cabeza=30, cara='parpadeo'), ago.con(cabeza=24), ago.con(cabeza=30)], 3, True)
    # Daño: se agrieta.
    A['dano'] = Anim([p.con(extra={'grieta': 1}) for p in A['dano'].poses], 8, False)
    # Purificar: el ojo se apaga, queda quieta con luz cálida.
    pur = B.con(cabeza=-6, hombro_c=20, codo_c=10, hombro_l=10, codo_l=10, cara='calma')
    A['purificar'] = Anim([pur.con(extra={'chispas': k, 'libre': k > 0}) for k in range(4)], 5, False)
    # Morir: se agrieta, salta la cabeza y se desarma; las piezas quedan en el suelo junto al cuerpo sentado.
    sentada = B.con(tronco=40, cabeza=0, muslo_c=86, rodilla_c=4, pie_c=10, muslo_l=80, rodilla_l=10, pie_l=10,
                    hombro_c=-10, codo_c=10, hombro_l=-20, codo_l=10, extra={'libre': 1, 'grieta': 2})
    A['morir'] = Anim([
        B.con(tronco=-10, cabeza=-12, hombro_c=-20, codo_c=30, hombro_l=-30, codo_l=30, cara='grito',
              extra={'grieta': 1}),
        B.con(tronco=-4, cabeza=-20, hombro_c=40, codo_c=20, hombro_l=-50, codo_l=20, cara='dolor',
              extra={'grieta': 2, 'piezas': {'cabeza': (-1, -5, -25)}}),
        B.con(tronco=14, hombro_c=60, codo_c=10, hombro_l=-60, codo_l=10, muslo_c=30, rodilla_c=50, muslo_l=10,
              rodilla_l=50, extra={'libre': 1, 'grieta': 2, 'esquirlas': 1,
                                   'piezas': {'cabeza': (-8, -8, -70), 'brazo_c': (6, -3, 40)}}),
        sentada.con(extra={'esquirlas': 2, 'piezas': {'cabeza_suelo': (-17, -100), 'brazo_suelo': (22, 100)}}),
        sentada.con(extra={'esquirlas': 3, 'piezas': {'cabeza_suelo': (-19, -95), 'brazo_suelo': (23, 96)}}),
    ], 9, False)
    return A
