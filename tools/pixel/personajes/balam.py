"""Balam (~40 px): el gato compañero (Nivel 3 en adelante). Diseño de su hoja Codex: gato negro "alebrije" con
máscara de calavera blanca en la cara, ojo verde enorme con aro rosa y ceja turquesa, orejas con interior rosa,
cempasúchiles naranjas y hojas turquesa en el costado, patas blancas y cola gruesa enroscada con franjas rosas
y punta blanca.

Cuadrúpedo con el rig de `_criaturas.Cuadrupedo` (patas por cinemática inversa). La cabeza es grande (proporción
tierna) y se dibuja con primitivas en un marco local que gira con `cabeza`; las flores y hojas se pintan en
coordenadas del lomo, así acompañan al cuerpo cuando se estira o se encorva."""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Material, Paleta, dir_ang, mas  # noqa: E402
from personajes._criaturas import Cuadrupedo, PoseQ, chispas, con_patas, galope  # noqa: E402

PAL = Paleta([
    Material('pelo',    ['#1e1c24', '#2e2c34', '#45434a'],             '#120e1a'),
    Material('hueso',   ['#9aa0bc', '#dcdff0', '#fff4cc'],             '#2e2c34'),
    Material('verde',   ['#22482c', '#5a8a46', '#8aff6a'],             '#120e1a'),
    Material('rosa',    ['#5a0a3a', '#a8125e', '#e8207e', '#ff6ab0'],  '#3a0a28'),
    Material('naranja', ['#7a3a1a', '#d0742c', '#f2a640', '#ffd77a'],  '#3a1a18'),
    Material('turq',    ['#0a3a40', '#128a8a', '#2ad0c0', '#9af8e8'],  '#0a3a40'),
])


def flor(capa, centro, P, grande=True):
    """Cempasúchil: centro amarillo, pétalos naranjas con huecos en diagonal (detalle fijo)."""
    na = P['naranja']
    x0, y0 = capa.a_px(centro)
    r = 2 if grande else 1
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            d = abs(dx) + abs(dy)
            if grande and (abs(dx) == 2 and abs(dy) == 2):
                continue
            if d > (3 if grande else 1):
                continue
            if grande and d == 3 and (dx + dy) % 2 == 0:
                continue
            if d == 0:
                capa.pon(x0, y0, na, 3, fijo=True)
            elif d == 1:
                capa.pon(x0 + dx, y0 + dy, na, 2, fijo=True)
            else:
                capa.pon(x0 + dx, y0 + dy, na, 1, fijo=True)


class Balam(Cuadrupedo):
    id = 'balam'
    tipo = 'criatura'
    fw, fh = 64, 48
    pivote = (32, 45)
    alto = 40
    paleta = PAL
    L_lomo = 15
    alto_cuerpo = 14.5
    del_seg = (6.0, 5.5, 2.2)
    tra_seg = (6.5, 6.0, 4.0)
    alto_pata = 1.0
    sep_patas = 1.5
    L_cuello = 5.5
    cola_n, cola_L = 8, 2.7

    # ---- patas: finas, negras, con calcetines blancos --------------------------------------------
    def pata(self, capa, p, lado, delantera, pose):
        P = self.paleta
        pe, hu, tu = P['pelo'], P['hueso'], P['turq']
        t = (0, 1, 2)
        a3 = math.radians(p['a3'])
        fwd = (math.cos(a3), -math.sin(a3))      # hacia la punta de la pata
        # almohadilla blanca
        capa.capsula(mas(p['pie'], fwd, -0.6), mas(p['pie'], fwd, 1.6), 1.3, 1.2, hu, tonos=(0, 1, 2))
        capa.capsula(p['muneca'], p['pie'], 1.3, 1.3, hu if delantera else pe, tonos=(0, 1, 2) if delantera else t)
        if delantera:
            capa.capsula(p['medio'], p['muneca'], 1.4, 1.3, pe, tonos=t)
            capa.capsula(p['raiz'], p['medio'], 2.2, 1.6, pe, tonos=t)
            # franja turquesa en el antebrazo (patrón del alebrije)
            if lado == 'c':
                m = mas(p['medio'], (p['muneca'][0] - p['medio'][0], p['muneca'][1] - p['medio'][1]), 0.45)
                capa.pon_m(m, tu, 2, fijo=True)
                capa.pon_m(mas(m, (0, 1)), tu, 1, fijo=True)
        else:
            capa.capsula(p['medio'], p['muneca'], 1.5, 1.3, pe, tonos=t)
            capa.capsula(p['raiz'], p['medio'], 3.4, 2.0, pe, tonos=t)
            if lado == 'c':
                m = mas(p['raiz'], (p['medio'][0] - p['raiz'][0], p['medio'][1] - p['raiz'][1]), 0.55)
                capa.linea(mas(m, (-1, -1)), mas(m, (1, 1)), tu, 2, fijo=True)

    # ---- cuerpo: anca redonda, pecho, panza; flores y hojas del alebrije ------------------------
    def cuerpo(self, p, c, pose):
        P = self.paleta
        pe, hu, tu, na, ro = P['pelo'], P['hueso'], P['turq'], P['naranja'], P['rosa']
        H, S, n = c['cadera'], c['hombro'], c['n']
        v = (S[0] - H[0], S[1] - H[1])

        def Lc(t, h):
            return mas(mas(H, v, t), n, h)

        enc = pose.extra.get('encorva', 0)   # lomo arqueado (susto, esquivar)
        t3 = (0, 1, 2)
        p.capsula(Lc(0.05, 0.6 + enc * 0.5), Lc(0.95, 0.4 + enc * 0.5), 4.4, 4.6, pe, tonos=t3)
        p.elipse(Lc(0.5, 1.2 + enc * 1.6), 5.0, 3.6 + enc * 0.6, pe, tonos=t3)
        p.elipse(Lc(-0.02, 0.6), 4.8, 4.8, pe, tonos=t3)          # anca
        p.elipse(Lc(1.02, 0.2), 4.4, 5.0, pe, tonos=t3)           # pecho
        # babero blanco bajo el cuello
        p.elipse(Lc(1.18, -1.6), 2.0, 2.6, hu, tonos=(0, 1, 2))
        # hojas turquesa a lo largo del lomo y una amarilla
        for (t0, h0, t1, h1, mat, ton) in ((0.25, 2.6, 0.55, 3.6, tu, 2), (0.55, 3.4, 0.8, 2.4, tu, 3),
                                           (0.3, 0.6, 0.5, 2.0, tu, 1), (0.6, 0.8, 0.75, 2.0, na, 3)):
            p.linea(Lc(t0, h0), Lc(t1, h1), mat, ton, fijo=True)
        p.linea(Lc(0.62, -1.6), Lc(0.8, -0.6), tu, 2, fijo=True)
        p.pon_m(Lc(0.4, -2.2), ro, 2, fijo=True)
        # cempasúchiles
        flor(p, Lc(0.08, 0.6), P, True)
        flor(p, Lc(0.82, 0.8), P, True)
        flor(p, Lc(0.45, -1.4), P, False)

    # ---- cola gruesa con franjas rosas y punta blanca -------------------------------------------
    def cola(self, capa, pts, pose):
        P = self.paleta
        n = len(pts) - 1
        for i in range(n):
            r0 = 1.9 - 0.5 * i / n
            r1 = 1.9 - 0.5 * (i + 1) / n
            if i == n - 1:
                mat, ts = P['hueso'], (0, 1, 2)
            elif i % 2 == 1:
                mat, ts = P['rosa'], (1, 2, 3)
            else:
                mat, ts = P['pelo'], (0, 1, 2)
            capa.capsula(pts[i], pts[i + 1], r0, r1, mat, tonos=ts)

    # ---- cabeza: cráneo negro, máscara de calavera, ojo enorme, orejas ---------------------------
    def cabeza(self, lz, c, pose):
        P = self.paleta
        pe, hu, ve, ro, na, tu = P['pelo'], P['hueso'], P['verde'], P['rosa'], P['naranja'], P['turq']
        cen = c['cuello1']
        ang = math.radians(pose.cabeza + pose.giro)
        R = np.array([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])

        K = 1.22   # cabeza grande (proporción tierna, como en su hoja Codex)

        def L(dx, dy):
            q = R @ np.array([dx * K, dy * K])
            return cen[0] + q[0], cen[1] + q[1]

        orej = pose.orejas   # 0 = paradas, 1 = hacia atrás (miedo, dolor)
        # oreja lejana (detrás)
        f = lz.parte()
        f.poligono([L(-4.5, -3), L(-3.5 - 3 * orej, -10.5 + 4 * orej), L(-0.5, -4.5)], pe, sombreado=(0, 0, 1), ks=1)
        p = lz.parte()
        # cuello corto
        p.capsula(c['cuello0'], L(-1.5, 1.5), 3.4, 3.4, pe, tonos=(0, 1, 2))
        # cráneo
        p.elipse(L(0, 0), 6.0 * K, 5.4 * K, pe, tonos=(0, 1, 2))
        # hocico
        p.elipse(L(4.0, 2.2), 2.8 * K, 2.2 * K, pe, tonos=(0, 1, 2))
        # oreja cercana con interior rosa
        o = lz.parte()
        o.poligono([L(-3.2, -2.5), L(-1.5 - 3 * orej, -11 + 4.5 * orej), L(2.2, -4.2)], pe, sombreado=(0, 1, 2), ks=1)
        o.poligono([L(-1.8, -4), L(-1.2 - 2.6 * orej, -9 + 3.8 * orej), L(0.8, -4.6)], ro, sombreado=(1, 2, 3), ks=1)
        # máscara de calavera (lado de la cara)
        m = lz.parte()
        m.elipse(L(2.2, 0.4), 4.0 * K, 4.0 * K, hu, tonos=(1, 2, 2), sombra=-0.6)
        m.elipse(L(4.6, 2.4), 1.8 * K, 1.4 * K, hu, tonos=(0, 1, 2))
        # ojo: aro rosa, iris verde, pupila, brillo
        g = lz.parte()
        ex, ey = g.a_px(L(2.4, -0.2))
        cerr = pose.ojos in ('cerrado', 'dolor', 'feliz')
        if cerr:
            if pose.ojos == 'feliz':
                g.pon(ex - 1, ey, pe, 0, fijo=True)
                g.pon(ex, ey - 1, pe, 0, fijo=True)
                g.pon(ex + 1, ey, pe, 0, fijo=True)
            else:
                for d in (-1, 0, 1):
                    g.pon(ex + d, ey, pe, 0, fijo=True)
                g.pon(ex + 1, ey - 1 if pose.ojos == 'dolor' else ey + 1, pe, 0, fijo=True)
        else:
            for dx, dy in ((-1, -2), (0, -2), (1, -2), (-2, -1), (2, -1), (-2, 0), (2, 0), (-2, 1), (2, 1),
                           (-1, 2), (0, 2), (1, 2)):
                g.pon(ex + dx, ey + dy, ro, 2 if dy < 0 else 1, fijo=True)
            luna = pose.extra.get('luna', 0)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    g.pon(ex + dx, ey + dy, tu if luna else ve, (2 if luna else 1) if dy >= 0 else 2, fijo=True)
            g.pon(ex + 1, ey, pe, 0, fijo=True)                        # pupila (mira adelante)
            g.pon(ex + 1, ey + 1, P['pelo'], 1, fijo=True)
            g.pon(ex - 1, ey - 1, hu, 2, fijo=True)                    # brillo
            if luna:
                g.pon(ex, ey, tu, 3, fijo=True)
        # ceja turquesa sobre el ojo
        g.linea(L(0.2, -3.6), L(3.8, -3.8), tu, 2, fijo=True)
        g.pon_m(L(0.0, -3.0), tu, 1, fijo=True)
        # mejilla naranja, nariz rosa, boca
        g.pon_m(L(1.0, 2.8), na, 2, fijo=True)
        g.pon_m(L(6.4, 1.4), ro, 3, fijo=True)
        if pose.boca > 0.5:
            for i in range(int(round(pose.boca))):
                g.linea(L(3.6, 3.6 + i), L(6.0, 3.6 + i), ro, 0, fijo=True)
            g.pon_m(L(5.6, 3.4), hu, 2, fijo=True)
            g.pon_m(L(5.6, 3.6 + pose.boca), hu, 2, fijo=True)
        else:
            g.linea(L(4.4, 3.8), L(5.8, 3.4), pe, 0, fijo=True)
        # bigotes
        g.pon_m(L(7.6, 2.6), hu, 0)
        g.pon_m(L(8.4, 3.4), hu, 0)
        c['cabeza_centro'] = cen
        return [(f, 'contorno', 1), (p, 'contorno', 0, 1), (o, 'contorno', 0), (m, None, 0), (g, None, 0)]

    def retoques(self, lz, c, pose):
        P = self.paleta
        ch = pose.extra.get('chispas')
        if ch is not None:
            cen = c.get('cabeza_centro', (0, -24))
            chispas(lz, (cen[0] - 6, cen[1] + 2), P['turq'], int(ch), radio=14, n=8)
        z = pose.extra.get('zzz')
        if z is not None:
            cen = c.get('cabeza_centro', (0, -12))
            x, y = lz.a_px((cen[0] + 4 + z, cen[1] - 8 - z * 2))
            for dx, dy in ((0, 0), (1, 0), (2, 0), (1, 1), (0, 2), (1, 2), (2, 2)):
                lz.pon(x + dx, y + dy, P['hueso'], 1, fx=True)
        if pose.extra.get('estrellas') is not None:
            k = int(pose.extra['estrellas'])
            cen = c.get('cabeza_centro', (0, -24))
            for j in range(3):
                a = (k * 0.8 + j * 2.09)
                x, y = lz.a_px((cen[0] - 1 + math.cos(a) * 6, cen[1] - 8 + math.sin(a) * 2))
                lz.pon(x, y, P['naranja'], 3, fx=True)
                if (j + k) % 2 == 0:
                    lz.pon(x + 1, y, P['naranja'], 2, fx=True)
                    lz.pon(x - 1, y, P['naranja'], 2, fx=True)


# =============================================================================================
#  Animaciones
# =============================================================================================

B = PoseQ(lomo=2, alto=0.5, cuello=150, cabeza=0, dc=(2.5, 0, 6), dl=(0.5, 0, 6), tc=(1.5, 0, 16),
          tl=(-0.5, 0, 16), cola=(168, 13, 0))


def animaciones():
    A = {}
    # Reposo: respira, mueve la cola (la punta se enrosca y se suelta), parpadea y gira una oreja.
    rep = []
    for i in range(6):
        s = math.sin(i / 6 * 2 * math.pi)
        rep.append(B.con(alto=0.5 + 0.5 * s, cola=(168 + 5 * s, 13 + 3 * s, 0), cabeza=-2 * s,
                         ojos='cerrado' if i == 4 else 'normal', orejas=0.3 if i == 2 else 0))
    A['reposo'] = Anim(rep, 5, True)
    # Caminar: secuencia lateral (trasera lejana, delantera lejana, trasera cercana, delantera cercana).
    cam = []
    for i in range(8):
        f = i / 8
        s = math.sin(f * 4 * math.pi)
        cam.append(con_patas(B, B.con(alto=0.5 + 0.4 * s, cabeza=-1.5 * s,
                                   cola=(164 + 6 * math.sin(f * 2 * math.pi), 12, 3 * math.sin(f * 2 * math.pi))),
                             (f + 0.75, f + 0.25, f + 0.5, f), 9, 3.2, 0.62))
    A['caminar'] = Anim(cam, 10, True)
    # Correr: galope; el lomo se estira y se recoge, la cola va tendida.
    A['correr'] = Anim(galope(B.con(lomo=0, cuello=132, cabeza=6, cola=(140, 6, 0), orejas=0.35), B), 14, True)
    # Ataque: se agacha (la cola vibra), salta con la pata adelante y da el zarpazo.
    ag = B.con(lomo=-6, alto=-3.5, cuello=118, cabeza=8, dc=(4, 0, 6), dl=(2, 0, 6), tc=(-1, 0, 30), tl=(-3, 0, 30),
               cola=(130, 4, 0), orejas=0.5)
    A['ataque'] = Anim([
        ag, ag.con(cola=(124, 5, 6), alto=-4),
        B.con(lomo=14, alto=1.5, cuello=150, cabeza=-4, dc=(9, 7, 40), dl=(7, 5, 30), tc=(-5, 0, 34), tl=(-7, 0, 34),
              cola=(140, 4, 0), boca=2, orejas=0.4, extra={'alzar': 2}),
        B.con(lomo=4, alto=0, cuello=135, cabeza=8, dc=(11, 1, 60), dl=(6, 0, 10), tc=(-3, 0, 24), tl=(-5, 0, 24),
              cola=(150, 8, 0), boca=2),
        B.con(lomo=2, cuello=145, dc=(5, 0, 8), dl=(3, 0, 6), cola=(160, 11, 0))], 10, False)
    golpe = [B.con(lomo=10, alto=1, cuello=155, cabeza=-4, dc=(6, 8, 50), boca=1, orejas=0.2),
             B.con(lomo=2, cuello=140, cabeza=6, dc=(10, 1, 70), boca=2),
             B.con(dc=(5, 0, 10))]
    A['golpe'] = Anim(golpe, 10, False)
    A['disparar'] = A['golpe']
    A['lanzar'] = A['golpe']
    # Conjuro / invocar (Habilidad Luna): se sienta erguido, los ojos se vuelven turquesa y maúlla.
    sen = B.con(lomo=46, alto=-2, cuello=172, cabeza=-6, dc=(1, 0, 2), dl=(-1, 0, 2), tc=(-2, 0, 84), tl=(-4, 0, 84),
                cola=(-95, 3, 0))
    A['conjuro'] = Anim([sen.con(extra={'luna': 1, 'chispas': 0}),
                         sen.con(boca=2, cabeza=-12, extra={'luna': 1, 'chispas': 1}),
                         sen.con(boca=3, cabeza=-16, extra={'luna': 1, 'chispas': 2}),
                         sen.con(boca=1, cabeza=-9, extra={'luna': 1, 'chispas': 3})], 6, True)
    A['invocar'] = A['conjuro']
    # Salto: se agacha y se estira en el aire; cae con las manos por delante; aterriza.
    agach = B.con(lomo=-4, alto=-3, cuello=128, cabeza=6, tc=(-1, 0, 32), tl=(-3, 0, 32), dc=(3, 0, 8),
                  cola=(140, 6, 0))
    vuelo = B.con(lomo=16, alto=3, cuello=150, dc=(9, 6, 70), dl=(7, 4, 60), tc=(-9, 2, -10), tl=(-11, 3, -10),
                  cola=(120, 3, 0))
    A['salto'] = Anim([agach, vuelo], 8, False)
    A['subida'] = Anim([vuelo], 1, False)
    A['caida'] = Anim([B.con(lomo=-12, alto=2, cuello=130, cabeza=6, dc=(6, 0, 4), dl=(4, 1, 4), tc=(-2, 6, 40),
                             tl=(-4, 7, 40), cola=(172, 6, 0), orejas=0.3)], 1, False)
    A['aterrizar'] = Anim([B.con(lomo=-4, alto=-3, cuello=130, cabeza=8, tc=(0, 0, 30), tl=(-2, 0, 30), dc=(4, 0, 8),
                                 cola=(150, 9, 0)), B], 10, False)
    # Esquivar: brinco hacia atrás con el lomo arqueado (gato asustado) y la cola tiesa.
    arq = B.con(lomo=0, alto=2, cuello=160, cabeza=-6, dc=(-1, 0, 4), dl=(-3, 0, 4), tc=(4, 0, 10), tl=(2, 0, 10),
                cola=(178, 1, 0), boca=2, orejas=0.8, extra={'encorva': 1.3})
    A['esquivar'] = Anim([arq, arq.con(dc=(-1, 3, 20), dl=(-3, 2, 20), tc=(4, 3, 0), tl=(2, 2, 0), extra={'alzar': 3}),
                          arq.con(extra={'encorva': 0.8}, boca=0)], 10, False)
    # Interactuar: olfatea el suelo.
    hus = B.con(lomo=-6, alto=-1, cuello=95, cabeza=20, cola=(160, 14, 0))
    A['interactuar'] = Anim([hus, hus.con(cabeza=24, alto=-1.5), hus], 5, False)
    # Daño: respingo con orejas atrás y ojos cerrados.
    A['dano'] = Anim([B.con(lomo=8, alto=1.5, cuello=170, cabeza=-14, ojos='dolor', orejas=1, boca=2, cola=(180, 4, 0),
                            extra={'encorva': 0.6}, dx=-1),
                      B.con(lomo=4, cabeza=-6, ojos='dolor', orejas=0.6, cola=(172, 9, 0))], 8, False)
    # Aturdido: tambaleo con estrellitas; agotado: echado, jadea.
    at = B.con(lomo=-2, alto=-1, cuello=140, cabeza=10, ojos='dolor', orejas=0.6, cola=(150, 7, 0))
    A['aturdido'] = Anim([at.con(cabeza=6 + 6 * math.sin(k * 1.6), extra={'estrellas': k}) for k in range(4)], 6, True)
    ech = B.con(lomo=0, alto=-7.5, cuello=118, cabeza=10, dc=(9, 0, 82), dl=(7, 0, 82), tc=(5, 0, 85), tl=(3, 0, 85),
                cola=(-95, 2, 0), ojos='cerrado', orejas=0.4)
    A['agotado'] = Anim([ech, ech.con(alto=-7, cabeza=8), ech.con(alto=-7.5, cabeza=10, ojos='normal'),
                         ech.con(alto=-7, cabeza=8)], 3, True)
    # Purificar: sentado, sereno, ojos felices, brillo turquesa.
    A['purificar'] = Anim([sen.con(ojos='feliz', extra={'chispas': k}) for k in range(4)], 5, False)
    # Morir: se echa y se enrosca a dormir (Balam nunca "muere": se queda dormido).
    dor = ech.con(alto=-8, cuello=100, cabeza=26, cola=(-70, 14, 0), ojos='cerrado')
    A['morir'] = Anim([A['dano'].poses[0], ech, dor, dor.con(extra={'zzz': 0}), dor.con(extra={'zzz': 1})], 5, False)
    return A


PERSONAJE = Balam()
