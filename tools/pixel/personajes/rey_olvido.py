"""El Rey del Olvido (jefe del Nivel 7, CDMX, ~118 px con las astas y la llama): esqueleto alto y encorvado con
cráneo de astas de venado, CORONA de oro con gema (se ataca con SOL/FUEGO), llama verde del olvido sobre la
cabeza, ojos verdes, cabellera morada larguísima que ondea hacia atrás, túnica morada con faldón y ribetes de oro,
y el SELLO de la memoria (medallón con espiral violeta) al pecho, que late cuando conjura (se rompe con MEMORIA).

Diseño Codex (rey-del-olvido.png) con más detalle: huesos color cantera vieja, túnica y cabellera moradas, oro.
Al purificarse la llama y los ojos pasan de verde a dorado; al morir se arrodilla, se desploma y en parte se
deshace en humo (sin violencia).

Dos variantes en la misma hoja (VARIANTES_KIT): 'corona' y 'sin_corona' (el cráneo sin la corona de oro). El juego
cambia a 'sin_corona' cuando el jugador rompe la corona con SOL/FUEGO (src/entities/ReyOlvido.ts)."""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas, previo  # noqa: E402
from personajes._jefes2 import (Jefe, anillo, animaciones_jefe, chispa, curva, dentado, hueso, mano_hueso,  # noqa: E402
                                pie_hueso, trazo)

PAL = Paleta([
    Material('hueso',  ['#4a3a2c', '#86704f', '#bfa478', '#e8d6a8'],  '#2a1c16'),
    Material('tunica', ['#16101e', '#281c36', '#3e2c52', '#5c4472'],  '#0c0812'),
    Material('pelo',   ['#120c18', '#22182e', '#34264a', '#4c3a66'],  '#0c0812'),
    Material('oro',    ['#5a3814', '#a4702a', '#dcac48', '#fff0a0'],  '#2e1c0c'),
    Material('llama',  ['#0c4a32', '#1a9058', '#4ee08a', '#c8ffdc'],  '#0c4a32'),
    Material('sello',  ['#4a1478', '#a040f0', '#f0ccff'],             '#2a0a44'),
])

# ---------------------------------------------------------------------------------------------------
# Cráneo (mirando a la derecha) con la corona. Anclas: cuello, nuca (raíz de la cabellera), astas, llama.
# ---------------------------------------------------------------------------------------------------
LEY_CRANEO = {
    'a': ('hueso', 0), 'b': ('hueso', 1), 'c': ('hueso', 2), 'd': ('hueso', 3),
    'x': ('tunica', 0, 'f'), 'n': ('tunica', 0, 'f'), 'q': ('tunica', 1, 'f'), 't': ('hueso', 3, 'f'),
    'g': ('llama', 3, 'f'), 'G': ('llama', 2, 'f'),
    'K': ('oro', 1), 'O': ('oro', 2), 'W': ('oro', 3, 'f'), 'k': ('oro', 0),
    'm': ('sello', 1, 'f'), 'M': ('sello', 2, 'f'),
}
CRANEO = """
    .....W...W...W.
    ....KWK.KWK.KWK
    ....KOK.KOK.KOK
    ...kKOOOOOOOmMK
    ...kkKKKKKKKKKk
    ..bcccdddddddc.
    .bcccdddddddddc
    abccccdddxxxddc
    abbcccddxxgGxdc
    aabbcccdxxxxddcb
    .aabbcccddddddcb
    ..aabbbccccnccb.
    ...aabbbcccnncb.
    ....aabtttttttb
    .....aqtqtqtqb.
    ......aabbbbbb.
"""
ANCLAS_CRANEO = {'cuello': (5, 15), 'nuca': (2, 7), 'asta_c': (9, 2), 'asta_l': (6, 2), 'llama': (8, 0),
                 'frente': (12, 6), 'ojo': (10, 8)}


def _var(base: str, filas: dict) -> str:
    ls = [l.strip() for l in base.strip('\n').split('\n')]
    for i, f in filas.items():
        if f is None:
            continue
        if i >= len(ls):
            ls.append(f)
        else:
            ls[i] = f
    return '\n'.join(ls)


CRANEOS = {
    'normal': CRANEO,
    'parpadeo': _var(CRANEO, {8: 'abbcccddxxxxxdc'}),
    'dolor': _var(CRANEO, {7: 'abccccdddddxxdc', 8: 'abbcccddxxxGxdc', 9: 'aabbcccddxxxddcb'}),
    'grito': _var(CRANEO, {14: '.....aqqqqqqqqb', 15: '.....aqtqtqtqtb', 16: '......aabbbbbbb'}),
}


# Sin corona: las puntas y la banda de oro se vuelven la bóveda del cráneo (las astas siguen saliendo de ahí).
SIN_CORONA = {0: '...............', 1: '...............', 2: '...............',
              3: '.....bbccdd....', 4: '...abccddddc...'}

_VAR = {'v': 'corona'}


def _craneo(cara: str, boca: int) -> Mapa:
    if boca >= 2 and cara != 'parpadeo':
        base = CRANEOS['grito']
        if cara == 'dolor':
            base = _var(base, {7: 'abccccdddddxxdc', 8: 'abbcccddxxxGxdc'})
    else:
        base = CRANEOS.get(cara, CRANEO)
    if _VAR['v'] == 'sin_corona':
        base = _var(base, SIN_CORONA)
    return Mapa.de_texto(base, LEY_CRANEO, PAL, ANCLAS_CRANEO)


class ReyOlvido(Jefe):
    id = 'rey_olvido'
    fw, fh = 164, 140
    pivote = (82, 137)
    alto = 118
    L_muslo, L_pierna, L_pie, alto_tobillo = 22, 22, 12, 3
    L_brazo, L_ante = 19, 18
    sep_cadera = (2.0, -2.0)
    ANCLAS = {'o': (0, 0), 'barriga': (0, -10), 'pecho': (1, -20), 'cuello': (3, -31), 'hombro_c': (-1, -27),
              'hombro_l': (-4, -27)}
    paleta = PAL
    humo = ('pelo', (3, 2))

    def orden(self, pose):
        o = ['pelo', 'manto', 'brazo_l', 'pierna_l', 'pierna_c', 'faldon', 'torso', 'cabeza', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    # ---- ayudas -------------------------------------------------------------------------------
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
        return u, (-u[1], u[0])   # u = hacia arriba del torso, n = hacia adelante

    # ---- cabellera (detrás de todo) -------------------------------------------------------------
    def parte_pelo(self, lz, c, pose):
        P = self.paleta
        pe = P['pelo']
        est = self._cab(c, pose)
        v = float(pose.extra.get('viento', 0))
        f = float(pose.extra.get('fase', 0)) * 0.8
        nuca = est.punto('nuca')
        sy = self.suelo_y(c)
        p = lz.parte()
        q = lz.parte()
        # mechones: raíces de la coronilla a la nuca; largos hasta la corva; el viento los tira hacia atrás
        # mechones de la coronilla (suben y caen hacia atrás: dan volumen) a la nuca (caen casi rectos)
        raices = [(3, -10, 34), (1, -10, 40), (-1, -9, 48), (-2, -7, 54), (-3, -5, 58), (-4, -2, 62), (-4, 1, 58),
                  (-3, 4, 52), (-2, 6, 44), (0, 7, 34), (2, 8, 26)]
        nr = len(raices)
        for k, (dx, dy, L) in enumerate(raices):
            r0 = mas(nuca, (dx, dy))
            t = k / (nr - 1)
            a = -118 + 84 * t - 10 * v
            giro = (74 - 44 * t) - 14 * v if v >= -0.5 else (40 - 30 * t)
            pts = self.pisar(curva(r0, a, L * (1 + 0.05 * abs(v)), giro, 8, onda=3 + 3 * abs(v), fase=f + k * 0.8), sy)
            capa = q if k % 2 == 0 else p
            trazo(capa, pts, 3.3, 0.5, pe, tonos=(0, 1, 2) if capa is p else (1, 2, 3))
            if capa is q:
                for i in range(1, 5):
                    q.linea(mas(pts[i], (0.6, -0.6)), mas(pts[i + 1], (0.6, -0.6)), pe, 3 if i < 3 else 2)
        return [(p, 'contorno', 1), (q, 'contorno', 0)]

    # ---- túnica de atrás (cola que barre el suelo) -------------------------------------------------
    def parte_manto(self, lz, c, pose):
        P = self.paleta
        tu = P['tunica']
        u, n = self._eje(c)
        cad = c['cadera_torso']
        v = float(pose.extra.get('viento', 0))
        f = float(pose.extra.get('fase', 0))
        tor = c['torso']
        hl = tor.punto('hombro_l')
        hc = tor.punto('hombro_c')
        suelo = self.suelo_y(c) if not pose.extra.get('subiendo') else cad[1] + 30
        # bastilla: del frente (entre las piernas) a la cola (atrás, arrastrando)
        frente = (cad[0] + 5 + 2 * math.sin(f), min(suelo - 3, cad[1] + 40))
        cola = (cad[0] - 22 - 9 * v + 2 * math.sin(f * 0.8), min(suelo - 0.5, cad[1] + 48))
        medio = (cad[0] - 12 - 6 * v, cad[1] + 6)
        hem = dentado(frente, cola, 9, 2.6, normal=(0, 1), sem=int(f))
        pts = [mas(hc, (1, 1)), mas(mas(cad, n, 5), (0, 2))] + hem + [medio, mas(hl, (-4, 2)), mas(hl, (-1, -2))]
        p = lz.parte()
        p.poligono(pts, tu, sombreado=(0, 1, 2), ks=2)
        # pliegues: de la cintura a la bastilla (oscuros) con un filo de luz al lado
        for k in range(1, 8, 2):
            h = hem[k]
            a = mas(cad, n, 1 - k * 0.9)
            p.linea(mas(a, (0, 4)), mas(h, (0, -2)), tu, 0)
            p.linea(mas(a, (-1, 6)), mas(h, (-1, -3)), tu, 2 if k < 5 else 1)
        # ribete de oro en la bastilla
        for i in range(len(hem) - 1):
            p.linea(mas(hem[i], (0, -1)), mas(hem[i + 1], (0, -1)), P['oro'], 1 if i % 3 else 2)
        return [(p, 'contorno', 0)]

    # ---- falda: cubre los muslos hasta bajo las rodillas (se abre con el paso); faldón de oro al frente ----
    def parte_faldon(self, lz, c, pose):
        P = self.paleta
        tu, oro = P['tunica'], P['oro']
        u, n = self._eje(c)
        cad = c['cadera_torso']
        v = float(pose.extra.get('viento', 0))
        f = float(pose.extra.get('fase', 0))
        kc, kl = c['pierna_c']['rodilla'], c['pierna_l']['rodilla']
        fr, at = (kc, kl) if kc[0] >= kl[0] else (kl, kc)
        a = mas(mas(cad, n, 6.5), u, 3)
        b = mas(mas(cad, n, -7.0), u, 3)
        hf = mas(fr, (4.0, 5.5))
        hb = mas(at, (-5.0 - 2.5 * max(0, v), 6.5))
        hem = dentado(hf, hb, 8, 2.4, normal=(0, 1), sem=int(f) + 3)
        p = lz.parte()
        p.poligono([a] + hem + [b], tu, sombreado=(1, 2, 3), ks=2)
        # pliegues que bajan de la cadera a los picos de la bastilla
        for k in (2, 4, 6):
            top = mas(cad, n, 4 - k * 1.4)
            p.linea(mas(top, (0, 3)), mas(hem[k], (0, -2)), tu, 1)
        for i in range(len(hem) - 1):
            p.linea(mas(hem[i], (0, -1)), mas(hem[i + 1], (0, -1)), oro, 1 if i % 2 else 2)
        # faldón: banda de oro con dos medallones del sello
        g = lz.parte()
        mid0 = mas(mas(cad, n, 3.0), u, 1)
        mid1 = mas(hem[1], (-1.5, 1.5 + 2 * math.sin(f * 0.9)))
        g.capsula(mid0, mid1, 1.6, 1.4, tu, tonos=(2, 2, 3))
        g.linea(mid0, mid1, oro, 2)
        for t in (0.35, 0.75):
            m = (mid0[0] + (mid1[0] - mid0[0]) * t, mid0[1] + (mid1[1] - mid0[1]) * t)
            g.elipse(m, 1.7, 1.7, oro, tonos=(1, 2, 3))
            g.pon_m(m, P['sello'], 1, fijo=True)
        return [(p, 'contorno', 0, 1), (g, 'contorno', 0)]

    # ---- piernas de hueso -------------------------------------------------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        hu = P['hueso']
        pie_hueso(capa, p, hu)
        hueso(capa, p['rodilla'], p['tobillo'], 2.0, 1.4, hu, nudo=2.6)
        hueso(capa, p['cadera'], p['rodilla'], 2.6, 2.0, hu, surco=False)
        # vendas de oro bajo la rodilla y en el tobillo
        d = dir_ang(p['ang_pierna'])
        for t, r in ((5.5, 2.1), (self.L_pierna - 2.5, 1.8)):
            m = mas(p['rodilla'], d, t)
            capa.capsula(mas(m, d, -0.5), mas(m, d, 0.5), r, r, P['oro'], tonos=(0, 1, 2))

    # ---- brazos: manga acampanada que cuelga, antebrazo y garra de hueso ------------------------
    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        tu, hu, oro = P['tunica'], P['hueso'], P['oro']
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        mano_hueso(capa, b, hu, 'garra' if mano in ('puno', 'garra') else mano, tam=1.25)
        hueso(capa, b['codo'], b['muneca'], 1.6, 1.3, hu, nudo=0)
        capa.capsula(b['hombro'], b['codo'], 3.6, 3.0, tu, tonos=(1, 2, 3))
        # manga: se abre desde el codo y cuelga (gravedad + viento)
        d = dir_ang(b['ang_ante'])
        n = (-d[1], d[0])
        v = float(pose.extra.get('viento', 0))
        m0 = b['codo']
        m1 = mas(b['codo'], d, self.L_ante * 0.5)
        caida = mas(mas(m1, (0, 1), 9), (-1, 0), 2 + 3 * v)
        pts = [mas(m0, n, 3.2), mas(m1, n, 4.4), caida, mas(m1, n, -4.4), mas(m0, n, -3.2)]
        capa.poligono(pts, tu, sombreado=(0, 1, 2), ks=1)
        # puño de la manga con ribete de oro
        capa.linea(mas(m1, n, 4.4), caida, oro, 1)
        capa.linea(mas(m1, n, 4.0), mas(m1, n, -4.0), oro, 2)

    # ---- torso: túnica, pectoral de oro, cinturón y el SELLO ---------------------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        tu, oro, se = P['tunica'], P['oro'], P['sello']
        tor = c['torso']
        cad = c['cadera_torso']
        bar, pec, cue = tor.punto('barriga'), tor.punto('pecho'), tor.punto('cuello')
        u, n = self._eje(c)
        p = lz.parte()
        p.capsula(cad, bar, 6.0, 6.4, tu, tonos=(1, 2, 3))
        p.capsula(bar, pec, 6.4, 7.6, tu, tonos=(1, 2, 3), pliegues=[(0.4, 1)])
        p.capsula(pec, cue, 7.6, 4.0, tu, tonos=(1, 2, 3))
        # costillas que asoman por el escote (el pecho está abierto en V)
        for k in range(3):
            a0 = mas(mas(pec, u, -2 - k * 2.4), n, 2.5)
            p.linea(a0, mas(a0, n, 3.5 - k * 0.5), P['hueso'], 2 if k == 0 else 1)
        # pectoral de oro: media luna alrededor del cuello con colgantes
        g = lz.parte()
        cen = mas(cue, u, -3)
        arco = [mas(mas(cen, n, 6.5 * math.cos(t)), u, -4.2 * math.sin(t) + 1) for t in
                [math.pi * k / 8 for k in range(0, 9)]]
        for i in range(len(arco) - 1):
            g.capsula(arco[i], arco[i + 1], 1.4, 1.4, oro, tonos=(1, 2, 3))
        for k in (1, 3, 5, 7):
            g.linea(arco[k], mas(arco[k], (0, 2.5)), oro, 2)
            g.pon_m(mas(arco[k], (0, 3)), oro, 3)
        # cinturón
        b0, b1 = mas(mas(cad, u, 2), n, -6.5), mas(mas(cad, u, 2), n, 6.5)
        g.capsula(b0, b1, 1.3, 1.3, oro, tonos=(0, 1, 2))
        # el SELLO de la memoria: medallón con espiral violeta (late con la carga)
        carga = int(pose.extra.get('carga', 0))
        apag = pose.extra.get('apagado') or pose.extra.get('purificado')
        s = mas(mas(pec, n, 4.0), u, 0.5)
        c['sello'] = s
        g.elipse(s, 3.6, 3.6, oro, tonos=(1, 2, 3))
        x, y = g.a_px(s)
        t_hi = 2 if (carga >= 2 and not apag) else 1
        espiral = [(0, 0, t_hi), (1, 0, 1), (1, 1, 0), (0, 1, 1), (-1, 1, 0), (-1, 0, 1), (-1, -1, 1), (0, -1, 1),
                   (1, -1, 1), (2, -1, 0), (2, 0, 1), (2, 1, 0)]
        for dx, dy, t in espiral:
            g.pon(x + dx - 0, y + dy, se, t if not apag else 0, fijo=True)
        return [(p, 'contorno', 0), (g, 'contorno', 0, 1)]

    # ---- cráneo, corona y astas ------------------------------------------------------------------
    def parte_cabeza(self, lz, c, pose):
        P = self.paleta
        hu = P['hueso']
        est = self._cab(c, pose)
        m = c['cab_mapa']
        # cuello: vértebras del torso al cráneo
        p0 = lz.parte()
        cue = c['cuello']
        base = est.punto('cuello', 0, -2)
        p0.capsula(mas(cue, (-1, 3)), base, 2.2, 2.0, hu, tonos=(1, 2, 3))
        for k in range(3):
            t = (k + 0.5) / 3
            p0.pon_m((cue[0] - 1 + (base[0] - cue[0] + 1) * t, cue[1] + 3 + (base[1] - cue[1] - 3) * t), hu, 0)
        # astas (la lejana más oscura, detrás del cráneo)
        al = lz.parte()
        ac = lz.parte()
        for capa, nombre, a0, giro in ((al, 'asta_l', 168, 40), (ac, 'asta_c', 200, 26)):
            r0 = est.punto(nombre)
            haz = curva(r0, a0 + pose.cabeza * 0.5, 25, giro, 6)
            trazo(capa, haz, 2.3, 0.9, hu, tonos=(1, 2, 3))
            # candiles: salen del haz hacia arriba y un poco adelante, curvándose
            for i, largo, ang in ((1, 6, 140), (3, 9, 160), (5, 6, 178)):
                trazo(capa, curva(haz[i], ang + pose.cabeza * 0.5, largo, 22, 3), 1.5, 0.6, hu, tonos=(1, 2, 3))
            capa.pon_m(haz[0], hu, 0)
        cr = lz.parte()
        purif = pose.extra.get('purificado')
        apag = pose.extra.get('apagado')
        rep = None
        if purif:
            rep = {'g': ('oro', 3, 'f'), 'G': ('oro', 2, 'f')}
        elif apag:
            rep = {'g': ('llama', 1, 'f'), 'G': ('llama', 0, 'f')}
        e = cr.estampa(m, c['cuello'], c['M_cabeza'], 'cuello', reemplazos=rep)
        c['cabeza'] = e
        return [(al, 'contorno', 1), (p0, 'contorno', 0), (cr, 'contorno', 0, 1), (ac, 'contorno', 0)]

    # ---- efectos: llama del olvido, energía, destellos, mareo ----------------------------------------
    def retoques(self, lz, c, pose):
        P = self.paleta
        ex = pose.extra
        e = c.get('cabeza')
        f = float(ex.get('fase', 0))
        purif = ex.get('purificado')
        apag = ex.get('apagado')
        llama = P['oro'] if purif else P['llama']
        if e is not None and not ex.get('tendido'):
            self._llama(lz, e.punto('llama', -1, -2), llama, f, chica=bool(apag), alta=int(ex.get('carga', 0)),
                        v=float(ex.get('viento', 0)))
            ojo = e.punto('ojo')
            if int(ex.get('carga', 0)) >= 3 and not apag:
                for k in range(1, 4):
                    x, y = lz.a_px(mas(ojo, (-k * 1.0 - 1, -0.3 * k)))
                    if lz.dentro(x, y) and lz.mat[y, x] < 0:
                        lz.pon(x, y, llama, 3 - k, fx=True)
        carga = int(ex.get('carga', 0))
        if carga >= 3 and not apag and 'sello' in c:
            anillo(lz, c['sello'], 6, P['sello'], 1, paso=2, fase=int(f))
        orbe = ex.get('orbe')
        if orbe is not None:
            w1, w2 = c['brazo_c']['muneca'], c['brazo_l']['muneca']
            cen = ((w1[0] + w2[0]) / 2 + 4, (w1[1] + w2[1]) / 2 - 2)
            r = 2 + carga * 0.7
            for y in range(-4, 5):
                for x in range(-4, 5):
                    d = math.hypot(x, y)
                    if d <= r:
                        px, py = lz.a_px((cen[0] + x, cen[1] + y))
                        lz.pon(px, py, llama, 3 if d < r * 0.45 else (2 if d < r * 0.8 else 1), fx=True)
            anillo(lz, cen, r + 2.5, llama, 1, paso=2, fase=int(orbe))
            for k in range(3):
                a = orbe * 0.9 + k * 2.1
                chispa(lz, (cen[0] + 8 * math.cos(a), cen[1] + 6 * math.sin(a)), llama, 1)
        des = ex.get('destello')
        if des:
            b = c['brazo_c']
            pt = mas(b['muneca'], dir_ang(b['ang_ante']), 6)
            chispa(lz, pt, llama, 3 if des >= 2 else 2)
            if des >= 2:
                for dx, dy in ((2, 2), (2, -2), (-2, 2), (-2, -2)):
                    x, y = lz.a_px(mas(pt, (dx, dy)))
                    lz.pon(x, y, llama, 1, fx=True)
                anillo(lz, pt, 5, llama, 2, paso=2)
        est = ex.get('estela')
        if est:
            b = c['brazo_c']
            h = b['hombro']
            for k in range(1, 6):
                a = b['ang_ante'] + 18 * k + (6 if est == 2 else 0)
                L = self.L_brazo + self.L_ante - 2
                pt = mas(h, dir_ang(a), L)
                x, y = lz.a_px(pt)
                for j in range(3 - k // 2):
                    if lz.dentro(x - j, y) and lz.mat[y, x - j] < 0:
                        lz.pon(x - j, y, llama, max(0, 3 - k // 2 - j), fx=True)
        ch = ex.get('chispas')
        if ch is not None and e is not None:
            cen = e.punto('frente')
            pts = [(-26, -4), (18, -20), (26, 6), (-30, 14), (8, -26), (-14, -22), (32, -10), (-34, 0), (0, 12)]
            for j, (dx, dy) in enumerate(pts):
                if (j + ch) % 2 == 0:
                    chispa(lz, (cen[0] + dx, cen[1] + dy - ch * 2), llama, 1 if j % 3 else 2)
        mareo = ex.get('mareo')
        if mareo is not None and e is not None:
            cen = e.punto('llama', 0, -6)
            for k in range(3):
                a = mareo * 0.8 + k * 2.09
                chispa(lz, (cen[0] + 11 * math.cos(a), cen[1] + 3.5 * math.sin(a)), P['oro'], 1, 3, 2)
        if ex.get('polvo'):
            k = int(ex['polvo'])
            sy = self.suelo_y(c)
            for s in (-1, 1):
                for j in range(4):
                    x, y = lz.a_px((c['cadera'][0] + s * (10 + j * 4 + k * 3), sy - 1 - (j % 2) - k))
                    lz.pon(x, y, P['pelo'], 3 - (j % 2), fx=True)
                    lz.pon(x + s, y, P['pelo'], 2, fx=True)

    def _llama(self, lz, base, mat, f, chica=False, alta=0, v=0.0):
        """Llama que flamea (efecto sin contorno): núcleo claro, borde oscuro, lenguas que se desprenden."""
        h = (6 if chica else 13 + alta) + int(2 * math.sin(f * 1.7))
        w = 2.4 if chica else 4.2
        for r in range(h):
            t = r / max(1, h - 1)
            ancho = w * math.sin(math.pi * min(1.0, 0.25 + t * 0.9)) * (1 - t) ** 0.4
            off = math.sin(f * 1.3 + r * 0.45) * 1.6 * t - v * 4 * t * t
            for xx in range(-int(ancho) - 1, int(ancho) + 2):
                d = abs(xx - off) / max(0.6, ancho)
                if d > 1.0:
                    continue
                ton = 3 if (d < 0.35 and t < 0.75) else (2 if d < 0.7 else 1)
                if chica:
                    ton = max(0, ton - 1)
                x, y = lz.a_px((base[0] + xx, base[1] - r))
                lz.pon(x, y, mat, ton, fx=True)
        if not chica:
            for k in range(2):
                yy = h + 2 + ((int(f) * 2 + k * 3) % 5)
                xx = math.sin(f + k * 2) * 2 - v * 3
                x, y = lz.a_px((base[0] + xx, base[1] - yy))
                lz.pon(x, y, mat, 2, fx=True)
                lz.pon(x, y - 1, mat, 1, fx=True)


BASE = Pose(tronco=10, cabeza=-4, hombro_c=18, codo_c=40, hombro_l=-8, codo_l=30,
            muslo_c=8, rodilla_c=6, pie_c=0, muslo_l=-6, rodilla_l=4, pie_l=0, mano_c='garra', mano_l='garra')


def animaciones():
    A = animaciones_jefe(BASE, paso=0.95, lean=4, lean_correr=16)
    return A


PERSONAJE = ReyOlvido()

# Variantes del kit (ver generar.py): la primera es la que dibuja PERSONAJE.cuadro tal cual.
VARIANTES_KIT = ['corona', 'sin_corona']


def cuadro_variante(v, pose):
    _VAR['v'] = v
    try:
        return PERSONAJE.cuadro(pose)
    finally:
        _VAR['v'] = VARIANTES_KIT[0]
