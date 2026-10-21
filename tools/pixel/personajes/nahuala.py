"""La Nahuala (jefa del Nivel 6, CDMX, ~100 px).

Diseño de la hoja Codex `nahuala.png`: mujer alta con el rostro pintado de calavera (cuencas oscuras, dientes),
penacho enorme de plumas gris azulado en abanico, diadema de oro con cuentas de jade, cabello negro largo,
abrigo largo color óxido abierto sobre un vestido verde azulado con ribetes dorados, puños verdes con oro,
uñas largas y botas oscuras. Sus ojos son de animal (ámbar, brillan). Es nahual: su zarpazo es semi-animal
(se agazapa, garras al frente, deja una estela). Sus trucos: copias ilusorias entre humo negro (conjuro) y
trampas de obsidiana que brotan del suelo (invocar). El fuego la alimenta (en el juego FUEGO la cura), así que
nada en su diseño la muestra dañada por el fuego.

Morir = liberada (sin violencia): se arrodilla, el humo negro sale de ella, el brillo animal de los ojos se
apaga y la envuelve una luz verde clara."""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas  # noqa: E402
from humanoide import Humanoide  # noqa: E402
from anim_humano import animaciones_humanas  # noqa: E402
from personajes._jefes1 import chispas, garra_larga, humo, pluma, _h  # noqa: E402

PAL = Paleta([
    Material('piel',     ['#4a2a1e', '#7a4a34', '#a86e4e', '#cc9470'],             '#200a06'),
    Material('calavera', ['#8a8278', '#cfc6b4', '#f0ead8'],                        '#200a06'),
    Material('pluma',    ['#141a24', '#243040', '#3a4a5c', '#5a6e80'],             '#0c0e14'),
    Material('manto',    ['#3a160e', '#5e2414', '#86381c', '#ae5428'],             '#200a06'),
    Material('vestido',  ['#0e2a26', '#1a4440', '#2a6058', '#3e7c6a'],             '#0c0e14'),
    Material('oro',      ['#7a5418', '#c08a2c', '#ecc45a'],                        '#3a160e'),
    Material('ojo',      ['#a0500a', '#ffc030', '#fff0b0'],                        '#3a160e'),
    Material('obsidiana', ['#0c0e14', '#3a2a4a', '#8a60c0'],                       '#0c0e14'),
    Material('libre',    ['#2a6058', '#9affc0', '#e8fff0'],                        '#2a6058'),
])

ANCLAS = {'o': (0, 0), 'barriga': (0, -10), 'pecho': (1, -19), 'hombro_c': (1, -25), 'hombro_l': (-3, -25),
          'cuello': (2, -29), 'nuca': (-2, -28)}
_TORSO = Mapa(['.'], {}, PAL, dict(ANCLAS))


def _uni(a, b):
    v = (b[0] - a[0], b[1] - a[1])
    L = math.hypot(*v) or 1.0
    return (v[0] / L, v[1] / L)


def _ang(v) -> float:
    return math.degrees(math.atan2(v[0], v[1]))


class Nahuala(Humanoide):
    id = 'nahuala'
    tipo = 'humanoide'
    fw, fh = 120, 124
    pivote = (60, 120)
    alto = 100
    L_muslo, L_pierna, L_pie, alto_tobillo = 20, 19, 11, 4
    L_brazo, L_ante = 15, 14
    sep_cadera = (1.5, -1.5)
    torso_cizalla_max = 0.0
    paleta = PAL

    def torso_mapa(self, pose):
        return _TORSO

    def orden(self, pose):
        o = ['pelo', 'abrigo_l', 'brazo_l', 'pierna_l', 'pierna_c', 'vestido', 'torso', 'abrigo', 'cabeza', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    def ejes(self, c):
        cad = c['cadera_torso']
        cue = c['torso'].punto('cuello')
        u = _uni(cad, cue)
        return u, (-u[1], u[0])

    # ---- piernas: medias oscuras y botas (casi todo lo tapa el vestido) ------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        pl = P['pluma']
        capa.capsula(p['talon'], p['punta'], 2.4, 2.0, pl, tonos=(0, 1, 2))
        capa.capsula(mas(p['talon'], (0, -2)), p['tobillo'], 2.2, 2.2, pl, tonos=(0, 1, 2))
        capa.capsula(p['rodilla'], p['tobillo'], 2.6, 2.1, pl, tonos=(0, 1, 2), bandas=[(0.82, 0.9, P['oro'], (0, 1, 1))])
        capa.capsula(p['cadera'], p['rodilla'], 3.6, 2.7, pl, tonos=(0, 1, 2))

    # ---- brazos: manga de abrigo, puño verde con oro, mano con uñas largas ---------------------------
    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        ma = P['manto']
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        if mano.startswith('sena_'):
            mano = 'abierta'
        if mano not in ('garra', 'abierta', 'puno'):
            mano = 'puno'
        capa.capsula(b['codo'], b['muneca'], 2.7, 2.6, ma, tonos=(1, 2, 3),
                     bandas=[(0.66, 0.78, P['oro'], (0, 1, 2)), (0.78, 1.1, P['vestido'], (1, 2, 3))])
        capa.capsula(b['hombro'], b['codo'], 3.2, 2.7, ma, tonos=(1, 2, 3), pliegues=[(0.6, 0)])
        capa.elipse(b['codo'], 2.6, 2.6, ma, tonos=(1, 2, 3))
        garra_larga(capa, P, b, mano, una='calavera', tam=1.1, largo_una=3 if mano == 'garra' else 1)

    # ---- cabello largo (detrás de todo) ----------------------------------------------------------------
    def parte_pelo(self, lz, c, pose):
        P = self.paleta
        p = lz.parte()
        u, f = self.ejes(c)
        cue = c['torso'].punto('nuca')
        flujo = pose.extra.get('capa', 0)
        a = mas(cue, (-1, -6))
        b = mas(mas(cue, u, -18), f, -3 - flujo * 4)
        cc = mas(b, (-flujo * 4, 6))
        p.capsula(a, b, 4.2, 3.6, P['pluma'], tonos=(0, 1, 2), pliegues=[(0.4, 0), (0.7, 0)])
        p.capsula(b, cc, 3.6, 1.5, P['pluma'], tonos=(0, 1, 1))
        return [(p, 'contorno', 0)]

    # ---- vestido verde hasta el tobillo -----------------------------------------------------------------
    def parte_vestido(self, lz, c, pose):
        P = self.paleta
        ve, oro = P['vestido'], P['oro']
        u, f = self.ejes(c)
        cad = c['cadera_torso']
        tobs = [c['pierna_c']['tobillo'], c['pierna_l']['tobillo']]

        def proy(q):
            return (q[0] - cad[0]) * f[0] + (q[1] - cad[1]) * f[1]
        adel, atr = max(tobs, key=proy), min(tobs, key=proy)
        flujo = pose.extra.get('capa', 0)
        top_b = mas(mas(cad, u, 6), f, -6.0)
        top_f = mas(mas(cad, u, 6), f, 5.6)
        hip_f = mas(cad, f, 7.0)
        hip_b = mas(cad, f, -7.0)
        hem_f = mas(mas(adel, f, 5.0), (0, 1), -1.5)
        hem_b = mas(mas(atr, f, -5.0 - flujo * 3), (0, 1), -1.5)
        mid = ((hem_f[0] + hem_b[0]) / 2, max(hem_f[1], hem_b[1]) + 0.5)
        p = lz.parte()
        m = p.poligono([top_b, top_f, hip_f, hem_f, mid, hem_b, hip_b], ve, sombreado=(1, 2, 3), ks=2)
        # pliegues
        for k, t in enumerate((0.25, 0.5, 0.75)):
            a = (hip_b[0] + (hip_f[0] - hip_b[0]) * t, hip_b[1] + (hip_f[1] - hip_b[1]) * t + 2)
            bq = (hem_b[0] + (hem_f[0] - hem_b[0]) * t, hem_b[1] + (hem_f[1] - hem_b[1]) * t - 2)
            p.linea(a, bq, ve, 0 if k != 1 else 2)
        # ribete dorado en el dobladillo (dos filas: oro y sombra) y greca
        ys, xs = m.nonzero()
        for x in set(xs.tolist()):
            col = ys[xs == x]
            yb = col.max()
            p.pon(x, yb, oro, 1)
            p.pon(x, yb - 1, oro, 2 if x % 4 else 0)
            p.pon(x, yb - 2, ve, 0)
        return [(p, 'contorno', 0, 1)]

    # ---- torso: abrigo óxido con canesú verde y collar dorado --------------------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        p = lz.parte()
        tor = c['torso']
        cad = c['cadera_torso']
        ma, ve, oro = P['manto'], P['vestido'], P['oro']
        bar, pec, cue = tor.punto('barriga'), tor.punto('pecho'), tor.punto('cuello')
        u, f = self.ejes(c)
        p.capsula(mas(cad, u, 2), bar, 6.4, 6.0, ma, tonos=(1, 2, 3))
        p.capsula(bar, pec, 6.0, 7.0, ma, tonos=(1, 2, 3))
        p.capsula(pec, mas(cue, u, -1), 7.0, 5.0, ma, tonos=(1, 2, 3))
        # pechera verde visible al frente (el abrigo va abierto)
        p.poligono([mas(mas(cue, u, -2), f, 1.5), mas(mas(cue, u, -2), f, 5.0), mas(mas(cad, u, 4), f, 6.6),
                    mas(mas(cad, u, 4), f, 2.0)], ve, sombreado=(1, 2, 3), ks=1)
        p.linea(mas(mas(cue, u, -2), f, 1.2), mas(mas(cad, u, 4), f, 1.8), oro, 1)
        # canesú (estola) verde con ribete dorado sobre los hombros
        y0 = mas(cue, u, -1.5)
        p.poligono([mas(y0, f, -6), mas(y0, f, 4.5), mas(mas(y0, u, -7), f, 6.0), mas(mas(y0, u, -8), f, -1),
                    mas(mas(y0, u, -5), f, -7)], ve, sombreado=(1, 2, 3), ks=1)
        for k in range(6):
            t = k / 5
            q = mas(mas(y0, u, -5 - 3 * math.sin(t * math.pi)), f, -7 + 13 * t)
            p.pon_m(q, oro, 2 if k % 2 else 1, fijo=True)
            p.pon_m(mas(q, u, -1), ve, 3 if k % 2 == 0 else 1)
        # cinturón dorado
        p.linea(mas(mas(cad, u, 5), f, -6.4), mas(mas(cad, u, 5.5), f, 6.4), oro, 1)
        p.linea(mas(mas(cad, u, 4), f, -6.4), mas(mas(cad, u, 4.5), f, 6.4), oro, 0)
        c['ejes'] = (u, f)
        return [(p, 'contorno', 0)]

    # ---- faldón del abrigo (detrás de la pierna lejana y delante del vestido) ----------------------
    def _faldon(self, c, pose, lado_atras: bool):
        u, f = self.ejes(c)
        cad = c['cadera_torso']
        flujo = pose.extra.get('capa', 0)
        rods = [c['pierna_c']['rodilla'], c['pierna_l']['rodilla']]

        def proy(q):
            return (q[0] - cad[0]) * f[0] + (q[1] - cad[1]) * f[1]
        atr = min(rods, key=proy)
        adel = max(rods, key=proy)
        y_hem = max(c['pierna_c']['tobillo'][1], c['pierna_l']['tobillo'][1]) - 9
        top_b = mas(mas(cad, u, 7), f, -6.6)
        top_f = mas(mas(cad, u, 6), f, 2.0)
        hem_b = (mas(atr, f, -8 - flujo * 9)[0], y_hem - flujo * 6)
        hem_f = (mas(adel, f, 0.5 - flujo * 2)[0], y_hem + 2)
        return [top_b, top_f, mas(mas(cad, u, -4), f, 3.2), hem_f, ((hem_f[0] + hem_b[0]) / 2, y_hem + 3),
                hem_b, mas(hem_b, (0, -6)), mas(cad, f, -8.2)]

    def parte_abrigo_l(self, lz, c, pose):
        # el faldón por detrás de la pierna lejana: solo la orilla trasera que vuela al correr
        P = self.paleta
        p = lz.parte()
        pts = self._faldon(c, pose, True)
        p.poligono(pts, P['manto'], sombreado=(0, 1, 2), ks=2)
        return [(p, 'contorno', 0)]

    def parte_abrigo(self, lz, c, pose):
        P = self.paleta
        ma, oro = P['manto'], P['oro']
        p = lz.parte()
        pts = self._faldon(c, pose, False)
        m = p.poligono(pts, ma, sombreado=(1, 2, 3), ks=2)
        # pliegues que bajan del cinturón
        u, f = self.ejes(c)
        cad = c['cadera_torso']
        lin = p.vacia_como()
        fl = pose.extra.get('capa', 0)
        for k, (dx, L) in enumerate(((-4.5, 20), (-1.0, 24), (1.6, 18))):
            a = mas(mas(cad, u, 2), f, dx)
            d = (dx * 0.1 - fl * 0.35 * (1 - k * 0.3), 1)
            n = math.hypot(*d)
            lin.linea(a, mas(a, (d[0] / n, d[1] / n), L), ma, 0 if k != 1 else 3)
        sel = (lin.mat >= 0) & m
        p.ton[sel] = lin.ton[sel]
        # ribete dorado en la orilla delantera y el dobladillo
        ys, xs = m.nonzero()
        for x in set(xs.tolist()):
            col = ys[xs == x]
            p.pon(x, col.max(), oro, 1)
        for y in set(ys.tolist()):
            fila = xs[ys == y]
            p.pon(fila.max(), y, oro, 2 if y % 3 else 1)
        return [(p, 'contorno', 0, 1)]

    # ---- cabeza: calavera pintada, ojos de animal, diadema y penacho ---------------------------------
    def parte_cabeza(self, lz, c, pose):
        P = self.paleta
        ca, pl, oro, ve = P['calavera'], P['pluma'], P['oro'], P['vestido']
        cue = c['cuello']
        ang = math.radians(pose.cabeza + pose.giro + pose.tronco * 0.3)
        R = ((math.cos(ang), -math.sin(ang)), (math.sin(ang), math.cos(ang)))
        cen = mas(cue, (2.5 + pose.extra.get('cab_dx', 0), -8.5 + pose.extra.get('cab_dy', 0)))
        K = 1.32

        def L(dx, dy):
            dx, dy = dx * K, dy * K
            return cen[0] + R[0][0] * dx + R[0][1] * dy, cen[1] + R[1][0] * dx + R[1][1] * dy

        def A(a):
            return a - math.degrees(ang)

        eriza = pose.extra.get('eriza', 0)
        sopla = pose.extra.get('viento', 0)
        capas = []
        # 1) penacho: abanico de plumas largas detrás de la cabeza
        pen = lz.parte()
        n = 13
        for i in range(n):
            t = i / (n - 1)
            base = L(-3.5 - 1.5 * t, -4 + 6 * t)
            a = A(188 + 100 * t) - eriza * 12 * (1 - t) - sopla * (0.3 + 0.7 * t)
            a += ((_h(i, 4) % 7) - 3)
            Lp = 17 + 6 * math.sin(t * math.pi) + eriza * 4 + (_h(i, 9) % 3)
            pluma(pen, base, a, Lp, 2.8, pl, tonos=(1, 2, 3) if i % 2 else (0, 1, 2), raquis=3 if i % 2 else 2,
                  punta=0, curva=-6)
        capas.append((pen, 'contorno', 0))
        # 2) cuello y cara de calavera
        s = lz.parte()
        s.capsula(cue, L(-1, 4), 3.0, 3.2, P['piel'], tonos=(1, 2, 3))
        s.elipse(L(0, -0.5), 6.2 * K, 7.0 * K, ca, tonos=(0, 1, 2))
        s.capsula(L(2, 2), L(5.2, 4.6), 3.0 * K, 2.2 * K, ca, tonos=(0, 1, 2))       # quijada
        # cabello sobre la sien (negro) que enmarca la cara
        s.poligono([L(-6.5, -4), L(-1, -7.5), L(-2, -3), L(-4, 2), L(-6, 6.5)], pl, sombreado=(0, 1, 2), ks=1)
        # diadema: banda de oro que ciñe la frente
        s.capsula(L(-5.5, -3.6), L(3.2, -6.2), 1.1, 1.0, oro, tonos=(0, 1, 2))
        capas.append((s, 'contorno', 0, 1))
        # 3) detalles: cuencas, ojos ámbar, nariz, dientes, diadema
        g = lz.parte()
        libre = pose.extra.get('liberada', 0)
        brillo = pose.extra.get('brillo', 1)
        ex, ey = g.a_px(L(2.4, -1.4))
        for dy in range(-2, 3):
            for dx in range(-2, 4):
                if (dx - 0.5) ** 2 / 9.0 + dy * dy / 5.0 > 1.0:
                    continue
                borde = (dx - 0.5) ** 2 / 9.0 + dy * dy / 5.0 > 0.55
                g.pon(ex + dx, ey + dy, pl, 1 if borde and dy < 0 else 0, fijo=True)
        g.pon(ex - 2, ey + 2, ca, 0, fijo=True)
        if pose.cara in ('parpadeo', 'dolor') or libre:
            g.pon(ex, ey, pl, 1, fijo=True)
            g.pon(ex + 1, ey, pl, 1, fijo=True)
            if libre:   # ojo humano, en paz
                g.pon(ex, ey, P['piel'], 3, fijo=True)
                g.pon(ex + 1, ey, P['piel'], 1, fijo=True)
        else:
            oj = P['ojo']
            g.pon(ex, ey, oj, 1, fijo=True)
            g.pon(ex + 1, ey, oj, 2 if brillo else 1, fijo=True)
            g.pon(ex + 1, ey + 1 if brillo < 2 else ey, oj, 0, fijo=True)
            if brillo >= 2:
                g.pon(ex + 2, ey - 1, oj, 1, fx=True)
                g.pon(ex + 3, ey - 1, oj, 0, fx=True)
                g.pon(ex + 2, ey, oj, 2, fijo=True)
        # nariz de calavera
        nx, ny = g.a_px(L(5.4, 1.4))
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1), (0, -1)):
            g.pon(nx + dx, ny + dy, pl, 0, fijo=True)
        # boca: dientes (líneas verticales) sobre la quijada
        boca = pose.extra.get('boca', 0)
        if pose.cara == 'grito':
            boca = max(boca, 2)
        x0, y0 = g.a_px(L(2.2, 3.6))
        for i in range(5):
            g.pon(x0 + i, y0, pl, 0, fijo=True)
            if boca:
                for j in range(1, boca + 1):
                    g.pon(x0 + i, y0 + j, pl, 0 if i % 2 == 0 or j == boca else 1, fijo=True)
            g.pon(x0 + i, y0 + boca + 1, pl, 0 if i % 2 == 0 else 1, fijo=True)
        g.linea(L(-3, 3.5), L(1.5, 4.0), ca, 0)         # línea del pómulo pintado
        # diadema de oro con cuentas de jade
        for i in range(5):
            q = L(-4.4 + i * 1.9, -4.0 - 0.55 * i)
            g.pon_m(q, ve, 3 if i % 2 else 2, fijo=True)
            if i % 2 == 0:
                g.pon_m(mas(q, (0, -1)), oro, 2, fijo=True)
        g.pon_m(L(-5.4, -2.8), oro, 2, fijo=True)          # broche lateral
        g.pon_m(L(-5.4, -1.8), ve, 3, fijo=True)
        g.pon_m(L(-5.4, -0.8), oro, 1, fijo=True)
        capas.append((g, None, 0))
        c['cabeza_centro'] = cen
        c['ojo'] = L(2.4, -1.4)
        return capas

    # ---- efectos ------------------------------------------------------------------------------------------
    def retoques(self, lz, c, pose):
        P = self.paleta
        ex = pose.extra
        k = int(ex.get('k', 0))
        cen = c.get('cabeza_centro', (0, -80))
        ob = P['obsidiana']
        if ex.get('estela') is not None:
            # estela del zarpazo: tres arcos paralelos (ámbar y violeta) por delante de la mano
            w = c['brazo_c']['muneca']
            e = int(ex['estela'])
            for j in range(3):
                for t in range(10):
                    a = math.radians(-60 + t * 14)
                    r = 13 + j * 3
                    x, y = lz.a_px((w[0] - 4 + math.sin(a) * r * 0.8, w[1] - 8 + math.cos(a) * -r * 0.2 + t * 1.6 + j * 2))
                    if t < 2 + e * 4 and lz.dentro(x, y) and lz.mat[y, x] < 0:
                        lz.pon(x, y, P['ojo'] if j == 1 else ob, 2 if j == 1 else 2, fx=True)
                        if lz.mat[y + 1, x] < 0:
                            lz.pon(x, y + 1, P['ojo'] if j == 1 else ob, 1, fx=True)
        if ex.get('humo') is not None:
            # humo negro de las ilusiones / de la liberación
            hk = int(ex['humo'])
            hcen = ex.get('humo_en', 'lados')
            if hcen == 'arriba':
                humo(lz, mas(cen, (-4, 14)), hk, ob, n=9, radio=6.5, abre=11, sube=8, tonos=(0, 1, 2), semilla=3)
            else:
                for lado in (-1, 1):
                    humo(lz, mas(cen, (lado * 20, 46)), hk, ob, n=5, radio=5, abre=6, sube=4, tonos=(0, 1, 1),
                         semilla=5 + lado)
        if ex.get('obsidiana') is not None:
            # trampas: lajas de obsidiana que brotan del suelo alrededor
            o = ex['obsidiana']
            pie = (0, 0)
            for j, (dx, h) in enumerate(((-30, 14), (-21, 9), (26, 13), (37, 9), (-42, 7), (17, 7))):
                hh = max(0, h * o - (j % 3))
                if hh < 1:
                    continue
                bx, by = lz.a_px((pie[0] + dx, pie[1] - 1))
                for yy in range(int(hh) + 1):
                    w = max(0, int((hh - yy) * 0.45))
                    for xx in range(-w, w + 1):
                        tn = 2 if xx == -w else (1 if xx < 0 else 0)
                        lz.pon(bx + xx + (yy // 3) * (1 if j % 2 else -1), by - yy, ob, tn)
                lz.pon(bx + (int(hh) // 3) * (1 if j % 2 else -1), by - int(hh) - 1, ob, 2, fx=True)
        if ex.get('chispas') is not None:
            chispas(lz, mas(cen, (0, 18)), P['ojo'], int(ex['chispas']), radio=20, n=10, tonos=(1, 2))
        if ex.get('luz') is not None:
            chispas(lz, mas(cen, (-2, 34)), P['libre'], int(ex['luz']), radio=26, n=14, tonos=(1, 2), sube=2.5)
        if ex.get('mareo') is not None:
            kk = int(ex['mareo'])
            for j in range(3):
                a = (j / 3 + kk / 4) * 2 * math.pi
                x, y = lz.a_px((cen[0] + math.cos(a) * 10, cen[1] - 16 + math.sin(a) * 3))
                lz.pon(x, y, P['libre'], 2 if j == 0 else 1, fx=True)
                if j == 0:
                    for ex2, ey2 in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        if lz.mat[y + ey2, x + ex2] < 0:
                            lz.pon(x + ex2, y + ey2, P['libre'], 0, fx=True)


B = Pose(tronco=3, cabeza=-2, hombro_c=8, codo_c=30, hombro_l=-6, codo_l=24,
         muslo_c=6, rodilla_c=4, pie_c=0, muslo_l=-6, rodilla_l=4, pie_l=0, mano_c='puno', mano_l='puno')


def animaciones():
    A = animaciones_humanas(B, paso=0.85, lean_correr=16)
    # Reposo: respira, el penacho se mece, la mano cercana tamborilea las uñas.
    A['reposo'] = Anim([
        B.con(extra={'viento': 0}),
        B.con(hunde=0.5, extra={'viento': 2}),
        B.con(hunde=1.0, hombro_c=10, codo_c=34, mano_c='abierta', extra={'viento': 4, 'brillo': 2}),
        B.con(hunde=1.0, hombro_c=10, codo_c=36, mano_c='garra', extra={'viento': 3}),
        B.con(hunde=0.5, extra={'viento': 1}),
        B.con(cara='parpadeo', extra={'viento': -1}),
    ], 5, True)
    # Caminar / correr: el abrigo ondea.
    A['caminar'] = Anim([p.con(extra={'capa': 0.3 + 0.2 * math.sin(i / 8 * 2 * math.pi), 'viento': 3})
                         for i, p in enumerate(A['caminar'].poses)], 9, True)
    A['correr'] = Anim([p.con(mano_c='garra', mano_l='garra',
                              extra={'capa': 1.0 + 0.3 * math.sin(i / 8 * 2 * math.pi), 'viento': 10, 'eriza': 0.3})
                        for i, p in enumerate(A['correr'].poses)], 13, True)
    # Golpe = anticipación del zarpazo: se agazapa como animal, garras atrás, ojos encendidos.
    g0 = B.con(tronco=26, cabeza=-16, hombro_c=-40, codo_c=80, hombro_l=-60, codo_l=70, muslo_c=40, rodilla_c=70,
               pie_c=0, muslo_l=-16, rodilla_l=50, pie_l=-10, mano_c='garra', mano_l='garra', hunde=1,
               extra={'brillo': 2, 'eriza': 0.6, 'capa': 0.5, 'boca': 1})
    g1 = g0.con(tronco=34, hombro_c=-60, hombro_l=-76, muslo_c=50, rodilla_c=86, hunde=2,
                extra={'eriza': 1.0, 'capa': 0.7, 'boca': 2})
    A['golpe'] = Anim([g0, g1, g1.con(tronco=36, hunde=2.5)], 7, False)
    # Ataque = zarpazo: se lanza y rasga de arriba a abajo, deja estela; se recupera.
    z0 = B.con(tronco=30, cabeza=-6, hombro_c=150, codo_c=30, hombro_l=-40, codo_l=40, muslo_c=50, rodilla_c=40,
               pie_c=10, muslo_l=-34, rodilla_l=30, pie_l=-30, mano_c='garra', mano_l='garra', cara='grito',
               extra={'brillo': 2, 'eriza': 0.8, 'capa': 1.0, 'boca': 2, 'estela': 0})
    z1 = z0.con(tronco=40, hombro_c=80, codo_c=6, hombro_l=-60, extra={'estela': 1, 'capa': 1.2})
    z2 = z0.con(tronco=44, cabeza=4, hombro_c=30, codo_c=10, hombro_l=-50, extra={'estela': 2, 'capa': 0.9, 'boca': 1})
    z3 = B.con(tronco=20, hombro_c=20, codo_c=30, muslo_c=30, rodilla_c=30, muslo_l=-20, rodilla_l=20,
               mano_c='garra', extra={'capa': 0.4})
    A['ataque'] = Anim([z0, z1, z2, z3], 11, False)
    # Conjuro = copias ilusorias: teje con las manos frente al pecho, humo negro brota a sus lados.
    cj = B.con(tronco=-2, cabeza=-4, hombro_c=60, codo_c=70, hombro_l=40, codo_l=80, mano_c='abierta',
               mano_l='abierta', muslo_c=10, muslo_l=-8, cara='concentrado')
    A['conjuro'] = Anim([
        cj.con(extra={'humo': 0, 'brillo': 2, 'viento': 2}),
        cj.con(hombro_c=74, codo_c=56, hombro_l=30, codo_l=90, hunde=0.5, extra={'humo': 1, 'brillo': 2, 'viento': 4}),
        cj.con(hombro_c=50, codo_c=84, hombro_l=50, codo_l=66, hunde=1, extra={'humo': 2, 'brillo': 2, 'viento': 6}),
        cj.con(hombro_c=66, codo_c=64, hombro_l=36, codo_l=84, hunde=0.5, extra={'humo': 3, 'brillo': 2, 'viento': 3}),
    ], 7, True)
    # Invocar (entrada / trampas): alza los brazos, ríe; la obsidiana brota del suelo.
    iv = B.con(tronco=-8, cabeza=-16, hombro_c=112, codo_c=26, hombro_l=166, codo_l=20, mano_c='garra',
               mano_l='garra', muslo_c=12, muslo_l=-12, cara='grito')
    A['invocar'] = Anim([
        iv.con(extra={'obsidiana': 0.3, 'brillo': 2, 'eriza': 0.6, 'boca': 2, 'chispas': 0}),
        iv.con(hombro_c=120, hombro_l=172, hunde=1, extra={'obsidiana': 0.7, 'brillo': 2, 'eriza': 0.9, 'boca': 3,
                                                        'chispas': 1}),
        iv.con(hombro_c=118, hombro_l=170, extra={'obsidiana': 1.0, 'brillo': 2, 'eriza': 1.0, 'boca': 2,
                                                  'chispas': 2}),
        iv.con(hombro_c=110, hombro_l=164, hunde=0.5, extra={'obsidiana': 1.0, 'brillo': 2, 'eriza': 0.8, 'boca': 3,
                                                            'chispas': 3}),
    ], 6, True)
    # Lanzar (laja de obsidiana): brazo atrás y suelta.
    A['lanzar'] = Anim([
        B.con(tronco=-8, hombro_c=170, codo_c=60, hombro_l=50, codo_l=30, muslo_c=20, muslo_l=-14, mano_c='garra',
              extra={'brillo': 2, 'capa': 0.3}),
        B.con(tronco=16, hombro_c=96, codo_c=10, hombro_l=-20, codo_l=30, muslo_c=26, rodilla_c=16, muslo_l=-20,
              mano_c='abierta', cara='grito', extra={'capa': 0.7, 'boca': 2}),
        B.con(tronco=18, hombro_c=40, codo_c=20, hombro_l=-30, codo_l=30, muslo_c=24, rodilla_c=16, muslo_l=-20,
              mano_c='abierta', extra={'capa': 0.5})], 9, False)
    A['disparar'] = A['lanzar']
    # Daño: sacudida, el penacho se agita.
    A['dano'] = Anim([
        B.con(tronco=-16, cabeza=-14, hombro_c=-36, codo_c=40, hombro_l=-44, codo_l=40, muslo_c=14, rodilla_c=10,
              cara='dolor', hunde=1, extra={'viento': -8, 'capa': -0.3, 'boca': 2}),
        B.con(tronco=-6, cabeza=-6, hombro_c=-14, codo_c=30, hombro_l=-20, codo_l=30, cara='dolor',
              extra={'viento': -4}),
    ], 8, False)
    # Aturdido (VERDAD): se lleva la mano a la cara, tambalea; destellos girando.
    at = B.con(tronco=12, cabeza=14, hombro_c=120, codo_c=120, hombro_l=10, codo_l=30, mano_c='abierta',
               muslo_c=14, rodilla_c=20, muslo_l=-10, rodilla_l=14, cara='dolor')
    A['aturdido'] = Anim([at.con(extra={'mareo': 0}), at.con(tronco=16, cabeza=20, hunde=1, extra={'mareo': 1}),
                          at.con(tronco=10, cabeza=10, extra={'mareo': 2}),
                          at.con(tronco=14, cabeza=16, hunde=1, extra={'mareo': 3})], 5, True)
    # Agotada: de rodillas, una mano en el suelo, jadea; el brillo de los ojos parpadea.
    ag = B.con(tronco=40, cabeza=18, hombro_c=50, codo_c=10, hombro_l=20, codo_l=20, muslo_c=70, rodilla_c=120,
               pie_c=0, muslo_l=10, rodilla_l=110, pie_l=-60, mano_c='abierta', mano_l='abierta')
    A['agotado'] = Anim([ag.con(extra={'brillo': 0}), ag.con(hunde=1, cabeza=22, extra={'brillo': 0}),
                         ag.con(hunde=1.5, cabeza=24, cara='parpadeo'), ag.con(hunde=0.5, extra={'brillo': 0})],
                        4, True)
    # Liberada (morir en el juego = la CALMA la libera) y purificar: el humo negro sale de ella, luz verde.
    ar = B.con(tronco=10, cabeza=6, hombro_c=40, codo_c=60, hombro_l=36, codo_l=64, muslo_c=70, rodilla_c=120,
               pie_c=0, muslo_l=10, rodilla_l=110, pie_l=-60, mano_c='abierta', mano_l='abierta')
    A['morir'] = Anim([
        A['dano'].poses[0],
        ag.con(extra={'humo': 0, 'humo_en': 'arriba', 'brillo': 0}),
        ar.con(extra={'humo': 1, 'humo_en': 'arriba', 'luz': 0}),
        ar.con(cabeza=-4, tronco=4, extra={'humo': 2, 'humo_en': 'arriba', 'luz': 1, 'liberada': 1}),
        ar.con(cabeza=-8, tronco=2, hombro_c=50, codo_c=70, extra={'humo': 3, 'humo_en': 'arriba', 'luz': 2,
                                                                  'liberada': 1}),
        ar.con(cabeza=-8, tronco=2, hombro_c=50, codo_c=70, cara='parpadeo', extra={'luz': 3, 'liberada': 1}),
    ], 5, False)
    A['purificar'] = Anim(A['morir'].poses[2:], 5, False)
    # Esquivar: paso atrás felino, el abrigo vuela.
    A['esquivar'] = Anim([
        B.con(tronco=20, muslo_c=40, rodilla_c=70, muslo_l=10, rodilla_l=60, hombro_c=-50, hombro_l=-60, hunde=2,
              mano_c='garra', mano_l='garra', extra={'capa': 0.8}),
        B.con(tronco=-10, dx=-4, muslo_c=30, rodilla_c=60, pie_c=-30, muslo_l=-10, rodilla_l=40, pie_l=-40,
              hombro_c=60, codo_c=40, hombro_l=40, codo_l=40, mano_c='garra', mano_l='garra',
              extra={'capa': -0.4, 'alzar': 5, 'eriza': 0.6}),
        B.con(tronco=24, dx=-6, muslo_c=36, rodilla_c=60, muslo_l=-20, rodilla_l=40, mano_c='garra', hunde=1,
              extra={'capa': 0.2, 'brillo': 2}),
    ], 12, False)
    A['interactuar'] = Anim([B.con(tronco=8, hombro_c=56, codo_c=30, mano_c='abierta'),
                             B.con(tronco=12, hombro_c=76, codo_c=10, mano_c='abierta', hunde=1)], 5, False)
    return A


PERSONAJE = Nahuala()
