"""Bruja Guajolote / Tlahuelpuchi en forma HUMANA (jefa del Nivel 4, Oaxaca, ~106 px).

Diseño de la hoja Codex `bruja.png`: mujer descarnada de piel oliva, cara de cráneo de ave (hueso rosado, pico
ganchudo, cuenca roja), melena y manto de plumas negras con reflejo violáceo, vestido de trapo andrajoso con
flecos de pluma, brazos largos con plumas colgando como alas, dedos larguísimos con uñas y patas de ave.
Su magia es el fuego fatuo verde-azul (el mismo color de sus proyectiles en el juego). Flota (el juego la eleva).

Purificar / morir (sello completo): el fuego se apaga, las plumas se caen y queda una mujer inconsciente:
la cara de cráneo se vuelve un rostro humano en paz. Sin violencia gráfica.

Todo el cuerpo es procedural (cápsulas, polígonos y plumas en el espacio del mundo: giran sin deformarse) con
detalles píxel a píxel (ojo, pico, costillas, uñas)."""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas  # noqa: E402
from humanoide import Humanoide  # noqa: E402
from anim_humano import animaciones_humanas  # noqa: E402
from personajes._jefes1 import chispas, deshilachar, garra_larga, humo, llama, pluma, _h  # noqa: E402

PAL = Paleta([
    Material('pluma',  ['#0e0c12', '#1a1720', '#29242f', '#3d3646'],              '#0e0c12'),
    Material('piel',   ['#2a2a1c', '#454430', '#625e40', '#837a54'],              '#16140e'),
    Material('trapo',  ['#2a2218', '#3e3322', '#574a32'],                         '#16140e'),
    Material('hueso',  ['#6e4a42', '#a8806e', '#d4b09a', '#f0dccb'],              '#3a2220'),
    Material('rojo',   ['#5a1018', '#a02428', '#e0483c'],                         '#3a2220'),
    Material('fatuo',  ['#127a66', '#3ad0a8', '#9dffe0', '#eafff8'],              '#127a66'),
    Material('una',    ['#7a6a48', '#c8b48c', '#efe6cc'],                         '#16140e'),
    Material('humana', ['#5a3424', '#8a5838', '#b07a52'],                         '#3a2220'),
])

ANCLAS = {'o': (0, 0), 'barriga': (0, -10), 'pecho': (1, -19), 'hombro_c': (1, -27), 'hombro_l': (-3, -27),
          'cuello': (2, -31), 'nuca': (-2, -30)}
_TORSO = Mapa(['.'], {}, PAL, dict(ANCLAS))


def manchas(capa, mat, semilla=0, dens=23):
    """Textura de trapo viejo: motas y rasgaduras cortas de tono vecino (solo dentro de la parte)."""
    m = capa.mascara() & (capa.mat == mat)
    ys, xs = m.nonzero()
    for y, x in zip(ys, xs):
        hh = _h(x // 2, y // 3, semilla) % dens
        if hh == 0 and capa.ton[y, x] > 0:
            capa.ton[y, x] -= 1
            if x + 1 < capa.w and m[y, x + 1]:
                capa.ton[y, x + 1] = max(0, capa.ton[y, x + 1] - 1)
        elif hh == 1 and capa.ton[y, x] < 2:
            capa.ton[y, x] += 1


def _ang(v) -> float:
    """Ángulo (convención dir_ang) de un vector."""
    return math.degrees(math.atan2(v[0], v[1]))


def _uni(a, b):
    v = (b[0] - a[0], b[1] - a[1])
    L = math.hypot(*v) or 1.0
    return (v[0] / L, v[1] / L)


class BrujaGuajolote(Humanoide):
    id = 'bruja_guajolote'
    tipo = 'humanoide'
    fw, fh = 128, 136
    pivote = (64, 132)
    alto = 106
    L_muslo, L_pierna, L_pie, alto_tobillo = 21, 21, 12, 4
    L_brazo, L_ante = 17, 16
    sep_cadera = (1.5, -1.5)
    torso_cizalla_max = 0.0
    paleta = PAL

    def torso_mapa(self, pose):
        return _TORSO

    def orden(self, pose):
        o = ['manto', 'brazo_l', 'pierna_l', 'torso', 'pierna_c', 'falda', 'cabeza', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    def purificada(self, pose) -> bool:
        return bool(pose.extra.get('purificado'))

    # ---- ejes del torso ------------------------------------------------------------------------
    def ejes(self, c):
        cad = c['cadera_torso']
        cue = c['torso'].punto('cuello')
        u = _uni(cad, cue)              # hacia arriba por la columna
        f = (-u[1], u[0])               # hacia adelante
        return u, f

    # ---- piernas: flacas, rodilla huesuda, pata de ave ------------------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        pi = P['piel']
        r = math.radians(p['ang_pie'])
        fwd = (math.cos(r), -math.sin(r))
        down = (math.sin(r), math.cos(r))
        planta = mas(p['tobillo'], down, self.alto_tobillo * 0.6)
        # dedos: tres al frente abiertos en abanico y uno atrás; uñas curvas
        for k, (abre, L) in enumerate(((-16, 8.0), (2, 9.5), (18, 7.5))):
            a = math.radians(p['ang_pie'] - abre)
            dd = (math.cos(a), -math.sin(a))
            nud = mas(planta, dd, L * 0.55)
            tip = mas(planta, dd, L)
            capa.capsula(planta, nud, 1.6, 1.3, pi, tonos=(1, 2, 3))
            capa.capsula(nud, tip, 1.3, 0.9, pi, tonos=(0, 1, 2) if k == 0 else (1, 2, 3))
            capa.pon_m(mas(tip, dd, 1.0), P['una'], 1)
            capa.pon_m(mas(mas(tip, dd, 1.6), down, 1.0), P['una'], 2)
        atras = mas(planta, fwd, -3.5)
        capa.capsula(planta, atras, 1.4, 1.0, pi, tonos=(0, 1, 2))
        capa.pon_m(mas(atras, down, 1.0), P['una'], 1)
        # tarso escamoso, pantorrilla y muslo
        capa.capsula(p['rodilla'], p['tobillo'], 2.5, 1.7, pi, tonos=(1, 2, 3),
                     pliegues=[(0.55, 1), (0.7, 1), (0.85, 1)])
        capa.capsula(p['cadera'], p['rodilla'], 3.8, 2.7, pi, tonos=(1, 2, 3))
        capa.elipse(p['rodilla'], 2.6, 2.4, pi, tonos=(2, 3, 3))

    # ---- brazos: largos, con plumas colgando como alas ----------------------------------------------
    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        pi, pl = P['piel'], P['pluma']
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        if mano.startswith('sena_'):
            mano = 'abierta'
        if mano not in ('garra', 'abierta', 'puno'):
            mano = 'garra'
        if not self.purificada(pose) or pose.extra.get('plumas_brazo', False):
            # plumas que cuelgan del brazo y del antebrazo (en el mundo: siempre hacia abajo y atrás)
            sopla = pose.extra.get('viento', 0)
            for i, t in enumerate((0.15, 0.45, 0.8)):
                base = mas(b['hombro'], _uni(b['hombro'], b['codo']), self.L_brazo * t)
                pluma(capa, base, -28 - i * 4 - sopla, 9 + i, 2.3, pl, tonos=(0, 1, 2), raquis=2, curva=-8)
            for i, t in enumerate((0.1, 0.4, 0.7)):
                base = mas(b['codo'], _uni(b['codo'], b['muneca']), self.L_ante * t)
                pluma(capa, base, -18 - i * 6 - sopla, 10 - i * 1.5, 2.2, pl, tonos=(0, 1, 2), raquis=2, curva=-10)
        capa.capsula(b['codo'], b['muneca'], 2.2, 1.6, pi, tonos=(1, 2, 3))
        capa.capsula(b['hombro'], b['codo'], 2.8, 2.2, pi, tonos=(1, 2, 3))
        capa.elipse(b['codo'], 2.1, 2.1, pi, tonos=(2, 3, 3))
        garra_larga(capa, P, b, mano, tam=1.25, largo_una=2)

    # ---- manto de plumas en la espalda ------------------------------------------------------------
    def parte_manto(self, lz, c, pose):
        if pose.extra.get('sin_manto'):
            return []
        P = self.paleta
        p = lz.parte()
        u, f = self.ejes(c)
        cad = c['cadera_torso']
        cue = c['torso'].punto('nuca')
        sopla = pose.extra.get('viento', 0)
        eriza = pose.extra.get('eriza', 0)          # 0 = caído, 1 = erizado (amenaza)
        caidas = pose.extra.get('caidas', 0)        # plumas que ya se cayeron (purificar)
        base_ang = _ang((-f[0], -f[1]))             # hacia atrás
        abajo = _ang((-u[0], -u[1]))                # hacia abajo por la columna
        n = 9
        for i in range(n):
            if caidas and (_h(i, 5) % 9) < caidas:
                continue
            t = i / (n - 1)
            base = mas(mas(cue, u, -t * 24), f, -2.5 - 1.5 * math.sin(t * math.pi))
            # arriba apuntan atrás-arriba, abajo cuelgan
            a = base_ang + (1 - t) * 40 - t * 30
            a = a + (abajo - a) * (0.45 * t) - eriza * 30 * (1 - t * 0.5) - sopla * 0.6
            a += ((_h(i, 3) % 11) - 5)
            L = 13 + 6 * math.sin(t * math.pi) + eriza * 5 + (_h(i) % 4)
            pluma(p, base, a, L, 3.0, P['pluma'], tonos=(0, 1, 2), raquis=2 if i % 2 else 3, curva=-12 + eriza * 10)
        return [(p, 'contorno', 0)]

    # ---- torso: pecho descarnado, vestido de trapo ----------------------------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        p = lz.parte()
        tor = c['torso']
        cad = c['cadera_torso']
        pi, tr = P['piel'], P['trapo']
        bar, pec, cue = tor.punto('barriga'), tor.punto('pecho'), tor.punto('cuello')
        u, f = self.ejes(c)
        p.capsula(cad, bar, 6.0, 5.6, pi, tonos=(1, 2, 3))
        p.capsula(bar, pec, 5.6, 6.8, pi, tonos=(1, 2, 3))
        p.capsula(pec, cue, 6.6, 3.6, pi, tonos=(1, 2, 3))
        # costillas y clavícula (lado iluminado, adelante)
        for k in range(3):
            a = mas(mas(pec, u, 1.5 - k * 2.2), f, 1.5)
            p.linea(a, mas(a, f, 3.6 - k * 0.6), pi, 1)
        p.linea(mas(cue, u, -2.5), mas(mas(cue, u, -1.5), f, 4), pi, 3)
        # vestido: del pecho a la cadera, con tirante sobre el hombro
        v = lz.parte()
        v.capsula(mas(cad, u, -1), mas(pec, u, -1.5), 6.8, 6.6, tr, tonos=(0, 1, 2),
                  pliegues=[(0.3, 0), (0.62, 0)])
        v.poligono([mas(mas(pec, u, -2), f, -6), mas(mas(pec, u, -2), f, 3), mas(mas(cue, u, -1.5), f, -1),
                    mas(mas(cue, u, -1), f, -4)], tr, sombreado=(0, 1, 2), ks=1)
        manchas(v, tr, semilla=2)
        # escote andrajoso: picos del trapo sobre el pecho
        for k in range(3):
            a = mas(mas(pec, u, -1.5), f, -2 + k * 2.4)
            v.linea(a, mas(a, u, 2 + (k % 2)), tr, 1)
        # cinturón de cordón con nudo
        v.linea(mas(mas(cad, u, 3), f, -6.5), mas(mas(cad, u, 3.6), f, 6.5), P['pluma'], 2)
        v.pon_m(mas(mas(cad, u, 3.2), f, 5), P['hueso'], 2, fijo=True)
        c['ejes'] = (u, f)
        return [(p, 'contorno', 0), (v, 'contorno', 0)]

    # ---- falda andrajosa con flecos de pluma -------------------------------------------------------
    def parte_falda(self, lz, c, pose):
        P = self.paleta
        tr, pl = P['trapo'], P['pluma']
        u, f = self.ejes(c)
        cad = c['cadera_torso']
        pc, pll = c['pierna_c'], c['pierna_l']
        rods = [pc['rodilla'], pll['rodilla']]
        sopla = pose.extra.get('viento', 0) * 0.15
        largo = pose.extra.get('falda', 1.0)
        # punto más adelantado / atrasado de las rodillas (en el eje f)
        def proy(q):
            return (q[0] - cad[0]) * f[0] + (q[1] - cad[1]) * f[1]
        adel = max(rods, key=proy)
        atr = min(rods, key=proy)
        abajo = (0, 1)
        top_b = mas(mas(cad, u, 7), f, -6.4)
        top_f = mas(mas(cad, u, 7), f, 6.0)
        cin_b = mas(mas(cad, u, 1), f, -7.4)
        cin_f = mas(mas(cad, u, 1), f, 7.2)
        hem_f = mas(mas(adel, f, 6.0 + sopla * 2), abajo, 9 * largo)
        hem_b = mas(mas(atr, f, -7.5 - sopla * 5), abajo, 7 * largo)
        mid = ((hem_f[0] + hem_b[0]) / 2, max(hem_f[1], hem_b[1]) + 3 * largo)
        p = lz.parte()
        p.poligono([top_b, top_f, cin_f, mas(cin_f, f, 1.0), hem_f, mid, hem_b, cin_b], tr,
                   sombreado=(0, 1, 2), ks=2)
        # pliegues verticales
        for k, t in enumerate((0.3, 0.55, 0.8)):
            a = (top_b[0] + (top_f[0] - top_b[0]) * t, top_b[1] + (top_f[1] - top_b[1]) * t + 3)
            bq = (hem_b[0] + (hem_f[0] - hem_b[0]) * t, (hem_b[1] + (hem_f[1] - hem_b[1]) * t) - 3)
            p.linea(a, bq, tr, 0 if k != 1 else 2)
        # parches / remiendos (detalle)
        q = mas(mas(cad, u, -4), f, 1)
        p.pon_m(q, tr, 2)
        p.pon_m(mas(q, (1, 0)), tr, 2)
        p.pon_m(mas(q, (0, 1)), tr, 0)
        manchas(p, tr, semilla=7)
        deshilachar(p, semilla=3, prof=5, ancho=3)
        # flecos de pluma colgando del dobladillo
        fr = lz.parte()
        for k in range(5):
            t = (k + 0.5) / 5
            b = (hem_b[0] + (hem_f[0] - hem_b[0]) * t, hem_b[1] + (hem_f[1] - hem_b[1]) * t - 4)
            pluma(fr, b, -8 + k * 5 - sopla * 30, 7 + (k % 2) * 3, 1.8, pl, tonos=(0, 1, 2), raquis=2)
        return [(fr, 'contorno', 0), (p, 'contorno', 0, 1)]

    # ---- cabeza: cráneo de guajolote con melena de plumas -------------------------------------------
    def parte_cabeza(self, lz, c, pose):
        P = self.paleta
        hu, pl, ro = P['hueso'], P['pluma'], P['rojo']
        cue = c['cuello']
        u, f = c.get('ejes', self.ejes(c))
        ang = math.radians(pose.cabeza + pose.giro + pose.tronco * 0.35)
        R = ((math.cos(ang), -math.sin(ang)), (math.sin(ang), math.cos(ang)))
        cen = mas(cue, (5 + pose.extra.get('cab_dx', 0), -8 + pose.extra.get('cab_dy', 0)))

        K = 1.3

        def L(dx, dy):
            dx, dy = dx * K, dy * K
            return cen[0] + R[0][0] * dx + R[0][1] * dy, cen[1] + R[1][0] * dx + R[1][1] * dy

        def A(a):   # ángulo local → mundo
            return a - math.degrees(ang)

        eriza = pose.extra.get('eriza', 0)
        sopla = pose.extra.get('viento', 0)
        purif = self.purificada(pose)
        capas = []
        # 1) melena trasera (plumas largas que salen de la nuca hacia arriba y atrás)
        m = lz.parte()
        cuello = lz.parte()
        cuello.capsula(cue, L(-2, 3), 3.0, 3.4, P['piel'], tonos=(1, 2, 3))
        if purif:
            # cabello largo y negro que cae por la espalda
            m.capsula(L(-1, -3), L(-6, 8), 6.0, 4.0, pl, tonos=(1, 2, 3))
            m.capsula(L(-6, 8), mas(L(-8, 18), (0, 0)), 4.0, 2.5, pl, tonos=(1, 2, 3))
        else:
            n = 10
            for i in range(n):
                t = i / (n - 1)
                base = L(-2 - 3.5 * t, -5 + 9 * t)
                a = A(200 + 70 * t) - eriza * 18 * (1 - t) - sopla * 0.5
                a += ((_h(i, 11) % 9) - 4)
                Lp = 14 + 8 * math.sin(t * math.pi * 0.8) + eriza * 6 + (_h(i, 2) % 4)
                pluma(m, base, a, Lp, 3.0, pl, tonos=(0, 1, 2), raquis=2 if i % 3 else 3, curva=-10 + eriza * 6)
        capas += [(m, 'contorno', 0), (cuello, 'contorno', 0)]
        # 2) cráneo / rostro
        s = lz.parte()
        if purif:
            hm = P['humana']
            s.elipse(L(0.5, 0), 6.2 * K, 6.6 * K, hm, tonos=(0, 1, 2))
            s.capsula(L(4, 1), L(6.5, 2.5), 1.6 * K, 1.2 * K, hm, tonos=(1, 2, 2))       # nariz
            s.capsula(L(1, 4.5), L(4.5, 5.5), 2.2 * K, 1.8 * K, hm, tonos=(0, 1, 2))     # mentón
            # cabello sobre la frente
            s.poligono([L(-6, -4), L(0, -7.5), L(5, -5), L(3, -3.5), L(-1, -3), L(-5, 2)], pl, sombreado=(1, 2, 3), ks=1)
        else:
            s.elipse(L(-0.5, 0), 6.8 * K, 6.0 * K, hu, tonos=(1, 2, 3))
            s.capsula(L(3, -1), L(9, 0.5), 3.6 * K, 2.6 * K, hu, tonos=(1, 2, 3))
            # pico superior ganchudo
            s.poligono([L(7.5, -2.8), L(12.5, -1.2), L(14.6, 1.6), L(14.0, 5.2), L(12.6, 3.4), L(8, 2.6)], hu,
                       sombreado=(1, 2, 3), ks=1)
            boca = pose.extra.get('boca', 0)
            if pose.cara == 'grito':
                boca = max(boca, 3)
            if pose.cara == 'dolor':
                boca = max(boca, 2)
            # mandíbula (pico inferior): gira hacia abajo al abrir
            ab = math.radians(boca * 7)
            def J(dx, dy):
                x, y = dx - 3, dy - 3
                return L(3 + x * math.cos(ab) - y * math.sin(ab), 3 + x * math.sin(ab) + y * math.cos(ab))
            if boca:
                s.poligono([L(3, 2.5), L(12.5, 3.4), J(11, 4.5), J(4, 5.5)], ro, sombreado=(0, 1, 1), ks=1)
            s.poligono([J(3.5, 3.4), J(11.8, 3.8), J(10.5, 5.6), J(5, 6.6)], hu, sombreado=(0, 1, 2), ks=1)
        capas.append((s, 'contorno', 0, 1))
        # 3) detalles sin línea interior: ojo, fosa nasal, grietas del hueso
        g = lz.parte()
        if purif:
            ex, ey = g.a_px(L(2.5, -1.2))
            g.pon(ex, ey, P['humana'], 0, fijo=True)
            g.pon(ex + 1, ey, P['humana'], 0, fijo=True)
            g.pon(ex - 1, ey - 1, P['pluma'], 1, fijo=True)
            g.pon_m(L(4.5, 4.2), P['rojo'], 0, fijo=True)
        else:
            ex, ey = g.a_px(L(2.2, -1.6))
            cerrado = pose.cara in ('parpadeo', 'dolor')
            brillo = pose.extra.get('brillo', 1)
            for dx in (-1, 0, 1, 2):
                for dy in (-1, 0, 1):
                    if abs(dx - 0.5) + abs(dy) > 2:
                        continue
                    g.pon(ex + dx, ey + dy, ro, 0, fijo=True)
            g.pon(ex - 1, ey - 2, hu, 0, fijo=True)
            g.pon(ex, ey - 2, hu, 0, fijo=True)
            g.pon(ex + 1, ey - 2, hu, 0, fijo=True)
            if cerrado:
                g.pon(ex, ey, ro, 1, fijo=True)
                g.pon(ex + 1, ey, ro, 1, fijo=True)
            else:
                fa = P['fatuo']
                g.pon(ex, ey, fa, 2 if brillo < 2 else 3, fijo=True)
                g.pon(ex + 1, ey, fa, 3 if brillo else 1, fijo=True)
                g.pon(ex, ey + 1 if brillo else ey, ro, 1, fijo=True)
                if brillo >= 2:
                    g.pon(ex + 2, ey - 1, fa, 1, fx=True)
                    g.pon(ex + 3, ey - 1, fa, 0, fx=True)
            g.pon_m(L(10.5, -0.6), hu, 0, fijo=True)                     # fosa nasal
            g.linea(L(-4, -3), L(-1.5, -5), hu, 1)                       # sutura del cráneo
            g.linea(L(-2.5, 2.5), L(2.5, 3), hu, 1)                     # pómulo
            g.pon_m(L(13.4, 3.6), hu, 3, fijo=True)                      # brillo de la punta del pico
        capas.append((g, None, 0))
        # 4) cresta frontal de plumas cortas y gola sobre el cuello
        if not purif:
            fr = lz.parte()
            for i in range(4):
                pluma(fr, L(-1 + i * 1.6, -5 + i * 0.3), A(196 + i * 9) - eriza * 10, 7 - i + eriza * 3, 1.8, pl,
                      tonos=(1, 2, 3), raquis=3)
            for i in range(4):
                b0 = mas(cue, (-2 + i * 1.6, -1 + i * 0.6))
                pluma(fr, b0, -30 + i * 14 - sopla * 0.3, 7 + (i % 2) * 2, 2.2, pl, tonos=(0, 1, 2), raquis=2)
            capas.append((fr, 'contorno', 0))
        c['cabeza_centro'] = cen
        c['ojo'] = L(2.2, -1.6)
        return capas

    # ---- efectos: fuego fatuo en las manos, chispas, plumas que caen, humo ---------------------------
    def retoques(self, lz, c, pose):
        P = self.paleta
        fa = P['fatuo']
        ex = pose.extra
        k = int(ex.get('k', 0))
        for lado in ('c', 'l'):
            tam = ex.get('llama_' + lado, 0)
            if tam:
                b = c['brazo_' + lado]
                d = dir_ang(b['ang_ante'])
                cen = mas(b['muneca'], d, 4.5)
                llama(lz, mas(cen, (0, 2)), 6 + tam * 4, 1.6 + tam * 1.1, fa, fase=k + (lado == 'l') * 3)
        if ex.get('bola'):
            # esfera de fuego fatuo entre las manos (se arma en el conjuro)
            a, b = c['brazo_c']['muneca'], c['brazo_l']['muneca']
            cen = ((a[0] + b[0]) / 2 + 5, (a[1] + b[1]) / 2 - 1)
            r = ex['bola']
            x0, y0 = lz.a_px(cen)
            R = int(math.ceil(r))
            for yy in range(-R, R + 1):
                for xx in range(-R, R + 1):
                    dd = (xx * xx + yy * yy) / max(r * r, 0.5)
                    if dd > 1:
                        continue
                    tn = 3 if dd < 0.25 else (2 if dd < 0.6 else 1)
                    if dd > 0.8 and (xx + yy + k) % 2:
                        tn = 0
                    lz.pon(x0 + xx, y0 + yy, fa, tn, fx=True)
            llama(lz, mas(cen, (0, -r + 1)), 3 + r, 1.2 + r * 0.3, fa, fase=k)
        if ex.get('chispas') is not None:
            cen = c.get('cabeza_centro', (0, -80))
            chispas(lz, mas(cen, (0, 14)), fa, int(ex['chispas']), radio=24, n=14, tonos=(1, 3))
            chispas(lz, mas(cen, (2, 10)), fa, int(ex['chispas']) + 2, radio=15, n=8, tonos=(2, 3))
        if ex.get('humo') is not None:
            cen = c.get('cabeza_centro', (0, -80))
            humo(lz, mas(cen, (-8, -10)), int(ex['humo']), P['pluma'], n=6, radio=4.5, abre=8, sube=5, tonos=(2, 3, 3))
        if ex.get('mareo') is not None:
            # destellos de fuego fatuo apagado girando sobre la cabeza (ventana de vulnerabilidad)
            cen = c.get('cabeza_centro', (0, -80))
            kk = int(ex['mareo'])
            for j in range(3):
                a = (j / 3 + kk / 4) * 2 * math.pi
                x, y = lz.a_px((cen[0] + math.cos(a) * 9, cen[1] - 13 + math.sin(a) * 3))
                lz.pon(x, y, fa, 3 if j == 0 else 1, fx=True)
                for ex2, ey2 in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if j == 0 and lz.mat[y + ey2, x + ex2] < 0:
                        lz.pon(x + ex2, y + ey2, fa, 0, fx=True)
        # plumas que se desprenden y caen (purificar / morir / daño)
        sueltas = ex.get('sueltas')
        if sueltas is not None:
            cen = c.get('cabeza_centro', (0, -80))
            for j in range(5):
                hx = (_h(j, 21) % 50) - 25
                hy = (_h(j, 22) % 30) - 5 + sueltas * 7
                a = (_h(j, 23) % 120) - 60 + sueltas * 25
                pluma(lz, (cen[0] + hx, cen[1] + hy), a, 6, 1.6, P['pluma'], tonos=(1, 2, 3), raquis=3)
        if ex.get('luz') is not None:
            # luz cálida de la liberación: anillo de destellos dorados-verdes alrededor del cuerpo
            cen = c.get('cabeza_centro', (0, -80))
            chispas(lz, mas(cen, (-2, 30)), P['fatuo'], int(ex['luz']), radio=26, n=12, tonos=(2, 3), sube=2.5)


B = Pose(tronco=10, cabeza=-4, hombro_c=16, codo_c=44, hombro_l=-6, codo_l=40,
         muslo_c=10, rodilla_c=18, pie_c=-14, muslo_l=-4, rodilla_l=22, pie_l=-22,
         mano_c='garra', mano_l='garra')

CAMINAR = [(22, 8, 6), (14, 16, 0), (2, 10, 0), (-10, 8, -6), (-20, 18, -26), (-8, 44, -28), (12, 44, -8), (22, 20, 4)]


def animaciones():
    A = animaciones_humanas(B, paso=0.9, lean_correr=26)
    # Reposo (flota): respira, las plumas se mecen, los dedos se mueven, el ojo late.
    A['reposo'] = Anim([
        B.con(extra={'viento': 0, 'k': 0}),
        B.con(hunde=0.6, hombro_c=18, codo_c=46, extra={'viento': 3, 'k': 1}),
        B.con(hunde=1.2, hombro_c=19, codo_c=50, hombro_l=-4, cabeza=-2, extra={'viento': 6, 'k': 2, 'brillo': 2}),
        B.con(hunde=1.0, hombro_c=18, codo_c=46, extra={'viento': 4, 'k': 3}),
        B.con(hunde=0.4, cabeza=-5, extra={'viento': 1, 'k': 4}),
        B.con(cara='parpadeo', extra={'viento': -1, 'k': 5}),
    ], 5, True)
    # Caminar: acecho encorvado, garras por delante.
    cam = []
    for i in range(8):
        a = CAMINAR[i]
        b = CAMINAR[(i + 4) % 8]
        s = -math.sin(i / 8 * 2 * math.pi + 0.35)
        cam.append(B.con(tronco=18, cabeza=-8 + 2 * s, muslo_c=a[0], rodilla_c=a[1], pie_c=a[2], muslo_l=b[0],
                         rodilla_l=b[1], pie_l=b[2], hombro_c=30 + 16 * s, codo_c=50 + max(0, 14 * s),
                         hombro_l=16 - 16 * s, codo_l=48 + max(0, -14 * s), hunde=0.6 if i % 4 in (1, 2) else 0,
                         extra={'viento': 4 + 3 * s, 'k': i}))
    A['caminar'] = Anim(cam, 9, True)
    # Correr: se lanza con los brazos atrás como alas, plumas erizadas.
    cor = []
    for i, p in enumerate(A['correr'].poses):
        s = -math.sin(i / 8 * 2 * math.pi + 0.5)
        cor.append(p.con(tronco=30, cabeza=-14, hombro_c=-70 + 12 * s, codo_c=20, hombro_l=-80 - 12 * s, codo_l=16,
                         mano_c='abierta', mano_l='abierta', extra={'viento': 14 + 4 * s, 'eriza': 0.5, 'k': i}))
    A['correr'] = Anim(cor, 13, True)
    # Golpe (anticipación del zarpazo): se encoge, alza las garras, eriza la melena y abre el pico.
    g0 = B.con(tronco=-8, cabeza=-14, hombro_c=150, codo_c=50, hombro_l=130, codo_l=40, muslo_c=26, rodilla_c=44,
               pie_c=0, muslo_l=-24, rodilla_l=30, pie_l=-6, cara='grito', extra={'eriza': 0.7, 'viento': -4, 'boca': 3, 'brillo': 2})
    g1 = g0.con(tronco=-12, hombro_c=168, hombro_l=150, hunde=1, extra={'eriza': 1.0, 'boca': 4})
    A['golpe'] = Anim([g0, g1], 6, False)
    # Ataque: zarpazo doble hacia adelante y abajo, se recupera.
    a2 = B.con(tronco=34, cabeza=6, hombro_c=70, codo_c=4, hombro_l=50, codo_l=10, muslo_c=30, rodilla_c=30,
               muslo_l=-22, rodilla_l=26, mano_c='abierta', mano_l='abierta',
               extra={'eriza': 0.6, 'viento': 12, 'boca': 4})
    a3 = B.con(tronco=40, cabeza=10, hombro_c=30, codo_c=30, hombro_l=20, codo_l=30, muslo_c=30, rodilla_c=34,
               muslo_l=-22, rodilla_l=26, extra={'eriza': 0.3, 'viento': 8, 'boca': 2})
    A['ataque'] = Anim([g0, g1, a2, a3, a3.con(tronco=26, hombro_c=24, extra={'eriza': 0.1, 'boca': 0})], 10, False)
    # Conjuro (antes de teletransportarse o de lanzar): junta las manos y arma una esfera de fuego fatuo.
    cj = B.con(tronco=4, cabeza=-6, hombro_c=44, codo_c=64, hombro_l=36, codo_l=70, muslo_c=8, rodilla_c=16,
               muslo_l=-8, rodilla_l=20, mano_c='garra', mano_l='garra', brazo_l_delante=False)
    A['conjuro'] = Anim([
        cj.con(extra={'bola': 2.0, 'k': 0, 'viento': 2, 'chispas': 0}),
        cj.con(hombro_c=48, codo_c=60, hunde=0.5, extra={'bola': 3.5, 'k': 1, 'viento': 5, 'brillo': 2, 'chispas': 1}),
        cj.con(hombro_c=52, codo_c=56, hunde=1, cara='concentrado', extra={'bola': 5.0, 'k': 2, 'viento': 8, 'brillo': 2,
                                                                         'eriza': 0.3, 'chispas': 2}),
        cj.con(hombro_c=48, codo_c=60, hunde=0.5, extra={'bola': 4.2, 'k': 3, 'viento': 5, 'brillo': 2, 'eriza': 0.2,
                                                         'chispas': 3}),
    ], 7, True)
    # Lanzar (abanico de fuego fatuo): carga atrás, barre el brazo hacia adelante, remata.
    A['lanzar'] = Anim([
        B.con(tronco=-6, cabeza=-10, hombro_c=-60, codo_c=60, hombro_l=60, codo_l=40, muslo_c=4, rodilla_c=16,
              muslo_l=-14, rodilla_l=20, extra={'llama_c': 1.5, 'k': 0, 'viento': -4, 'eriza': 0.4}),
        B.con(tronco=-10, cabeza=-12, hombro_c=-80, codo_c=50, hombro_l=70, codo_l=30, hunde=1,
              extra={'llama_c': 2.2, 'k': 1, 'viento': -6, 'eriza': 0.6, 'brillo': 2}),
        B.con(tronco=24, cabeza=4, hombro_c=96, codo_c=0, hombro_l=-30, codo_l=30, muslo_c=26, rodilla_c=24,
              muslo_l=-18, rodilla_l=20, mano_c='abierta', cara='grito',
              extra={'llama_c': 1.0, 'k': 2, 'viento': 10, 'eriza': 0.5, 'boca': 4}),
        B.con(tronco=20, cabeza=2, hombro_c=70, codo_c=20, hombro_l=-20, codo_l=30, muslo_c=22, rodilla_c=22,
              muslo_l=-16, rodilla_l=20, mano_c='abierta', extra={'k': 3, 'viento': 6, 'eriza': 0.2, 'boca': 1}),
    ], 9, False)
    A['disparar'] = Anim(A['lanzar'].poses[1:], 10, False)
    # Invocar (entrada / transformación): brazos al cielo, melena erizada, llamas en ambas manos, chillido.
    iv = B.con(tronco=-6, cabeza=-18, hombro_c=104, codo_c=24, hombro_l=172, codo_l=20, muslo_c=10, rodilla_c=14,
               muslo_l=-10, rodilla_l=18, mano_c='abierta', mano_l='abierta', cara='grito')
    A['invocar'] = Anim([
        iv.con(extra={'llama_c': 1, 'llama_l': 1, 'k': 0, 'eriza': 0.7, 'boca': 3, 'chispas': 0, 'brillo': 2}),
        iv.con(hombro_c=112, hombro_l=178, hunde=1, extra={'llama_c': 2, 'llama_l': 1.5, 'k': 1, 'eriza': 1.0,
                                                        'boca': 4, 'chispas': 1, 'viento': 4, 'brillo': 2}),
        iv.con(hombro_c=110, hombro_l=176, extra={'llama_c': 2.5, 'llama_l': 2, 'k': 2, 'eriza': 1.0, 'boca': 4,
                                                  'chispas': 2, 'viento': 8, 'brillo': 2}),
        iv.con(hombro_c=102, hombro_l=170, hunde=0.5, extra={'llama_c': 2, 'llama_l': 2.5, 'k': 3, 'eriza': 0.8,
                                                            'boca': 3, 'chispas': 3, 'viento': 4, 'brillo': 2}),
    ], 7, True)
    # Daño: sacudida hacia atrás, plumas sueltas.
    A['dano'] = Anim([
        B.con(tronco=-16, cabeza=-22, hombro_c=-40, codo_c=40, hombro_l=-50, codo_l=40, muslo_c=14, rodilla_c=20,
              cara='dolor', extra={'eriza': 0.8, 'viento': -8, 'sueltas': 0}),
        B.con(tronco=-6, cabeza=-10, hombro_c=-20, codo_c=40, hombro_l=-26, codo_l=40, cara='dolor',
              extra={'eriza': 0.3, 'viento': -4, 'sueltas': 1}),
        B.con(tronco=4, cabeza=-6, hombro_c=6, codo_c=44, extra={'sueltas': 2}),
    ], 9, False)
    # Aturdido / agotado (ventana): encorvada, cabeza colgando, ojo apagado, humo que sube.
    at = B.con(tronco=38, cabeza=24, hombro_c=10, codo_c=14, hombro_l=4, codo_l=12, muslo_c=20, rodilla_c=40,
               pie_c=-30, muslo_l=2, rodilla_l=42, pie_l=-36, mano_c='abierta', mano_l='abierta',
               extra={'brillo': 0, 'viento': -2})
    A['aturdido'] = Anim([at.con(extra={'mareo': 0}), at.con(cabeza=30, hunde=1, extra={'mareo': 1, 'cab_dx': 1}),
                          at.con(cabeza=26, cara='parpadeo', extra={'mareo': 2}),
                          at.con(cabeza=18, extra={'mareo': 3, 'cab_dx': -1})], 5, True)
    A['agotado'] = A['aturdido']
    # Purificar: el fuego se apaga, se cae el manto de plumas y aparece el rostro de la mujer.
    ar = B.con(tronco=20, cabeza=10, hombro_c=30, codo_c=40, hombro_l=20, codo_l=40, muslo_c=60, rodilla_c=120,
               pie_c=-60, muslo_l=30, rodilla_l=124, pie_l=-70, mano_c='abierta', mano_l='abierta')
    A['purificar'] = Anim([
        ar.con(extra={'humo': 0, 'brillo': 2, 'luz': 0}),
        ar.con(cabeza=4, extra={'humo': 1, 'brillo': 0, 'sueltas': 0, 'caidas': 3, 'luz': 1}),
        ar.con(cabeza=-2, tronco=12, extra={'humo': 2, 'sueltas': 1, 'caidas': 6, 'purificado': 1, 'luz': 2,
                                            'sin_manto': 0}),
        ar.con(cabeza=-6, tronco=8, cara='parpadeo', extra={'sueltas': 2, 'caidas': 9, 'purificado': 1, 'luz': 3}),
    ], 4, False)
    # Morir (sello completo en el juego: queda una mujer inconsciente, liberada).
    A['morir'] = Anim([
        A['dano'].poses[0],
        ar.con(extra={'humo': 0, 'brillo': 0, 'sueltas': 0, 'caidas': 4}),
        ar.con(tronco=50, cabeza=26, extra={'humo': 1, 'sueltas': 1, 'caidas': 8, 'purificado': 1}),
        B.con(giro=90, tronco=0, cabeza=4, hombro_c=20, codo_c=30, hombro_l=-10, codo_l=20, muslo_c=14, rodilla_c=30,
              muslo_l=4, rodilla_l=40, pie_c=-10, pie_l=-10, mano_c='abierta', mano_l='abierta', cara='parpadeo',
              extra={'purificado': 1, 'sin_manto': 1, 'humo': 2, 'sueltas': 2}),
        B.con(giro=90, tronco=0, cabeza=4, hombro_c=20, codo_c=30, hombro_l=-10, codo_l=20, muslo_c=14, rodilla_c=30,
              muslo_l=4, rodilla_l=40, pie_c=-10, pie_l=-10, mano_c='abierta', mano_l='abierta', cara='parpadeo',
              extra={'purificado': 1, 'sin_manto': 1}),
    ], 5, False)
    # Esquivar: salto hacia atrás con las plumas abiertas (no rueda: flota).
    A['esquivar'] = Anim([
        B.con(tronco=24, muslo_c=40, rodilla_c=70, muslo_l=10, rodilla_l=60, hombro_c=-60, hombro_l=-70, hunde=2,
              extra={'eriza': 0.5, 'viento': 8}),
        B.con(tronco=-14, dx=-4, muslo_c=30, rodilla_c=60, pie_c=-40, muslo_l=0, rodilla_l=50, pie_l=-50,
              hombro_c=120, codo_c=20, hombro_l=110, codo_l=20, mano_c='abierta', mano_l='abierta',
              extra={'eriza': 1.0, 'viento': -10, 'alzar': 6}),
        B.con(tronco=4, dx=-6, extra={'eriza': 0.3, 'viento': -4}),
    ], 12, False)
    # Interactuar: alarga la mano con los dedos abiertos.
    A['interactuar'] = Anim([B.con(tronco=16, hombro_c=60, codo_c=30, mano_c='abierta'),
                             B.con(tronco=20, hombro_c=80, codo_c=10, mano_c='abierta', hunde=1)], 5, False)
    # Salto / caída: el manto se levanta.
    A['subida'] = Anim([p.con(extra={'eriza': 0.4, 'viento': -6}) for p in A['subida'].poses], 8, False)
    A['salto'] = A['subida']
    A['caida'] = Anim([p.con(extra={'eriza': 0.6, 'viento': 6}) for p in A['caida'].poses], 6, False)
    return A


PERSONAJE = BrujaGuajolote()
