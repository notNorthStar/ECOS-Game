"""Tzitzimitl (subjefa del Nivel 10, Guadalajara, ~105 px con la cabellera): deidad-esqueleto estelar del eclipse,
estilizada a la mexica: cráneo con ojos rojos encendidos y orejera redonda, cabellera alborotada morado-noche
salpicada de estrellas, costillar y huesos gris-lila, garras en manos y pies, falda de estrellas (cueitl granate con
cenefa de hueso y estrellas) y macana de obsidiana con bola de púas.

Diseño Codex (tzitzimime.png) con más detalle. Sin gore: solo hueso limpio. Al purificarse los ojos y las estrellas
se vuelven dorados; al caer se derrumba de rodillas y se deshace en polvo de estrellas."""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas, previo  # noqa: E402
from personajes._jefes2 import (Jefe, anillo, animaciones_jefe, chispa, curva, dentado, hueso, mano_hueso,  # noqa: E402
                                pie_hueso, trazo)

PAL = Paleta([
    Material('hueso',   ['#3e3446', '#6e6280', '#a49ab2', '#d6cee2'],  '#1c1424'),
    Material('pelo',    ['#0e0918', '#1c1330', '#2e2048', '#463266'],  '#08050e'),
    Material('falda',   ['#2a0e18', '#4a1a28', '#6e2a3a', '#94404e'],  '#14060c'),
    Material('obsid',   ['#140e1a', '#2a1a3a', '#4a3266', '#b080ff'],  '#08050e'),
    Material('estrella', ['#8a6ae0', '#c8b0ff', '#fff4c0'],            '#4a3266'),
    Material('ojo',     ['#8a1020', '#ff5060', '#ffc0b0'],             '#4a0810'),
])

# ---------------------------------------------------------------------------------------------------
# Cráneo (mirando a la derecha): cuencas grandes con brasa roja, orejera redonda de obsidiana con estrella.
# ---------------------------------------------------------------------------------------------------
LEY_CRANEO = {
    'a': ('hueso', 0), 'b': ('hueso', 1), 'c': ('hueso', 2), 'd': ('hueso', 3),
    'x': ('pelo', 0, 'f'), 'n': ('pelo', 0, 'f'), 'q': ('pelo', 1, 'f'), 't': ('hueso', 3, 'f'),
    'r': ('ojo', 1, 'f'), 'R': ('ojo', 2, 'f'), 'e': ('ojo', 0, 'f'),
    'o': ('obsid', 1), 'O': ('obsid', 2), 's': ('estrella', 2, 'f'),
}
CRANEO = """
    ....bccddc....
    ..bcccdddddc..
    .bccccddddddc.
    abcccccdddddd.
    abcccccddxxxdc
    abcccccdxxrRxd
    aabcoOcdxerxxd
    aabbOobbcxxxdc
    .aabbobbcccddc
    ..aabbbcccnccb
    ...aabbcccnncb
    ....abtttttttb
    .....qtqtqtqb.
    .....aabbbbbb.
"""
ANCLAS_CRANEO = {'cuello': (4, 13), 'nuca': (2, 4), 'frente': (11, 3), 'ojo': (10, 5), 'coronilla': (7, 0)}


def _var(base, filas):
    ls = [l.strip() for l in base.strip('\n').split('\n')]
    for i, f in filas.items():
        if i >= len(ls):
            ls.append(f)
        else:
            ls[i] = f
    return '\n'.join(ls)


CRANEOS = {
    'normal': CRANEO,
    'parpadeo': _var(CRANEO, {5: 'abcccccdxxxxxd', 6: 'aabcoOcdxxxxxd'}),
    'dolor': _var(CRANEO, {4: 'abcccccddddxdc', 5: 'abcccccdxxxrxd', 6: 'aabcoOcdxxexxd'}),
    'grito': _var(CRANEO, {12: '.....qqqqqqqqb', 13: '.....qtqtqtqtb', 14: '......aabbbbbb'}),
}


def _craneo(cara, boca):
    if boca >= 2 and cara != 'parpadeo':
        base = CRANEOS['grito']
        if cara == 'dolor':
            base = _var(base, {4: 'abcccccddddxdc', 5: 'abcccccdxxxrxd'})
    else:
        base = CRANEOS.get(cara, CRANEO)
    return Mapa.de_texto(base, LEY_CRANEO, PAL, ANCLAS_CRANEO)


class Tzitzimitl(Jefe):
    id = 'tzitzimitl'
    fw, fh = 168, 140
    pivote = (84, 137)
    alto = 105
    L_muslo, L_pierna, L_pie, alto_tobillo = 21, 21, 10, 3
    L_brazo, L_ante = 16, 15
    sep_cadera = (1.5, -1.5)
    ANCLAS = {'o': (0, 0), 'barriga': (0, -9), 'pecho': (1, -17), 'cuello': (2, -27), 'hombro_c': (0, -24),
              'hombro_l': (-3, -24)}
    paleta = PAL
    humo = ('obsid', (2, 1))

    def orden(self, pose):
        o = ['pelo', 'baston_l', 'brazo_l', 'pierna_l', 'pierna_c', 'torso', 'falda', 'cabeza', 'brazo_c', 'baston_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    def _cab(self, c, pose):
        if 'cab_est' not in c:
            m = _craneo(pose.cara, int(pose.extra.get('boca', 0)))
            c['cab_mapa'] = m
            c['cab_est'] = previo(m, c['cuello'], c['M_cabeza'], 'cuello')
        return c['cab_est']

    def _eje(self, c):
        tor = c['torso']
        bar, pec = tor.punto('barriga'), tor.punto('pecho')
        u = (pec[0] - bar[0], pec[1] - bar[1])
        L = math.hypot(*u) or 1
        u = (u[0] / L, u[1] / L)
        return u, (-u[1], u[0])

    # ---- cabellera alborotada con estrellas --------------------------------------------------------
    def parte_pelo(self, lz, c, pose):
        P = self.paleta
        pe = P['pelo']
        est = self._cab(c, pose)
        v = float(pose.extra.get('viento', 0))
        f = float(pose.extra.get('fase', 0)) * 0.8
        nuca = est.punto('nuca')
        sy = self.suelo_y(c)
        top = est.punto('coronilla')
        p = lz.parte()
        q = lz.parte()
        # mechones: de la frente/coronilla salen hacia arriba y atrás (erizados); de la nuca caen a la espalda
        # mechones: de la coronilla salen erizados hacia arriba-atrás; de la nuca caen largos por la espalda
        mech = [(top, 1, -1, 172, 14, 30), (top, -1, -1, 192, 20, 40), (top, -3, 0, 210, 24, 50),
                (nuca, 1, -3, 228, 30, 70), (nuca, 0, -1, 244, 36, 80), (nuca, -1, 1, 258, 42, 80),
                (nuca, 0, 3, 272, 46, 70), (nuca, 1, 5, 286, 44, 56), (nuca, 2, 7, 300, 38, 44),
                (nuca, 2, 9, 316, 30, 30), (top, 3, -1, 160, 10, 20), (nuca, -2, -2, 236, 28, 30)]
        for k, (r, dx, dy, ang, L, giro) in enumerate(mech):
            a = ang + 10 * v
            g = giro * (1 - 0.3 * min(2, abs(v)))
            pts = self.pisar(curva(mas(r, (dx, dy)), a, L * (1 + 0.06 * abs(v)), g, 7, onda=6 + 3 * abs(v), fase=f + k * 1.1), sy)
            capa = q if k % 2 == 0 else p
            trazo(capa, pts, 2.9, 0.5, pe, tonos=(0, 1, 2) if capa is p else (1, 2, 3))
            if capa is q:
                for i in range(1, 3):
                    q.linea(mas(pts[i], (0.5, -0.6)), mas(pts[i + 1], (0.5, -0.6)), pe, 3)
            c.setdefault('puntas_pelo', []).append(pts[len(pts) // 2 + (k % 3) - 1])
        return [(p, 'contorno', 1), (q, 'contorno', 0)]

    # ---- macana de obsidiana: asta y bola de púas ---------------------------------------------------
    def _baston(self, lz, c, pose, lado):
        mano = 'c' if pose.extra.get('baston_mano', 'c') == 'c' else 'l'
        if lado != mano or pose.extra.get('sin_baston'):
            return []
        P = self.paleta
        ob = P['obsid']
        b = c['brazo_' + lado]
        w = mas(b['muneca'], dir_ang(b['ang_ante']), 1.5)
        modo = pose.extra.get('baston', 'vertical')
        if modo == 'vertical':
            ang = 180 + 4 * math.sin(float(pose.extra.get('fase', 0)) * 0.8)
        elif modo == 'sigue':
            ang = b['ang_ante']
        else:
            ang = float(modo)
        d = dir_ang(ang)
        abajo = mas(w, d, -18)
        arriba = mas(w, d, 22)
        p = lz.parte()
        p.capsula(abajo, arriba, 1.2, 1.2, ob, tonos=(1, 2, 2))
        # amarres de hueso
        for t in (-12, 8, 16):
            m = mas(w, d, t)
            p.capsula(mas(m, d, -0.3), mas(m, d, 0.3), 1.6, 1.6, P['falda'], tonos=(1, 2, 3))
        cab = mas(arriba, d, 3)
        p.elipse(cab, 3.8, 3.8, ob, tonos=(1, 2, 2))
        for k in range(6):
            a = ang + k * 60 + 30
            p.linea(mas(cab, dir_ang(a), 3.5), mas(cab, dir_ang(a), 5.6), ob, 2)
        p.pon_m(mas(cab, (-1.2, -1.4)), ob, 3, fijo=True)       # filo que brilla
        p.pon_m(mas(cab, (-0.2, -2.2)), ob, 3, fijo=True)
        c['baston_cab'] = cab
        return [(p, 'contorno', 0 if lado == 'c' else 1)]

    def parte_baston_c(self, lz, c, pose):
        return self._baston(lz, c, pose, 'c')

    def parte_baston_l(self, lz, c, pose):
        return self._baston(lz, c, pose, 'l')

    # ---- piernas y brazos de hueso con garras ------------------------------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        hu = P['hueso']
        pie_hueso(capa, p, hu)
        r = math.radians(p['ang_pie'])
        fwd = (math.cos(r), -math.sin(r))
        for k in range(3):   # garras de los pies
            capa.pon_m(mas(mas(p['punta'], fwd, 1.2), (math.sin(r), math.cos(r)), -0.8 + k * 0.9), P['obsid'], 2)
        hueso(capa, p['rodilla'], p['tobillo'], 1.8, 1.3, hu, nudo=2.3)
        hueso(capa, p['cadera'], p['rodilla'], 2.3, 1.8, hu, surco=False)
        # ajorca de estrellas en el tobillo (cascabeles)
        d = dir_ang(p['ang_pierna'])
        m = mas(p['rodilla'], d, self.L_pierna - 3)
        capa.capsula(mas(m, d, -0.6), mas(m, d, 0.6), 2.0, 2.0, P['falda'], tonos=(1, 2, 3))
        capa.pon_m(mas(m, (1.5, 0.5)), P['estrella'], 2, fijo=True)

    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        hu = P['hueso']
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        tiene = pose.extra.get('baston_mano', 'c') == lado and not pose.extra.get('sin_baston')
        tipo = 'puno' if tiene else ('garra' if mano in ('puno', 'garra') else mano)
        mano_hueso(capa, b, hu, tipo, tam=1.1, una=P['obsid'], una_t=2)
        hueso(capa, b['codo'], b['muneca'], 1.4, 1.1, hu)
        hueso(capa, b['hombro'], b['codo'], 1.8, 1.4, hu, nudo=0, surco=False)
        capa.elipse(b['codo'], 1.9, 1.9, hu, tonos=(1, 2, 3))
        # brazalete granate con estrella
        d = dir_ang(b['ang_brazo'])
        m = mas(b['hombro'], d, self.L_brazo * 0.45)
        capa.capsula(mas(m, d, -0.5), mas(m, d, 0.5), 2.0, 2.0, P['falda'], tonos=(1, 2, 3))
        capa.pon_m(mas(m, (0.5, 0)), P['estrella'], 1, fijo=True)

    # ---- torso: costillar, columna, pelvis; collar de estrellas ---------------------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        hu = P['hueso']
        tor = c['torso']
        cad = c['cadera_torso']
        bar, pec, cue = tor.punto('barriga'), tor.punto('pecho'), tor.punto('cuello')
        u, n = self._eje(c)
        p = lz.parte()
        # columna (atrás)
        col0, col1 = mas(cad, n, -2.5), mas(cue, n, -1.5)
        p.capsula(col0, col1, 1.8, 1.6, hu, tonos=(0, 1, 2))
        for k in range(8):
            t = (k + 0.5) / 8
            v = (col0[0] + (col1[0] - col0[0]) * t, col0[1] + (col1[1] - col0[1]) * t)
            p.pon_m(mas(v, n, -1), hu, 0)
        # pelvis
        p.elipse(mas(cad, u, 1.5), 5.2, 3.6, hu, tonos=(1, 2, 3))
        p.pon_m(mas(mas(cad, u, 1.5), n, 1), hu, 0)
        # costillar: caja redondeada con costillas (líneas claras) y huecos oscuros
        caja = mas(mas(pec, n, 1.0), u, -1)
        p.elipse(caja, 6.6, 8.0, hu, tonos=(0, 0, 1))
        # cintura delgada (vértebras visibles)
        p.capsula(mas(cad, u, 3), mas(bar, u, 1), 1.8, 2.0, hu, tonos=(1, 2, 3))
        g = lz.parte()
        # costillas: arcos claros de la columna al esternón, con el hueco oscuro entre ellos
        for k in range(5):
            y0 = mas(caja, u, 5.5 - k * 2.6)
            ancho = 6.2 - abs(k - 1.5) * 0.5
            pts = [mas(mas(y0, n, ancho * math.cos(t)), u, -1.8 * math.sin(t) * (1 if k < 4 else 0.6))
                   for t in [math.pi * (1 - j / 6) for j in range(7)]]
            for i in range(6):
                g.linea(pts[i], pts[i + 1], hu, 3 if i >= 3 else 2)
        g.linea(mas(mas(caja, n, 5.2), u, 6), mas(mas(caja, n, 5.0), u, -3), hu, 3)    # esternón
        # collar de estrellas (cuentas) al cuello
        for k in range(5):
            a = math.pi * (0.1 + 0.8 * k / 4)
            pt = mas(mas(cue, u, -3 - 2.5 * math.sin(a)), n, 4.5 * math.cos(a))
            g.pon_m(pt, P['estrella'], 2 if k % 2 else 1, fijo=True)
        return [(p, 'contorno', 0), (g, None, 0)]

    # ---- falda de estrellas (cueitl) --------------------------------------------------------------
    def parte_falda(self, lz, c, pose):
        P = self.paleta
        fa, hu = P['falda'], P['hueso']
        u, n = self._eje(c)
        cad = c['cadera_torso']
        v = float(pose.extra.get('viento', 0))
        f = float(pose.extra.get('fase', 0))
        kc, kl = c['pierna_c']['rodilla'], c['pierna_l']['rodilla']
        fr, at = (kc, kl) if kc[0] >= kl[0] else (kl, kc)
        a = mas(mas(cad, n, 5.2), u, 3.0)
        b = mas(mas(cad, n, -5.6), u, 3.0)
        hf = mas(fr, (2.5, 0.5))
        hb = mas(at, (-4.0 - 3 * max(0, v), 1.5 + 1.5 * math.sin(f)))
        hem = dentado(hf, hb, 9, 5.0, normal=(0, 1), sem=int(f) + 1)
        p = lz.parte()
        p.poligono([a] + hem + [b], fa, sombreado=(1, 2, 3), ks=2)
        # cenefa de hueso arriba de la bastilla (con huecos) y estrellas en el paño
        for i in range(len(hem) - 1):
            p0 = mas(hem[i], (0, -3 if i % 2 == 0 else -4.5))
            p1 = mas(hem[i + 1], (0, -3 if (i + 1) % 2 == 0 else -4.5))
            p.linea(p0, p1, hu, 2 if i % 2 else 1)
        cin0, cin1 = mas(mas(cad, u, 3.5), n, -6.2), mas(mas(cad, u, 3.5), n, 5.8)
        p.linea(cin0, cin1, hu, 2)
        p.linea(mas(cin0, (0, 1)), mas(cin1, (0, 1)), fa, 0)
        for j in range(4):
            t = (j + 0.6) / 4.4
            top = (cin0[0] + (cin1[0] - cin0[0]) * t, cin0[1] + (cin1[1] - cin0[1]) * t)
            h = hem[min(len(hem) - 1, int((1 - t) * (len(hem) - 1)))]
            m = (top[0] + (h[0] - top[0]) * (0.3 + 0.35 * (j % 2)), top[1] + (h[1] - top[1]) * (0.3 + 0.35 * (j % 2)))
            x, y = p.a_px(m)
            purif = pose.extra.get('purificado')
            for dx, dy, tt in ((0, 0, 2), (1, 0, 1), (-1, 0, 1), (0, 1, 1), (0, -1, 1)):
                if p.dentro(x + dx, y + dy) and p.mat[y + dy, x + dx] == fa:
                    p.pon(x + dx, y + dy, P['estrella'], tt if not purif else 2, fijo=True)
        # nudo de la faja con borla que cuelga atrás
        nudo = mas(cin0, n, -0.5)
        p.elipse(nudo, 1.8, 1.8, fa, tonos=(1, 2, 3))
        trazo(p, curva(nudo, -20 - 20 * v, 9, 20, 3, onda=8, fase=f), 1.4, 0.8, fa, tonos=(1, 2, 3))
        return [(p, 'contorno', 0, 1)]

    # ---- cráneo y cuello -------------------------------------------------------------------------
    def parte_cabeza(self, lz, c, pose):
        P = self.paleta
        hu = P['hueso']
        est = self._cab(c, pose)
        m = c['cab_mapa']
        p0 = lz.parte()
        cue = c['cuello']
        base = est.punto('cuello', 0, -1)
        p0.capsula(mas(cue, (-1, 3)), base, 1.8, 1.6, hu, tonos=(1, 2, 3))
        cr = lz.parte()
        purif = pose.extra.get('purificado')
        apag = pose.extra.get('apagado')
        rep = None
        if purif:
            rep = {'r': ('estrella', 2, 'f'), 'R': ('estrella', 2, 'f'), 'e': ('estrella', 1, 'f')}
        elif apag:
            rep = {'r': ('ojo', 0, 'f'), 'R': ('ojo', 1, 'f'), 'e': ('pelo', 0, 'f')}
        e = cr.estampa(m, c['cuello'], c['M_cabeza'], 'cuello', reemplazos=rep)
        c['cabeza'] = e
        return [(p0, 'contorno', 0), (cr, 'contorno', 0, 1)]

    # ---- efectos -----------------------------------------------------------------------------------
    def retoques(self, lz, c, pose):
        P = self.paleta
        ex = pose.extra
        f = float(ex.get('fase', 0))
        es = P['estrella']
        purif = ex.get('purificado')
        apag = ex.get('apagado')
        # estrellas en la cabellera: titilan por cuadro
        for j, pt in enumerate(c.get('puntas_pelo', [])):
            if (j + int(f)) % 3 != 0 or apag:
                continue
            x, y = lz.a_px(pt)
            if lz.dentro(x, y):
                lz.pon(x, y, es, 2, fijo=True)
                if (j + int(f)) % 2 == 0:
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        if lz.dentro(x + dx, y + dy) and lz.mat[y + dy, x + dx] >= 0:
                            lz.pon(x + dx, y + dy, es, 0, fijo=True)
        e = c.get('cabeza')
        carga = int(ex.get('carga', 0))
        ojo_m = es if purif else P['ojo']
        if e is not None and carga >= 2 and not apag:
            ojo = e.punto('ojo')
            for k in range(1, 3 + carga - 2):
                x, y = lz.a_px(mas(ojo, (-k - 1.5, -0.2 * k)))
                if lz.dentro(x, y) and lz.mat[y, x] < 0:
                    lz.pon(x, y, ojo_m, max(0, 2 - k // 2), fx=True)
        if carga >= 2 and 'baston_cab' in c and not apag:
            cab = c['baston_cab']
            anillo(lz, cab, 6 + (carga - 2), P['obsid'], 3, paso=2, fase=int(f))
            chispa(lz, mas(cab, (2, -3)), es, 1 + (carga >= 3))
        orbe = ex.get('orbe')
        if orbe is not None:
            # lluvia de estrellas: invoca astros que giran sobre la cabeza
            cen = mas(c['cuello'], (6, -26))
            for k in range(5):
                a = orbe * 0.7 + k * 1.26
                pt = (cen[0] + 14 * math.cos(a), cen[1] + 5 * math.sin(a))
                chispa(lz, pt, es, 2 if (k + orbe) % 2 else 1)
        des = ex.get('destello')
        if des:
            b = c['brazo_c']
            pt = mas(b['muneca'], dir_ang(b['ang_ante']), 5)
            chispa(lz, pt, es, 3 if des >= 2 else 2)
            if des >= 2:
                anillo(lz, pt, 5, es, 1, paso=2)
        est = ex.get('estela')
        if est:
            # embestida / zarpazo: rayas de velocidad detrás del cuerpo
            cad = c['cadera_torso']
            for k in range(5):
                y = cad[1] - 26 + k * 9
                x0 = cad[0] - 22 - (k % 2) * 6
                for j in range(8 + 3 * (k % 3)):
                    x, yy = lz.a_px((x0 - j, y))
                    if lz.dentro(x, yy) and lz.mat[yy, x] < 0 and j % 4 != 3:
                        lz.pon(x, yy, es if j < 3 else P['obsid'], 1 if j < 3 else 2, fx=True)
        ch = ex.get('chispas')
        if ch is not None and e is not None:
            cen = e.punto('frente')
            pts = [(-24, -2), (16, -18), (24, 6), (-28, 12), (6, -24), (-12, -20), (28, -8), (-32, 2), (2, 12)]
            for j, (dx, dy) in enumerate(pts):
                if (j + ch) % 2 == 0:
                    chispa(lz, (cen[0] + dx, cen[1] + dy - ch * 2), es, 1 if j % 3 else 2,
                           t_centro=2, t_brazo=1 if not purif else 2)
        mareo = ex.get('mareo')
        if mareo is not None and e is not None:
            cen = e.punto('coronilla', 0, -8)
            for k in range(3):
                a = mareo * 0.8 + k * 2.09
                chispa(lz, (cen[0] + 10 * math.cos(a), cen[1] + 3 * math.sin(a)), es, 1, 2, 1)
        if ex.get('polvo'):
            k = int(ex['polvo'])
            sy = self.suelo_y(c)
            for s in (-1, 1):
                for j in range(4):
                    x, y = lz.a_px((c['cadera'][0] + s * (9 + j * 4 + k * 3), sy - 1 - (j % 2) - k))
                    lz.pon(x, y, P['hueso'], 2 - (j % 2), fx=True)
                    lz.pon(x + s, y, P['hueso'], 1, fx=True)
        if ex.get('impacto'):
            # onda de choque estelar al frente (al bajar los brazos / la macana)
            k = int(ex['impacto'])
            for j in range(-3, 4):
                x, y = lz.a_px((c['cadera'][0] + 26 + k * 6 + abs(j) * 0.5, self.suelo_y(c) - 5 - j * 1.2))
                lz.pon(x, y, es, 2 if abs(j) < 2 else 1, fx=True)


BASE = Pose(tronco=6, cabeza=-2, hombro_c=10, codo_c=50, hombro_l=-10, codo_l=30,
            muslo_c=7, rodilla_c=5, pie_c=0, muslo_l=-6, rodilla_l=4, pie_l=0, mano_c='puno', mano_l='garra')


def animaciones():
    B = BASE
    A = animaciones_jefe(B, paso=1.0, lean=5, lean_correr=20, mano_atk='garra')

    def con_baston(anim, modo='vertical'):
        return Anim([p.con(extra={'baston': p.extra.get('baston', modo)}) for p in anim.poses], anim.fps, anim.loop)

    # EMBESTIDA (ataque): se lanza con la macana por delante como lanza, el cuerpo casi horizontal.
    e0 = B.con(tronco=30, hombro_c=86, codo_c=4, hombro_l=-50, codo_l=30, muslo_c=50, rodilla_c=40, muslo_l=-40,
               rodilla_l=20, pie_l=-30, cabeza=-20, extra={'fase': 0, 'viento': 2.0, 'baston': 96, 'carga': 3,
                                                        'boca': 3, 'estela': 1})
    e1 = e0.con(tronco=36, muslo_c=30, rodilla_c=60, muslo_l=-50, rodilla_l=40, hunde=1,
                extra={'fase': 2, 'baston': 98, 'estela': 2})
    e2 = e0.con(tronco=32, muslo_c=56, rodilla_c=30, muslo_l=-30, rodilla_l=50, extra={'fase': 4, 'estela': 1})
    A['ataque'] = Anim([e0, e1, e2, e1.con(extra={'fase': 6})], 12, True)
    # CARGA de embestida (golpe): se agazapa, la macana atrás, brasa en los ojos, pies que escarban.
    g0 = B.con(tronco=24, hombro_c=-40, codo_c=60, hombro_l=40, codo_l=40, muslo_c=40, rodilla_c=70, muslo_l=-20,
               rodilla_l=50, hunde=2, cabeza=-10, extra={'fase': 1, 'viento': 0.3, 'baston': 120, 'carga': 1,
                                                        'boca': 1})
    g1 = g0.con(tronco=30, hombro_c=-56, muslo_c=50, rodilla_c=90, muslo_l=-26, rodilla_l=66, hunde=3,
                extra={'fase': 2, 'baston': 110, 'carga': 2, 'boca': 2})
    g2 = g1.con(tronco=34, hombro_c=-64, hunde=3.5, extra={'fase': 3, 'baston': 104, 'carga': 3, 'boca': 3,
                                                         'polvo': 1})
    A['golpe'] = Anim([g0, g1, g2, g2.con(hunde=3, extra={'fase': 4, 'polvo': 2})], 8, False)
    # LLUVIA DE ESTRELLAS (conjuro): alza la macana al cielo con ambas manos, astros que giran.
    cj = B.con(tronco=-6, hombro_c=160, codo_c=10, hombro_l=150, codo_l=20, cabeza=-14, muslo_c=12, rodilla_c=6,
               muslo_l=-10, mano_l='abierta')
    A['conjuro'] = Anim([cj.con(hombro_c=160 + 4 * math.sin(i), hunde=0.5 * (i % 2),
                                extra={'fase': i, 'viento': 0.8, 'baston': 'sigue', 'carga': [2, 3, 3, 2, 3, 3][i],
                                       'orbe': i, 'boca': 2 if i % 3 == 1 else 1})
                         for i in range(6)], 8, True)
    # Picada (salto/caída/aterrizar): se impulsa hacia el cielo y cae en picada con la macana abajo.
    A['salto'] = con_baston(A['salto'], 'sigue')
    A['subida'] = con_baston(A['subida'], 'sigue')
    cp = B.con(tronco=20, muslo_c=10, rodilla_c=20, pie_c=-40, muslo_l=-10, rodilla_l=30, pie_l=-50, hombro_c=30,
               codo_c=0, hombro_l=-60, codo_l=20, cabeza=10, mano_l='abierta',
               extra={'baston': 20, 'boca': 3, 'carga': 2})
    A['caida'] = Anim([cp.con(extra={'fase': 4, 'viento': -2.0}), cp.con(hombro_c=26, extra={'fase': 5, 'viento': -2.0})],
                      10, True)
    A['aterrizar'] = Anim([p.con(extra={'baston': 30, 'impacto': 1 + i % 2}) if i < 2 else p
                           for i, p in enumerate(A['aterrizar'].poses)], 12, False)
    for k in ('reposo', 'caminar', 'correr', 'lanzar', 'disparar', 'invocar', 'esquivar', 'interactuar', 'dano',
              'aturdido', 'purificar', 'morir'):
        A[k] = con_baston(A[k], 'sigue' if k in ('lanzar', 'disparar', 'invocar') else 'vertical')
    A['agotado'] = A['aturdido']
    # En el suelo suelta la macana.
    A['morir'] = Anim([p.con(extra={'sin_baston': 1}) if i >= 2 else p for i, p in enumerate(A['morir'].poses)],
                      A['morir'].fps, False)
    A['purificar'] = Anim([p.con(extra={'sin_baston': 1}) if i >= 1 else p for i, p in enumerate(A['purificar'].poses)],
                          A['purificar'].fps, False)
    A['golpe'] = con_baston(A['golpe'])
    return A


PERSONAJE = Tzitzimitl()
