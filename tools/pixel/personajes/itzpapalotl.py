"""Itzpapálotl, la Mariposa de Obsidiana (jefa final del Nivel 10, ~140 px con el penacho): mujer de rostro de
calavera con ojos ámbar, penacho de plumas-navaja, un ECLIPSE detrás de la cabeza (disco negro con corona de luz),
alas enormes hechas de navajas de obsidiana con filo violeta y motas doradas, vestido largo carbón con faja y
placas de oro, garras de águila en manos y pies, y el NÚCLEO al pecho (gema roja que late; en el juego es lo que
se golpea con ECOS).

Diseño Codex (itzpapalotl.png) —figura alta y oscura con la cascada de plumas a la espalda— con más detalle. Sin
gore. Al purificarse el núcleo pasa a luz cálida; al caer se postra y las alas se deshacen en humo."""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, lerp, mas, previo  # noqa: E402
from personajes._jefes2 import (Jefe, anillo, animaciones_jefe, chispa, curva, dentado, hueso, mano_hueso,  # noqa: E402
                                pie_hueso, pluma_navaja, trazo)

PAL = Paleta([
    Material('hueso',  ['#5a4a46', '#a8968a', '#dcd0c0', '#f8f0e4'],  '#2a1e22'),
    Material('obsid',  ['#0c0a12', '#1a1424', '#2c2238', '#443650'],  '#060408'),
    Material('filo',   ['#5a3a9a', '#9a70e0', '#d8c0ff'],             '#2c1a50'),
    Material('oro',    ['#5a3414', '#a46a28', '#e0a848', '#fff0b0'],  '#2e1a0a'),
    Material('tela',   ['#1e1620', '#30242e', '#463640', '#5e4a52'],  '#0e0a0e'),
    Material('nucleo', ['#7a1028', '#ff4060', '#ffb0a0', '#fff0e0'],  '#3a0814'),
])

LEY_CRANEO = {
    'a': ('hueso', 0), 'b': ('hueso', 1), 'c': ('hueso', 2), 'd': ('hueso', 3),
    'x': ('obsid', 0, 'f'), 'n': ('obsid', 0, 'f'), 'q': ('obsid', 1, 'f'), 't': ('hueso', 3, 'f'),
    'y': ('oro', 2, 'f'), 'Y': ('oro', 3, 'f'),
    'k': ('oro', 0), 'K': ('oro', 1), 'O': ('oro', 2), 'W': ('oro', 3, 'f'), 'o': ('oro', 1),
    'm': ('nucleo', 1, 'f'), 'p': ('obsid', 1),
}
CRANEO = """
    ...kKOOOOOKk...
    ..kOWOOmOOWOk..
    ..bccccdddddc..
    .abcccdddddddc.
    .abccccdddddddc
    .abcccccddxxxdc
    .abcccccdxxyYxd
    .aabcOocdxxyxxd
    .aabbOobbcxxxdc
    ..aabbobbccdddc
    ...aabbbcccnccb
    ....aabbcccnncb
    .....abtttttttb
    ......qtqtqtqb.
    ......aabbbbbb.
"""
ANCLAS_CRANEO = {'cuello': (5, 14), 'nuca': (2, 5), 'corona': (7, 0), 'frente': (12, 3), 'ojo': (11, 6),
                 'banda_atras': (3, 1)}


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
    'parpadeo': _var(CRANEO, {6: '.abcccccdxxxxxd', 7: '.aabcOocdxxxxxd'}),
    'dolor': _var(CRANEO, {5: '.abcccccdddxxdc', 6: '.abcccccdxxxyxd', 7: '.aabcOocdxxxxxd'}),
    'grito': _var(CRANEO, {13: '......qqqqqqqqb', 14: '......qtqtqtqtb', 15: '.......aabbbbbb'}),
}


def _craneo(cara, boca):
    if boca >= 2 and cara != 'parpadeo':
        base = CRANEOS['grito']
        if cara == 'dolor':
            base = _var(base, {5: '.abcccccdddxxdc', 6: '.abcccccdxxxyxd'})
    else:
        base = CRANEOS.get(cara, CRANEO)
    return Mapa.de_texto(base, LEY_CRANEO, PAL, ANCLAS_CRANEO)


class Itzpapalotl(Jefe):
    id = 'itzpapalotl'
    fw, fh = 200, 168
    pivote = (100, 165)
    alto = 140
    L_muslo, L_pierna, L_pie, alto_tobillo = 27, 27, 12, 3
    L_brazo, L_ante = 19, 18
    sep_cadera = (2.0, -2.0)
    ANCLAS = {'o': (0, 0), 'barriga': (0, -12), 'pecho': (1, -24), 'cuello': (2, -36), 'hombro_c': (0, -32),
              'hombro_l': (-4, -32), 'ala': (-5, -29)}
    paleta = PAL
    humo = ('obsid', (3, 2))

    def orden(self, pose):
        o = ['ala_l', 'ala_c', 'eclipse', 'brazo_l', 'pierna_l', 'pierna_c', 'falda', 'torso', 'cabeza', 'brazo_c']
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

    # ---- eclipse: disco negro con corona de luz detrás de la cabeza ---------------------------------
    def parte_eclipse(self, lz, c, pose):
        P = self.paleta
        est = self._cab(c, pose)
        cen = mas(est.punto('corona'), (-5, -10))
        c['eclipse'] = cen
        p = lz.parte()
        p.elipse(cen, 15, 15, P['obsid'], tonos=(0, 0, 1), tramado=False)
        return [(p, 'contorno', 0)]

    # ---- alas de navajas de obsidiana ----------------------------------------------------------------
    def _ala(self, lz, c, pose, lado):
        P = self.paleta
        ob, fi, oro = P['obsid'], P['filo'], P['oro']
        ala = float(pose.extra.get('ala', 0))           # 0 plegada, 1 media, 2 en alto, -1 barre hacia abajo
        f = float(pose.extra.get('fase', 0))
        v = float(pose.extra.get('viento', 0))
        sy = self.suelo_y(c)
        base = c['torso'].punto('ala')
        lejana = lado == 'l'
        if lejana:
            base = mas(base, (-2, -2))
        # Ala de mariposa de obsidiana: dos lóbulos (superior e inferior) cuyo borde es una hilera de NAVAJAS
        # (lascas triangulares con filo violeta), venas, banda iridiscente y un ocelo dorado.
        # ala: 0 plegada, 2 en alto (se abre hacia arriba), −1 barre hacia abajo y adelante.
        al = max(0.0, ala)
        ab = min(0.0, ala)
        giro = -18 * al - 30 * ab + 3 * math.sin(f * 0.8) - 5 * v + (-9 if lejana else 0)
        k_l = 0.9 if lejana else 1.0
        lob = [
            # (ángulo inicial, final, largo máximo, posición del máximo, navajas)
            (196 + giro * 1.3, 284 + giro * 0.9, (56 + 6 * al) * k_l, 0.55, 8),
            (286 + giro * 0.8, 346 + giro * 0.5, (74 - 6 * al) * k_l, 0.3, 7),
        ]
        capas = []
        puntas = []
        for li, (a0, a1, Lm, pm, nn) in enumerate(lob):
            N = 18

            def R(t):
                return Lm * (0.42 + 0.58 * math.sin(math.pi * min(1.0, t / (2 * pm) if t < pm else
                                                                    0.5 + (t - pm) / (2 * (1 - pm))))) 

            borde = [mas(base, dir_ang(lerp(a0, a1, i / N)), R(i / N)) for i in range(N + 1)]
            borde = self.pisar(borde, sy)
            q = lz.parte()
            q.poligono([base] + borde, ob, sombreado=(0, 1, 2) if not lejana else (0, 0, 1), ks=2)
            # banda iridiscente cerca del borde y venas
            for i in range(N):
                t0, t1 = i / N, (i + 1) / N
                for frac, mat_t in ((0.86, (fi, 0)), (0.93, (ob, 3 if not lejana else 2))):
                    pa = mas(base, dir_ang(lerp(a0, a1, t0)), R(t0) * frac)
                    pb = mas(base, dir_ang(lerp(a0, a1, t1)), R(t1) * frac)
                    q.linea(pa, pb, mat_t[0], mat_t[1])
            for j in range(1, 6):
                t = j / 6
                q.linea(mas(base, dir_ang(lerp(a0, a1, t)), 3), mas(base, dir_ang(lerp(a0, a1, t)), R(t) * 0.8), ob,
                        0 if j % 2 else 2)
            # reflejo vítreo de la obsidiana (luz arriba-izquierda): trazos claros cortos cerca del borde superior
            if not lejana:
                for j, (t, fr0, fr1) in enumerate(((0.12, 0.45, 0.72), (0.2, 0.5, 0.66))):
                    a_ = lerp(a0, a1, t)
                    q.linea(mas(base, dir_ang(a_), R(t) * fr0), mas(base, dir_ang(a_ + 4), R(t) * fr1), ob, 3)
            # ocelo dorado (solo el ala cercana; en el lóbulo superior uno grande, en el inferior uno chico)
            if not lejana:
                t = 0.5
                cen = mas(base, dir_ang(lerp(a0, a1, t)), R(t) * (0.55 if li == 0 else 0.5))
                rr = 3.2 if li == 0 else 2.2
                q.elipse(cen, rr, rr, oro, tonos=(1, 2, 3))
                q.elipse(cen, rr - 1.3, rr - 1.3, ob, tonos=(0, 0, 1))
                q.pon_m(cen, P['nucleo'] if li == 0 else oro, 1 if li == 0 else 2, fijo=True)
            capas.append((q, 'contorno', 1 if lejana else 0))
            # navajas del borde: lascas triangulares que sobresalen, con el filo de arriba brillante
            nv = lz.parte()
            for k in range(nn):
                t = (k + 0.5) / nn
                d = 0.5 / nn
                ang = lerp(a0, a1, t)
                e0 = mas(base, dir_ang(lerp(a0, a1, t - d * 0.9)), R(t - d * 0.9) - 1)
                e1 = mas(base, dir_ang(lerp(a0, a1, t + d * 0.9)), R(t + d * 0.9) - 1)
                largo = 8 + 3 * math.sin(k * 1.7 + li)
                tip = mas(base, dir_ang(ang + 4), R(t) + largo)
                e0, e1, tip = self.pisar([e0, e1, tip], sy)
                nv.poligono([e0, tip, e1], ob, sombreado=(0, 1, 2) if not lejana else (0, 0, 1), ks=1)
                arr = e0 if e0[1] < e1[1] else e1
                nv.linea(arr, tip, fi, 2 if not lejana else 1)
                nv.pon_m(tip, fi, 2 if not lejana else 1)
                puntas.append(tip)
            capas.append((nv, 'contorno', 1 if lejana else 0))
        c.setdefault('puntas_ala', []).extend(puntas)
        if pose.extra.get('apagado'):
            for capa, _, _ in capas:
                capa.oscurecer(1)
        return capas

    def parte_ala_l(self, lz, c, pose):
        return self._ala(lz, c, pose, 'l')

    def parte_ala_c(self, lz, c, pose):
        return self._ala(lz, c, pose, 'c')

    # ---- piernas (casi cubiertas por el vestido) y garras de águila ---------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        hu, ob = P['hueso'], P['obsid']
        pie_hueso(capa, p, hu)
        r = math.radians(p['ang_pie'])
        fwd = (math.cos(r), -math.sin(r))
        dn = (math.sin(r), math.cos(r))
        for k, off in enumerate((-1.2, 0.2, 1.4)):     # talones de águila
            a = mas(mas(p['punta'], fwd, 0.5), dn, off - 0.6)
            capa.linea(a, mas(mas(a, fwd, 2.2), dn, 1.0), ob, 2)
        capa.linea(mas(p['talon'], fwd, -0.5), mas(mas(p['talon'], fwd, -2.5), dn, 1.2), ob, 2)   # espolón
        hueso(capa, p['rodilla'], p['tobillo'], 2.2, 1.6, hu, nudo=2.4)
        hueso(capa, p['cadera'], p['rodilla'], 3.0, 2.3, hu, surco=False)
        d = dir_ang(p['ang_pierna'])
        m = mas(p['rodilla'], d, self.L_pierna - 3)
        capa.capsula(mas(m, d, -1.2), mas(m, d, 1.2), 2.4, 2.4, P['oro'], tonos=(1, 2, 3))

    # ---- brazos: mangas ceñidas, brazaletes de oro, garras con uñas de obsidiana ------------------------
    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        hu, te, oro = P['hueso'], P['tela'], P['oro']
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        mano_hueso(capa, b, hu, 'garra' if mano in ('puno', 'garra') else mano, tam=1.3, una=P['obsid'], una_t=2)
        hueso(capa, b['codo'], b['muneca'], 1.7, 1.4, hu)
        capa.capsula(b['hombro'], b['codo'], 2.8, 2.2, te, tonos=(1, 2, 3))
        d = dir_ang(b['ang_ante'])
        for t, r in ((0.55, 2.2), (0.8, 2.0)):
            m = mas(b['codo'], d, self.L_ante * t)
            capa.capsula(mas(m, d, -0.8), mas(m, d, 0.8), r, r, oro, tonos=(1, 2, 3))
        capa.elipse(b['hombro'], 3.4, 3.0, oro, tonos=(1, 2, 3))   # hombrera dorada

    # ---- vestido largo con faja y placas de oro --------------------------------------------------------
    def parte_falda(self, lz, c, pose):
        P = self.paleta
        te, oro = P['tela'], P['oro']
        u, n = self._eje(c)
        cad = c['cadera_torso']
        v = float(pose.extra.get('viento', 0))
        f = float(pose.extra.get('fase', 0))
        pc, pl = c['pierna_c'], c['pierna_l']
        sy = self.suelo_y(c)
        nodos = [pc['rodilla'], pl['rodilla'], pc['tobillo'], pl['tobillo']]
        x_fr = max(q[0] for q in nodos)
        x_at = min(q[0] for q in nodos)
        y_h = sy - 2.5
        kfr = max((pc['rodilla'], pl['rodilla']), key=lambda q: q[0])
        kat = min((pc['rodilla'], pl['rodilla']), key=lambda q: q[0])
        a = mas(mas(cad, n, 6.8), u, 3)
        b = mas(mas(cad, n, -7.4), u, 3)
        hf = (x_fr + 3.0, y_h)
        hb = (x_at - 7.0 - 4 * max(0, v), y_h + 0.5 + 1.0 * math.sin(f))
        hem = dentado(hf, hb, 10, 2.6, normal=(0, 1), sem=int(f) + 2)
        cola = mas(hb, (-3 - 3 * max(0, v), -5))
        pts = [a, mas(kfr, (3.5, 0))] + hem + [cola, mas(kat, (-5 - 2 * max(0, v), 0)), b]
        p = lz.parte()
        p.poligono(pts, te, sombreado=(1, 2, 3), ks=2)
        # pliegues que siguen las piernas (se lee el paso) y textura de tejido
        for pp in (pc, pl):
            p.linea(mas(cad, (0, 6)), pp['rodilla'], te, 0 if pp is pl else 1)
            p.linea(pp['rodilla'], mas(pp['tobillo'], (0, -3)), te, 0 if pp is pl else 1)
        for i in range(0, len(hem) - 1):
            p.linea(mas(hem[i], (0, -1)), mas(hem[i + 1], (0, -1)), oro, 1 if i % 2 else 2)
            # cenefa: grecas (escalonado) de oro sobre la bastilla
            if i % 2 == 0:
                m = mas(hem[i], (-1, -4))
                p.pon_m(m, oro, 2)
                p.pon_m(mas(m, (1, 0)), oro, 1)
                p.pon_m(mas(m, (1, -1)), oro, 2)
        # orilla delantera del vestido: ribete de oro de la faja a la bastilla
        p.linea(mas(a, (-0.5, 1)), mas(kfr, (2.5, 0)), oro, 2)
        p.linea(mas(kfr, (2.5, 0)), mas(hf, (-0.5, -1)), oro, 1)
        # faja de oro y placas que cuelgan al frente
        g = lz.parte()
        f0, f1 = mas(mas(cad, u, 3), n, -7.4), mas(mas(cad, u, 3), n, 6.8)
        g.capsula(f0, f1, 1.9, 1.9, oro, tonos=(1, 2, 3))
        for k in range(4):
            pt = mas(mas(cad, u, 2.6), n, 4.6 - k * 1.2)
            largo = (11, 8, 6, 4)[k]
            fin = mas(pt, (0.3 - 1.2 * v, largo))
            g.capsula(pt, fin, 1.1 if k else 1.4, 0.9, oro, tonos=(1, 2, 3))
            g.pon_m(fin, P['nucleo'], 1 if k else 2, fijo=True)
        return [(p, 'contorno', 0, 1), (g, 'contorno', 0)]

    # ---- torso: corpiño, collar de oro de varias vueltas y el NÚCLEO --------------------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        te, oro, nu = P['tela'], P['oro'], P['nucleo']
        tor = c['torso']
        cad = c['cadera_torso']
        bar, pec, cue = tor.punto('barriga'), tor.punto('pecho'), tor.punto('cuello')
        u, n = self._eje(c)
        p = lz.parte()
        p.capsula(cad, bar, 6.0, 5.0, te, tonos=(1, 2, 3))
        p.capsula(bar, pec, 5.0, 7.2, te, tonos=(1, 2, 3))
        p.capsula(pec, cue, 7.2, 3.4, te, tonos=(1, 2, 3))
        # costillas marcadas en el corpiño (bordado de hueso)
        for k in range(3):
            a0 = mas(mas(bar, u, 1 + k * 2.6), n, 1)
            p.linea(a0, mas(a0, n, 3.8 - k * 0.4), P['hueso'], 1)
        g = lz.parte()
        # collar de oro: tres vueltas de cuentas
        for vuelta in range(3):
            for k in range(7):
                t = math.pi * (0.05 + 0.9 * k / 6)
                pt = mas(mas(cue, u, -2.5 - vuelta * 1.6 - 2.6 * math.sin(t)), n, (4.8 + vuelta * 0.6) * math.cos(t))
                g.pon_m(pt, oro, 3 if (k + vuelta) % 3 == 0 else 2)
        # núcleo: engaste romboidal de obsidiana con la gema roja que late
        carga = int(pose.extra.get('carga', 0))
        purif = pose.extra.get('purificado')
        apag = pose.extra.get('apagado')
        s = mas(mas(pec, n, 4.2), u, -1.5)
        c['nucleo'] = s
        rombo = [mas(s, (0, -5)), mas(s, (4, 0)), mas(s, (0, 5)), mas(s, (-4, 0))]
        g.poligono(rombo, P['obsid'], sombreado=(1, 2, 3), ks=1)
        x, y = g.a_px(s)
        mat = oro if purif else nu
        t_hi = 3 if (carga >= 2 or purif) else 2
        if apag and not purif:
            t_hi = 1
        for dx, dy, t in ((0, 0, t_hi), (0, -1, t_hi - 1), (1, 0, t_hi - 1), (0, 1, max(0, t_hi - 2)),
                          (-1, 0, t_hi - 1), (0, -2, max(0, t_hi - 2)), (0, 2, 0), (1, -1, max(0, t_hi - 2))):
            g.pon(x + dx, y + dy, mat, max(0, t), fijo=True)
        return [(p, 'contorno', 0), (g, 'contorno', 0, 1)]

    # ---- cráneo, cuello y penacho de plumas-navaja ---------------------------------------------------
    def parte_cabeza(self, lz, c, pose):
        P = self.paleta
        hu, ob, fi, oro = P['hueso'], P['obsid'], P['filo'], P['oro']
        est = self._cab(c, pose)
        m = c['cab_mapa']
        v = float(pose.extra.get('viento', 0))
        f = float(pose.extra.get('fase', 0))
        p0 = lz.parte()
        cue = c['cuello']
        p0.capsula(mas(cue, (-1, 3)), est.punto('cuello', 0, -1), 2.4, 2.2, hu, tonos=(1, 2, 3))
        # penacho: plumas que salen de la banda de oro, en abanico de adelante-arriba a atrás
        r0 = est.punto('corona')
        r1 = est.punto('banda_atras')
        plumas = [(160, 16), (178, 24), (196, 26), (214, 24), (232, 20)]
        capas_pl = []
        for k, (a, L) in enumerate(reversed(plumas)):
            t = k / (len(plumas) - 1)
            raiz = (lerp(r1[0], r0[0], t), lerp(r1[1], r0[1], t) + 1)
            aa = a + pose.cabeza * 0.6 - 7 * v + 2.5 * math.sin(f * 0.8 + k)
            q = lz.parte()
            pluma_navaja(q, raiz, aa, L, 3.3, ob, fi, tonos=(0, 1, 2), curva_g=-16, filo_t=2)
            capas_pl.append((q, 'contorno', 0))
        pl = lz.parte()
        for k in range(5):
            t = k / 4
            pl.pon_m((lerp(r1[0], r0[0], t), lerp(r1[1], r0[1], t) - 1), oro, 3 if k % 2 else 2)
        cr = lz.parte()
        purif = pose.extra.get('purificado')
        apag = pose.extra.get('apagado')
        rep = None
        if apag and not purif:
            rep = {'y': ('oro', 0, 'f'), 'Y': ('oro', 1, 'f')}
        e = cr.estampa(m, c['cuello'], c['M_cabeza'], 'cuello', reemplazos=rep)
        c['cabeza'] = e
        return capas_pl + [(pl, None, 0), (p0, 'contorno', 0), (cr, 'contorno', 0, 1)]

    # ---- efectos -------------------------------------------------------------------------------------
    def retoques(self, lz, c, pose):
        P = self.paleta
        ex = pose.extra
        f = float(ex.get('fase', 0))
        purif = ex.get('purificado')
        apag = ex.get('apagado')
        carga = int(ex.get('carga', 0))
        oro, fi, nu = P['oro'], P['filo'], P['nucleo']
        # corona del eclipse: anillo de luz (más intenso con la carga; se apaga vencida, dorado purificada)
        if 'eclipse' in c and not ex.get('tendido'):
            cen = c['eclipse']
            if not apag or purif:
                anillo(lz, cen, 16, oro if purif else fi, 2, paso=1, solo_vacio=False)
                anillo(lz, cen, 17, oro, 3 if (carga >= 2 or purif) else 2, paso=2, fase=int(f))
                if carga >= 3:
                    anillo(lz, cen, 19, oro, 3, paso=3, fase=int(f))
            else:
                anillo(lz, cen, 16, fi, 0, paso=2, fase=int(f))
        # brillo del núcleo
        if 'nucleo' in c and (carga >= 2 or purif) and not (apag and not purif):
            s = c['nucleo']
            mat = oro if purif else nu
            for dx, dy in ((6, 0), (-6, 0), (0, -7), (0, 7)):
                x, y = lz.a_px(mas(s, (dx, dy)))
                if lz.dentro(x, y) and lz.mat[y, x] < 0:
                    lz.pon(x, y, mat, 2, fx=True)
            if carga >= 3:
                for k in range(7, 10):
                    x, y = lz.a_px(mas(s, (k, 0)))
                    if lz.dentro(x, y) and lz.mat[y, x] < 0:
                        lz.pon(x, y, mat, 1, fx=True)
        e = c.get('cabeza')
        if e is not None and carga >= 3 and not apag:
            ojo = e.punto('ojo')
            for k in range(1, 4):
                x, y = lz.a_px(mas(ojo, (-k - 1.5, -0.3 * k)))
                if lz.dentro(x, y) and lz.mat[y, x] < 0:
                    lz.pon(x, y, oro, 3 - k, fx=True)
        # mariposas de obsidiana (conjuro): revolotean hacia adelante
        orbe = ex.get('orbe')
        if orbe is not None:
            w = c['brazo_c']['muneca']
            for k in range(4):
                a = orbe * 0.9 + k * 1.57
                pt = (w[0] + 8 + 10 * k * 0.5 + 6 * math.cos(a), w[1] - 6 + 7 * math.sin(a) - k * 3)
                self._mariposa(lz, pt, (orbe + k) % 2, purif)
        des = ex.get('destello')
        if des:
            b = c['brazo_c']
            pt = mas(b['muneca'], dir_ang(b['ang_ante']), 7)
            chispa(lz, pt, fi, 3 if des >= 2 else 2)
            if des >= 2:
                anillo(lz, pt, 5, fi, 1, paso=2)
                # grieta que se abre hacia el suelo
                x, y = lz.a_px(pt)
                for j in range(1, 14):
                    xx = x + (j // 3) * (1 if j % 2 else -1) // 1
                    lz.pon(xx, y + j, fi, 2 if j < 6 else 1, fx=True)
        est = ex.get('estela')
        if est and c.get('puntas_ala'):
            # ráfaga del aleteo: arcos de viento violeta delante de las alas
            for k, pt in enumerate(c['puntas_ala'][::3]):
                for j in range(4 + est):
                    x, y = lz.a_px(mas(pt, (3 + j * 2, 1 + j)))
                    if lz.dentro(x, y) and lz.mat[y, x] < 0 and (j + k) % 3 != 2:
                        lz.pon(x, y, fi, 2 if j < 2 else 1, fx=True)
        if ex.get('impacto'):
            k = int(ex['impacto'])
            sy = self.suelo_y(c)
            for s in (-1, 1):
                for j in range(6):
                    x, y = lz.a_px((c['cadera'][0] + s * (14 + j * 5 + k * 6), sy - 2 - (j % 3)))
                    lz.pon(x, y, fi, 2 - (j % 2), fx=True)
        ch = ex.get('chispas')
        if ch is not None and e is not None:
            cen = e.punto('frente')
            pts = [(-34, 0), (18, -24), (28, 6), (-38, 16), (8, -34), (-18, -30), (34, -12), (-42, -6), (2, 14)]
            for j, (dx, dy) in enumerate(pts):
                if (j + ch) % 2 == 0:
                    if purif:
                        chispa(lz, (cen[0] + dx, cen[1] + dy - ch * 2), oro, 1 if j % 3 else 2)
                    elif j % 3 == 0:
                        self._mariposa(lz, (cen[0] + dx, cen[1] + dy - ch * 2), (j + ch) % 2, False)
                    else:
                        chispa(lz, (cen[0] + dx, cen[1] + dy - ch * 2), fi, 1, 2, 1)
        mareo = ex.get('mareo')
        if mareo is not None and e is not None:
            cen = e.punto('corona', 0, -10)
            for k in range(3):
                a = mareo * 0.8 + k * 2.09
                chispa(lz, (cen[0] + 12 * math.cos(a), cen[1] + 3.5 * math.sin(a)), oro, 1, 3, 2)
        if ex.get('polvo'):
            k = int(ex['polvo'])
            sy = self.suelo_y(c)
            for s in (-1, 1):
                for j in range(5):
                    x, y = lz.a_px((c['cadera'][0] + s * (12 + j * 5 + k * 3), sy - 1 - (j % 2) - k))
                    lz.pon(x, y, P['tela'], 3 - (j % 2), fx=True)

    def _mariposa(self, lz, pt, aleteo, purif):
        """Mariposita de obsidiana (efecto): dos alas en V con filo violeta y cuerpo dorado."""
        P = self.paleta
        x, y = lz.a_px(pt)
        cuerpo = P['oro']
        ala = P['oro'] if purif else P['filo']
        forma = ([(-2, -2), (-1, -2), (-2, -1), (-1, -1), (1, -2), (2, -2), (1, -1), (2, -1), (-1, 1), (1, 1)]
                 if aleteo else [(-2, 0), (-1, -1), (-1, 0), (1, -1), (1, 0), (2, 0), (-1, 1), (1, 1)])
        for dx, dy in forma:
            if lz.dentro(x + dx, y + dy):
                lz.pon(x + dx, y + dy, ala, 1 if abs(dx) == 2 else 2, fx=True)
        for dy in (-1, 0, 1):
            if lz.dentro(x, y + dy):
                lz.pon(x, y + dy, cuerpo, 3 if dy < 1 else 2, fx=True)


BASE = Pose(tronco=4, cabeza=-2, hombro_c=14, codo_c=44, hombro_l=-8, codo_l=34,
            muslo_c=7, rodilla_c=5, pie_c=0, muslo_l=-6, rodilla_l=4, pie_l=0, mano_c='garra', mano_l='garra')


def animaciones():
    B = BASE
    A = animaciones_jefe(B, paso=0.95, lean=4, lean_correr=16)

    def alas(nombre, valores):
        a = A[nombre]
        vals = valores if isinstance(valores, (list, tuple)) else [valores] * len(a.poses)
        A[nombre] = Anim([p.con(extra={'ala': vals[i % len(vals)]}) for i, p in enumerate(a.poses)], a.fps, a.loop)

    # Reposo: las alas respiran (se abren apenas al inhalar).
    alas('reposo', [0, 0.15, 0.3, 0.3, 0.15, 0])
    alas('caminar', [0.1, 0.2, 0.1, 0, 0.1, 0.2, 0.1, 0])
    alas('correr', [0.4, 0.8, 0.4, 0, 0.4, 0.8, 0.4, 0])
    # GOLPE (anticipación del aleteo): las alas se levantan hasta lo más alto, el núcleo se carga.
    alas('golpe', [0.6, 1.3, 2.0, 2.0])
    # ATAQUE (ráfaga): barren hacia abajo con fuerza, ondas de viento al frente, y vuelven.
    alas('ataque', [-1.0, -1.2, -0.6, 0.2])
    alas('invocar', [0.3, 1.2, 2.0, 1.8, 1.6])
    alas('conjuro', [0.5, 0.7, 0.9, 0.7, 0.5, 0.7])
    alas('lanzar', [1.0, -0.6, -0.4, 0])
    alas('disparar', [-0.6, -0.4, 0])
    alas('salto', [0.4, 2.0, 1.4])
    alas('subida', [2.0, 1.4])
    alas('caida', [1.6, 1.9])
    alas('aterrizar', [-0.6, -0.3, 0])
    alas('esquivar', [1.2, 1.8, 0.4])
    alas('dano', [1.4, 0.6, 0])
    alas('aturdido', [-0.3, -0.4, -0.3, -0.2])
    A['agotado'] = A['aturdido']
    alas('purificar', [-0.3, 0.6, 0.8, 1.1, 1.3])
    alas('morir', [1.2, 0.2, 0.6, 0.9, 1.1, 1.1])
    A['golpe'] = Anim(A['golpe'].poses, 6, False)
    return A


PERSONAJE = Itzpapalotl()
