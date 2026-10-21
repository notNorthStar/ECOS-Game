"""Don Ernesto, el Apostador (minijefe, Guadalajara): hacendado viejo y corpulento que apostó su alma. Sombrero
ancho de paja con cinta verde oscuro, melena y barba grises y revueltas, ceño fruncido, camisa crema de manga
larga, chaleco gris verdoso con bolsillos, pantalón café, botas oscuras. Más grande que un humano (≈111 px con el
sombrero, como su kit de Codex) y "monstruoso": espalda encorvada, manos enormes y ojos de brasa.

Lleva un BASTÓN (el juego tiene su "bastón ardiente": `golpe` = lo alza y se enciende, `ataque` = lo descarga),
`lanzar` = lanza cartas, `conjuro` = la ruleta (brazos arriba mirando al cielo), `invocar` = fuego infernal
(abre los brazos, brasas), `aturdido`/`agotado` = de rodillas, `purificar` = se calma (ojos sin brasa, luz dorada).

Casi todo se dibuja con primitivas sombreadas en el espacio del mundo (como el Chaneque Mayor) y los detalles
(ojos, botones, bolsillos, paja del sombrero) píxel a píxel.

Medidas: cuadro 160×128, pivote (80, 124), ~111 px de alto con el sombrero (su kit de Codex: 111 px a escala 1)."""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import animaciones_humanas  # noqa: E402
from personajes._humanoides import HumanoideX, chispas, lerp_p  # noqa: E402

OSC_C = '#2a1c10'   # contorno cálido
OSC_F = '#1a1a1e'   # contorno frío
PAL = Paleta([
    Material('sombrero', ['#4a3418', '#7a5a2c', '#a8844a', '#d0aa66'], OSC_C),
    Material('cinta',    ['#22301c', '#3e5630'],                       OSC_F),
    Material('pelo',     ['#46444a', '#6e6c70', '#9c9a9c', '#cac8c4'], OSC_F),
    Material('piel',     ['#5a3222', '#9a6046', '#c88866', '#e8ae88'], OSC_C),
    Material('camisa',   ['#9a9078', '#d4c8a8', '#f2e8cc'],            OSC_C),
    Material('chaleco',  ['#2c3432', '#45504c', '#63706a'],            OSC_F),
    Material('pantalon', ['#3a2a1a', '#5a4228', '#7c5e3a'],            OSC_C),
    Material('bota',     ['#26201e', '#3c3432'],                       OSC_F),
    Material('fuego',    ['#a02a0a', '#f0601a', '#ffb83a', '#fff0a0'], '#a02a0a'),
])

ANCLAS = {'o': (0, 0), 'barriga': (1, -11), 'pecho': (0, -21), 'cuello': (2, -30), 'hombro_c': (2, -27),
          'hombro_l': (-4, -27)}
_TORSO = Mapa(['.'], {}, PAL, dict(ANCLAS))


def _rot(deg: float) -> np.ndarray:
    a = math.radians(deg)
    return np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]])


class DonErnesto(HumanoideX):
    id = 'don_ernesto'
    tipo = 'humanoide'
    fw, fh = 160, 128
    pivote = (80, 124)
    alto = 111
    L_muslo, L_pierna, L_pie, alto_tobillo = 19, 18, 13, 5
    L_brazo, L_ante = 17, 15
    sep_cadera = (3.0, -3.0)
    torso_cizalla_max = 0.0
    paleta = PAL

    def torso_mapa(self, pose):
        return _TORSO

    def cabeza_mapa(self, pose):
        return _TORSO

    def orden(self, pose):
        o = ['brazo_l', 'pierna_l', 'pierna_c', 'torso', 'cabeza', 'baston', 'brazo_c', 'cartas']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    # ---- piernas: pantalón ancho, botas grandes --------------------------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        bo, pa = P['bota'], P['pantalon']
        r = math.radians(p['ang_pie'])
        fwd = (math.cos(r), -math.sin(r))
        down = (math.sin(r), math.cos(r))
        planta = mas(p['tobillo'], down, self.alto_tobillo - 1.5)
        capa.capsula(mas(planta, fwd, -3), mas(planta, fwd, self.L_pie - 4.5), 3.4, 3.0, bo, tonos=(0, 1, 1))
        capa.linea(mas(mas(planta, fwd, -3.5), down, 2.6), mas(mas(planta, fwd, self.L_pie - 3.5), down, 2.4), bo, 0)
        capa.capsula(mas(p['tobillo'], down, -2), mas(p['tobillo'], down, 2), 3.6, 3.4, bo, tonos=(0, 1, 1))
        tob = mas(p['tobillo'], dir_ang(p['ang_pierna']), 2.5)
        capa.capsula(p['rodilla'], tob, 5.0, 4.8, pa, tonos=(0, 1, 2), redondo_b=False, pliegues=[(0.6, 0)])
        capa.capsula(p['cadera'], p['rodilla'], 6.4, 5.2, pa, tonos=(0, 1, 2), pliegues=[(0.9, 0)])

    # ---- brazos: mangas crema anchas, manos enormes -------------------------------------------
    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        dibujar_mano(capa, P, b, 'abierta' if mano.startswith('sena') else mano, tam=2.1)
        ca = P['camisa']
        capa.capsula(b['codo'], b['muneca'], 4.2, 3.6, ca, tonos=(0, 1, 2), redondo_b=False,
                     bandas=[(0.84, 1.1, ca, (0, 1, 1))], pliegues=[(0.4, 0)])
        capa.capsula(b['hombro'], b['codo'], 5.2, 4.3, ca, tonos=(0, 1, 2), pliegues=[(0.6, 0)])

    # ---- torso por código: barriga, chaleco con bolsillos --------------------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        p = lz.parte()
        tor = c['torso']
        cad = c['cadera_torso']
        bar, pec, cue = tor.punto('barriga'), tor.punto('pecho'), tor.punto('cuello')
        u = (pec[0] - cad[0], pec[1] - cad[1])
        L = math.hypot(*u) or 1
        u = (u[0] / L, u[1] / L)
        n = (-u[1], u[0])   # perpendicular hacia ADELANTE (con u = (0, -1), n = (1, 0))

        def Q(base, du, dn):
            return base[0] + u[0] * du + n[0] * dn, base[1] + u[1] * du + n[1] * dn

        pa, ca, ch = P['pantalon'], P['camisa'], P['chaleco']
        # caderas (pantalón) y barriga/pecho (camisa)
        p.capsula(bar, pec, 11.0, 11.5, ca, tonos=(0, 1, 2))
        p.capsula(pec, Q(cue, -1, -1), 11.5, 8.0, ca, tonos=(0, 1, 2))
        p.elipse(Q(bar, 0, 4), 8.6, 8.4, ca, tonos=(0, 1, 2))   # panza
        p.capsula(Q(cad, 0, 0), Q(cad, 5, 0.5), 10.5, 11.2, pa, tonos=(0, 1, 2))   # caderas (pantalón)
        c['eje_torso'] = (u, n)
        # chaleco: todo el torso menos la franja del frente (se ve la camisa)
        v = lz.parte()
        pts = [Q(cad, 3, -11.8), Q(bar, 0, -13.0), Q(pec, 0, -12.8), Q(cue, -2, -9), Q(cue, 0, -4), Q(cue, -1, 3),
               Q(pec, 2, 8.0), Q(bar, 0, 9.5), Q(cad, 5, 10.5), Q(cad, 2.0, 7.5), Q(cad, 3.0, -2)]
        v.poligono(pts, ch, sombreado=(0, 1, 2), ks=2, kl=1)
        m = v.mascara()
        # bolsillos (ribete oscuro y su luz) y botones a lo largo del borde
        for base, w in ((Q(bar, -2, 2.5), 5), (Q(pec, -1, 1.5), 4)):
            a = base
            b = Q(base, 0, w)
            v.linea(a, b, ch, 0)
            v.linea(Q(a, -1, 0), Q(b, -1, 0), ch, 2)
        for k in range(4):
            bt = lerp_p(Q(pec, 1, 6.8), Q(cad, 7, 7.8), k / 3)
            v.pon_m(bt, ch, 0, fijo=True)
            v.pon_m(mas(bt, (-1, -1)), ch, 2, fijo=True)
        # pliegue de la espalda (joroba)
        v.linea(Q(pec, 2, -10), Q(bar, -2, -11), ch, 0)
        # cuello de la camisa
        p.capsula(Q(cue, -1, -2), Q(cue, 1, 3), 3.2, 2.8, ca, tonos=(1, 2, 2))
        return [(p, 'contorno', 0), (v, 'contorno', 0, 1)]

    # ---- cabeza por código: cara, nariz, barba y melena revuelta, sombrero ancho ----------------
    def parte_cabeza(self, lz, c, pose):
        P = self.paleta
        pi, pe, so, ci = P['piel'], P['pelo'], P['sombrero'], P['cinta']
        cue = c['cuello']
        R = _rot(pose.cabeza + pose.giro + c.get('tronco_ext', pose.tronco) * 0.5)
        K = 1.32   # cabeza grande (como en su hoja de Codex)
        cen = mas(cue, (5 * K + pose.extra.get('cab_dx', 0), -10 * K))

        def L(dx, dy):
            v = R @ np.array([dx * K, dy * K])
            return cen[0] + v[0], cen[1] + v[1]

        # 1) melena de atrás y cara
        h = lz.parte()
        for (dx, dy, rx, ry) in ((-7, 0, 5.5, 6.5), (-8, 5, 4.5, 4.5), (-5, 7, 4.0, 3.5), (-9, -4, 3.5, 4.0)):
            h.elipse(L(dx, dy), rx * K, ry * K, pe, tonos=(0, 1, 2))
        for k in range(5):   # mechones sueltos
            a = L(-8 - k * 0.6, -3 + k * 2.4)
            h.capsula(a, L(-12 - (k % 2), -1 + k * 2.8), 1.4 * K, 0.6 * K, pe, tonos=(0, 1, 2))
        f = lz.parte()
        f.elipse(L(1, 0), 7.6 * K, 8.2 * K, pi, tonos=(1, 2, 3))
        f.elipse(L(-2.5, 1), 2.0 * K, 3.0 * K, pi, tonos=(1, 2, 2))          # oreja
        f.capsula(L(6.5, -1), L(9, 2.2), 2.0 * K, 2.5 * K, pi, tonos=(1, 2, 3))   # nariz gruesa
        # 2) barba y bigote
        b = lz.parte()
        b.poligono([L(-4, 3), L(1, 4.5), L(5, 5.5), L(9.5, 6), L(9, 9), L(6, 12), L(1, 12.5), L(-3, 10), L(-5, 6)],
                    pe, sombreado=(1, 2, 3), ks=2, kl=1)
        b.capsula(L(4.5, 4.4), L(10, 5.0), 1.4 * K, 1.1 * K, pe, tonos=(1, 2, 3))
        for k in range(4):   # mechas de la barba
            b.linea(L(0 + k * 2, 7 + (k % 2)), L(-1 + k * 2, 11.5), pe, 1)
        boca = pose.extra.get('boca', 1 if pose.cara in ('grito',) else 0)
        if boca:
            for k in range(int(boca) + 1):
                b.linea(L(5, 7.5 + k * 0.8), L(8.5, 7.5 + k * 0.8), pi, 0)
            b.pon_m(L(6, 7.5), P['camisa'], 2, fijo=True)
        # 3) detalles: ceja gruesa fruncida, ojo de brasa, arrugas
        d = lz.parte()
        calmo = pose.extra.get('calmo') or pose.cara == 'calmo'
        if calmo:
            d.linea(L(2, -4.5), L(7, -4.0), pe, 2, fijo=True)
            d.linea(L(2, -3.5), L(7, -3.2), pe, 1, fijo=True)
        else:
            d.linea(L(1.5, -5.5), L(7.5, -2.8), pe, 2, fijo=True)
            d.linea(L(1.5, -4.5), L(7.0, -2.0), pe, 1, fijo=True)
        ex, ey = d.a_px(L(5.0, -0.8))
        if pose.cara in ('parpadeo', 'dolor'):
            for dx in (-1, 0, 1):
                d.pon(ex + dx, ey, pi, 0, fijo=True)
        elif calmo:
            d.pon(ex, ey, pe, 0, fijo=True)
            d.pon(ex - 1, ey, P['camisa'], 2, fijo=True)
        else:
            d.pon(ex, ey, P['fuego'], 3, fijo=True)
            d.pon(ex - 1, ey, P['fuego'], 1, fijo=True)
            d.pon(ex, ey + 1, P['fuego'], 0, fijo=True)
        d.linea(L(3, 1.5), L(5.5, 1.8), pi, 1)       # ojera
        d.linea(L(-0.5, -2), L(0.5, 1), pi, 1)       # arruga de la sien
        # 4) sombrero: copa con abolladura, cinta verde, ala muy ancha (sigue a la cabeza)
        s = lz.parte()
        inclin = pose.extra.get('sombrero', 0)
        RS = _rot(pose.cabeza + pose.giro + inclin + c.get('tronco_ext', pose.tronco) * 0.5)

        def S(dx, dy):
            v = RS @ np.array([dx * K, dy * K])
            return cen[0] + v[0], cen[1] + v[1]

        s.poligono([S(-8, -6), S(9, -6), S(8, -13), S(5, -16.5), S(1.5, -15), S(-2, -16.5), S(-6.5, -14)], so,
                   sombreado=(1, 2, 3), ks=2, kl=1)
        # tejido de paja: puntos alternos un tono más oscuro
        mk = s.mascara()
        ys, xs = np.nonzero(mk)
        for y, x in zip(ys, xs):
            if (x * 2 + y) % 5 == 0 and s.ton[y, x] > 1:
                s.ton[y, x] -= 1
        s.poligono([S(-8.2, -6), S(9.2, -6), S(9.0, -8.6), S(-8.0, -8.6)], ci, sombreado=(0, 1, 1), ks=1)
        # ala: elipse plana, el frente cae un poco
        a = lz.parte()
        cen_ala = S(1.5, -5.5)
        for i in range(-24, 26):
            t = i / 25.0
            grosor = 3.2 * (1 - t * t) + 1.0
            caida = 2.2 * max(0, t) ** 2 + 1.4 * max(0, -t) ** 2
            p0 = mas(cen_ala, tuple(RS @ np.array([i, -grosor * 0.55 + caida])))
            p1 = mas(cen_ala, tuple(RS @ np.array([i, grosor * 0.45 + caida])))
            a.linea(p0, p1, so, 3 if i < -5 else 2)
            a.pon_m(p1, so, 1)
        ma = a.mascara()
        ys, xs = np.nonzero(ma)
        for y, x in zip(ys, xs):
            if (x + y * 3) % 4 == 0 and a.ton[y, x] >= 2:
                a.ton[y, x] -= 1
        c['cabeza_centro'] = cen
        return [(h, 'contorno', 0), (f, 'contorno', 0), (b, 'contorno', 0, 1), (d, None, 0), (s, 'contorno', 0, 1),
                (a, 'contorno', 0, 1)]

    # ---- bastón (y su fuego) ---------------------------------------------------------------------
    def parte_baston(self, lz, c, pose):
        P = self.paleta
        p = lz.parte()
        w = c['brazo_c']['muneca']
        d = dir_ang(c['brazo_c']['ang_ante'])
        mano = mas(w, d, 3.2)
        ang = math.radians(pose.extra.get('baston', 8) + pose.giro)
        up = (math.sin(ang), -math.cos(ang))
        largo = pose.extra.get('baston_l', 41)
        top = mas(mano, up, 4)
        punta = mas(mano, up, -largo)
        p.capsula(punta, top, 1.3, 1.5, P['pantalon'], tonos=(0, 1, 2), sombra=-0.3)
        p.elipse(mas(top, up, 1.5), 2.3, 2.3, P['sombrero'], tonos=(2, 3, 3))   # empuñadura dorada
        p.capsula(punta, mas(punta, up, 2), 1.5, 1.5, P['sombrero'], tonos=(1, 2, 2))
        c['punta_baston'] = punta
        c['eje_baston'] = (mano, punta)
        return [(p, 'contorno', 0)]

    def parte_cartas(self, lz, c, pose):
        n = pose.extra.get('cartas', 0)
        if not n:
            return []
        P = self.paleta
        p = lz.parte()
        w = c['brazo_l']['muneca'] if pose.extra.get('cartas_mano', 'l') == 'l' else c['brazo_c']['muneca']
        for k in range(n):
            a = math.radians(-30 + k * 22)
            R = _rot(math.degrees(a))
            cx, cy = w[0] + 3 + k * 1.2, w[1] - 4

            def C(dx, dy):
                v = R @ np.array([dx, dy])
                return cx + v[0], cy + v[1]
            p.poligono([C(-2.2, -3.5), C(2.2, -3.5), C(2.2, 3.5), C(-2.2, 3.5)], P['camisa'], ton=2)
            p.pon_m(C(0, 0), P['fuego'], 0, fijo=True)
            p.pon_m(C(-1, -2), P['fuego'], 0, fijo=True)
        return [(p, 'contorno', 0)]

    # ---- efectos ----------------------------------------------------------------------------------
    def retoques(self, lz, c, pose):
        P = self.paleta
        fu = P['fuego']
        k = pose.extra.get('fuego')
        fase = int(pose.extra.get('fase', 0))
        if k and 'eje_baston' in c:
            mano, punta = c['eje_baston']
            # llamas a lo largo del último tercio del bastón: lenguas que suben (en el mundo)
            for i in range(9):
                t = 0.45 + 0.55 * i / 8
                b = lerp_p(mano, punta, t)
                alto = (3 + ((i * 7 + fase * 3) % 5)) * (0.7 + 0.3 * k)
                for j in range(int(alto) + 1):
                    tt = j / max(alto, 1)
                    x = b[0] + math.sin(j * 0.9 + i + fase) * 1.2 * tt
                    y = b[1] - j
                    px, py = lz.a_px((x, y))
                    if not lz.dentro(px, py) or (lz.mat[py, px] >= 0 and not lz.fx[py, px]):
                        continue
                    tono = 3 if tt < 0.25 else (2 if tt < 0.55 else (1 if tt < 0.85 else 0))
                    if tt > 0.7 and (px + py) % 2:
                        continue
                    lz.pon(px, py, fu, tono, fx=True)
        ch = pose.extra.get('chispas')
        if ch is not None:
            mat = P['sombrero'] if pose.extra.get('calmo') else fu
            cen = c.get('cabeza_centro', (0, -90))
            pts = [(-24, -6), (20, -20), (26, 10), (-28, 20), (12, -34), (-14, -30), (30, -6), (-30, 2)]
            for j, (dx, dy) in enumerate(pts):
                if (j + ch) % 2 == 0:
                    x, y = lz.a_px((cen[0] + dx, cen[1] + dy - ch * 2 + 20))
                    if lz.dentro(x, y):
                        lz.pon(x, y, mat, 3, fx=True)
                        for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                            if lz.dentro(x + ex, y + ey) and lz.mat[y + ey, x + ex] < 0:
                                lz.pon(x + ex, y + ey, mat, 1, fx=True)


BASE = Pose(tronco=12, cabeza=-6, hombro_c=22, codo_c=34, hombro_l=-6, codo_l=22,
            muslo_c=8, rodilla_c=6, pie_c=0, muslo_l=-8, rodilla_l=4, pie_l=0, extra={'baston': 10})


def animaciones():
    A = animaciones_humanas(BASE, paso=0.8, lean_correr=18)
    B = BASE

    def ext(p, **kw):
        e = dict(p.extra)
        e.update(kw)
        return p.con(extra=e)

    # Reposo: respiración pesada, apoyado en el bastón.
    A['reposo'] = Anim([B, B.con(hunde=1), B.con(hunde=1.5, hombro_c=23, codo_c=36),
                        B.con(hunde=0.5, cara='parpadeo')], 3, True)
    # Caminar: pasos pesados; el bastón acompaña.
    A['caminar'] = Anim([ext(p.con(tronco=14, cabeza=-6, hombro_c=22 + (p.hombro_c - B.hombro_c) * 0.25,
                                   codo_c=34), baston=8 + 6 * math.sin(i / 8 * 2 * math.pi), fase=i)
                         for i, p in enumerate(A['caminar'].poses)], 8, True)
    A['correr'] = Anim([ext(p.con(cabeza=-8), baston=40, fase=i) for i, p in enumerate(A['correr'].poses)], 11, True)
    for k in ('subida', 'caida', 'aterrizar', 'esquivar'):
        A[k] = Anim([ext(p, baston=30) for p in A[k].poses], A[k].fps, A[k].loop)
    A['salto'] = A['subida']
    # Golpe (anticipación del bastón ardiente): lo alza por encima de la cabeza y se enciende.
    g0 = B.con(tronco=0, cabeza=-10, hombro_c=176, codo_c=18, hombro_l=-20, codo_l=30, muslo_c=14, rodilla_c=10,
               muslo_l=-12, cara='grito', extra={'baston': -120, 'baston_l': 34, 'fuego': 1, 'fase': 0})
    A['golpe'] = Anim([ext(B.con(tronco=4, hombro_c=150, codo_c=40, cara='grito'), baston=-90, baston_l=34),
                       g0, ext(g0.con(hombro_c=182, tronco=-4), fase=1, fuego=1.2),
                       ext(g0.con(hombro_c=180, tronco=-3, hunde=0.5), fase=2, fuego=1.3)], 7, False)
    # Ataque: descarga el bastón ardiente de arriba hacia adelante.
    s1 = B.con(tronco=26, cabeza=0, hombro_c=96, codo_c=4, hombro_l=-40, codo_l=30, muslo_c=32, rodilla_c=30,
               muslo_l=-22, rodilla_l=10, pie_l=-10, cara='grito', extra={'baston': -62, 'baston_l': 36, 'fuego': 1.4,
                                                                          'fase': 3})
    A['ataque'] = Anim([s1, ext(s1.con(hombro_c=80, tronco=30), baston=-42, fase=4, fuego=1),
                        ext(s1.con(hombro_c=60, tronco=24, cara='normal'), baston=-25, fase=5, fuego=0.6)], 10, False)
    # Lanzar: abanico de cartas en la mano lejana, lo arroja.
    l0 = B.con(tronco=4, hombro_l=150, codo_l=50, hombro_c=20, codo_c=30, brazo_l_delante=True, cabeza=-8,
               muslo_c=14, muslo_l=-10, mano_l='abierta', extra={'cartas': 3})
    l1 = B.con(tronco=20, hombro_l=96, codo_l=4, hombro_c=10, codo_c=30, brazo_l_delante=True, cara='grito',
               muslo_c=24, rodilla_c=16, muslo_l=-18, mano_l='abierta', extra={'cartas': 1})
    A['lanzar'] = Anim([l0, ext(l0.con(hombro_l=160, tronco=0), fase=1), l1, ext(l1.con(hombro_l=80), cartas=0)],
                       8, False)
    A['disparar'] = A['lanzar']
    # Conjuro (la ruleta): brazos al cielo, mira hacia arriba (la ruleta gira sobre su cabeza).
    ru = B.con(tronco=-4, cabeza=-16, hombro_c=26, codo_c=34, hombro_l=168, codo_l=16, mano_l='abierta',
               muslo_c=12, muslo_l=-10, cara='grito', extra={'baston': 12, 'sombrero': -6})
    A['conjuro'] = Anim([ext(ru, chispas=i, fase=i) for i in range(4)], 6, True)
    # Invocar (fuego infernal / entrada): abre los brazos, se yergue, brasas alrededor.
    iv = B.con(tronco=0, cabeza=-10, hombro_c=62, codo_c=-4, hombro_l=-70, codo_l=10, mano_c='abierta',
               mano_l='abierta', muslo_c=18, rodilla_c=10, muslo_l=-16, cara='grito', extra={'baston': 60, 'fuego': 0.8})
    A['invocar'] = Anim([ext(iv, chispas=0, fase=0), ext(iv.con(hombro_c=66, hombro_l=-76, hunde=1), chispas=1, fase=1),
                         ext(iv.con(hombro_c=64), chispas=2, fase=2), ext(iv.con(hunde=1), chispas=3, fase=3)], 6, True)
    # Aturdido / agotado: de rodillas, una mano en el suelo, el sombrero ladeado.
    at = B.con(tronco=40, cabeza=10, hombro_c=50, codo_c=10, hombro_l=20, codo_l=10, muslo_c=50, rodilla_c=120,
               pie_c=-50, muslo_l=10, rodilla_l=110, pie_l=-60, hunde=2, mano_c='abierta', cara='parpadeo',
               extra={'baston': 80, 'sombrero': 12})
    A['aturdido'] = Anim([at, at.con(tronco=42, cabeza=14), at.con(cara='dolor'), at.con(tronco=38, cabeza=8)], 4, True)
    A['agotado'] = A['aturdido']
    # Purificar: arrodillado mira hacia arriba, los ojos sin brasa, luz dorada.
    pu = at.con(tronco=16, cabeza=-14, hombro_c=30, codo_c=20, cara='calmo', extra={'calmo': 1, 'sombrero': -4})
    A['purificar'] = Anim([ext(pu, chispas=i, fase=i) for i in range(4)], 4, False)
    A['dano'] = Anim([ext(p.con(cara='dolor'), baston=-10) for p in A['dano'].poses], 8, False)
    A['interactuar'] = Anim([B.con(hombro_l=60, codo_l=20, brazo_l_delante=True),
                             B.con(hombro_l=74, codo_l=10, brazo_l_delante=True, tronco=16)], 4, False)
    # Morir: cae de rodillas y se desploma (luego el juego disuelve su sombra); sin violencia.
    m = A['morir'].poses
    A['morir'] = Anim([ext(m[0], baston=-20), ext(m[1], baston=40), ext(at, cara='dolor'),
                       ext(m[3].con(cara='calmo'), baston=80, sombrero=30, calmo=1),
                       ext(m[4].con(cara='calmo'), baston=-10, sombrero=60, calmo=1)], 6, False)
    return A


PERSONAJE = DonErnesto()
