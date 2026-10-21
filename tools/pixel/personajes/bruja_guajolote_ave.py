"""Bruja Guajolote en forma de AVE: guajolote gigante y monstruoso (jefa del Nivel 4, ~128 px con la cola).

No tiene hoja Codex propia: su kit anterior se dibujaba por código (`dibujar_ave` en tools/codex-sheets.py) con la
paleta de `bruja.png`. Se conserva ese diseño (plumaje negro, cola en abanico, cuello desnudo, carúnculas rojas,
ojo que brilla) pero con mucho más detalle y con la continuidad de la forma humana: plumas negras con reflejo
bronce/verde/violeta, piel de la cabeza azul pálido, moco y papada rojos, barba de cerdas en el pecho, patas
escamosas con espolón, y el ojo de fuego fatuo verde-azul (el color de sus charcos de fuego en el juego).

Se dibuja como criatura (sin rig humanoide): cuerpo, alas, cola, cuello y patas son primitivas sombreadas en el
espacio del mundo que se mueven por parámetros de pose; los detalles (escamas de pluma, ojo, pico) píxel a píxel.

Animaciones que usa el juego: caminar (andar normal), salto (anuncio de la embestida), correr (embestida),
invocar (charcos de fuego / transformación), golpe → ataque (aleteo que empuja), aturdido (ventana), morir."""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Material, Paleta, dir_ang, mas  # noqa: E402
from personajes._jefes1 import PC, Criatura, chispas, humo, llama, pluma, _h  # noqa: E402

PAL = Paleta([
    Material('pluma', ['#0e0c10', '#1c1a1e', '#2e2a2a', '#4a3e32'],               '#0e0c10'),
    Material('irid',  ['#2e5a4a', '#5e4e86', '#a0743e'],                          '#0e0c10'),
    Material('banda', ['#5a3a22', '#9a6a3e', '#d8bc94'],                          '#0e0c10'),
    Material('cabeza', ['#4a5a7a', '#7a90b0', '#b0c4dc', '#e0ecf4'],              '#24203a'),
    Material('carun', ['#5a0e14', '#a01e24', '#e04434', '#ff8a6a'],               '#3a0a0e'),
    Material('pata',  ['#4a3a3a', '#7a6460', '#a8908a'],                          '#24181a'),
    Material('pico',  ['#6a5a3a', '#b8a070', '#ece0b8'],                          '#24181a'),
    Material('fatuo', ['#127a66', '#3ad0a8', '#9dffe0', '#eafff8'],               '#127a66'),
])


def _rot(v, a):
    r = math.radians(a)
    return v[0] * math.cos(r) - v[1] * math.sin(r), v[0] * math.sin(r) + v[1] * math.cos(r)


def pluma_barrada(capa: Capa, base, ang, largo, ancho, mat, barra_mat, barra_ton=2, cada=4.0, desde=0.35,
                  tonos=(0, 1, 2), punta=None, curva=0.0):
    """Pluma con barras claras transversales (rémiges del guajolote)."""
    t = capa.vacia_como()
    tip = pluma(t, base, ang, largo, ancho, mat, tonos=tonos, raquis=None, punta=punta, curva=curva)
    m = t.mascara()
    d = dir_ang(ang)
    n = (-d[1], d[0])
    s = largo * desde
    while s < largo * 0.92:
        c = mas(base, d, s)
        b = t.vacia_como()
        b.linea(mas(c, n, -ancho), mas(c, n, ancho), barra_mat, barra_ton)
        sel = (b.mat >= 0) & m
        t.mat[sel] = b.mat[sel]
        t.ton[sel] = b.ton[sel]
        s += cada
    sel = t.mascara()
    capa.mat[sel] = t.mat[sel]
    capa.ton[sel] = t.ton[sel]
    return tip


class GuajoloteAve(Criatura):
    id = 'bruja_guajolote_ave'
    tipo = 'criatura'
    fw, fh = 208, 168
    pivote = (104, 164)
    alto = 128
    paleta = PAL

    # ------------------------------------------------------------------------------------------------
    def dibujar(self, lz, q: PC):
        P = self.paleta
        tilt = q.g('tilt')
        BC = (q.g('dx') - 2, -76 + q.g('baja') * 30)

        def W(dx, dy):           # local del cuerpo → mundo
            v = _rot((dx, dy), tilt)
            return BC[0] + v[0], BC[1] + v[1]

        oscuro_l = 1
        # ---------- 1) cola en abanico ----------
        cola = lz.parte()
        abre = q.g('cola', 0.5)         # 0 = caída hacia atrás, 1 = abanico de despliegue
        cb = W(-28, -8)
        n = 11
        for i in range(n):
            t = i / (n - 1)
            a = -95 - 75 * abre + (t - 0.5) * (40 + 120 * abre) + q.g('cola_ang') - tilt
            L = (46 + 12 * abre) * (1 - abs(t - 0.5) * 0.3) + (_h(i, 1) % 3)
            pluma(cola, cb, a, L, 5.2, P['pluma'], tonos=(0, 1, 2), raquis=2, curva=0)
            # banda clara de la punta y franja oscura final
            d = dir_ang(a)
            for k, (s, tn) in enumerate(((0.78, 1), (0.83, 2), (0.88, 2))):
                c = mas(cb, d, L * s)
                nn = (-d[1], d[0])
                w = 4.4 * (1 - s * 0.5)
                tmp = cola.vacia_como()
                tmp.linea(mas(c, nn, -w), mas(c, nn, w), P['banda'], tn)
                sel = (tmp.mat >= 0) & (cola.mat == P['pluma'])
                cola.mat[sel] = tmp.mat[sel]
                cola.ton[sel] = tmp.ton[sel]
        lz.pegar(cola, 'contorno', 0)
        # ---------- 2) ala lejana (solo cuando se abre) ----------
        ala = q.g('ala')
        if ala > 0.15:
            al = lz.parte()
            self.ala(al, W(10, -14), ala, tilt, lejana=True, aleteo=q.g('aleteo'))
            lz.pegar(al, 'contorno', oscuro_l)
        # ---------- 3) pata lejana ----------
        pl = lz.parte()
        self.pata(pl, W(-4, 18), q.g('muslo_l', -20), q.g('tarso_l', 8), q.g('pie_l', 0), q)
        lz.pegar(pl, 'contorno', oscuro_l)
        # ---------- 4) cuerpo ----------
        cu = lz.parte()
        pts = []
        for k in range(40):
            a = k / 40 * 2 * math.pi
            rx, ry = 36, 27 if math.sin(a) > 0 else 25
            x, y = math.cos(a) * rx, math.sin(a) * ry
            if x > 10 and y < 0:        # pecho más alto y abombado adelante
                y *= 1.12
            pts.append(W(x, y))
        m = cu.poligono(pts, P['pluma'], sombreado=(1, 2, 3), ks=4, kl=2)
        self.escamas(cu, m, W, tilt)
        lz.pegar(cu, 'contorno', 0)
        # ---------- 5) pata cercana ----------
        pc = lz.parte()
        self.pata(pc, W(6, 19), q.g('muslo_c', -20), q.g('tarso_c', 8), q.g('pie_c', 0), q)
        lz.pegar(pc, 'contorno', 0, proyecta=1)
        # ---------- 6) ala cercana ----------
        an = lz.parte()
        self.ala(an, W(12, -12), ala, tilt, lejana=False, aleteo=q.g('aleteo'))
        lz.pegar(an, 'contorno', 0, proyecta=1)
        # ---------- 7) barba de cerdas en el pecho ----------
        ba = lz.parte()
        b0 = W(32, -2)
        for k in range(4):
            ba.linea(mas(b0, (k * 0.7 - 1, 0)), mas(b0, (k * 0.5 - 1 + q.g('cuello_x') * 0.05, 10 + k % 2)), P['pluma'], k % 2)
        lz.pegar(ba, 'contorno', 0)
        # ---------- 8) cuello y cabeza ----------
        self.cuello_cabeza(lz, W(26, -18), q, tilt)
        # ---------- 9) efectos (los charcos van al nivel de las patas) ----------
        sol = (lz.mat >= 0) & ~lz.fx
        self._suelo = float(sol.any(axis=1).nonzero()[0].max() - lz.oy) if sol.any() else 0.0
        self.efectos(lz, q, BC)

    # ------------------------------------------------------------------------------------------------
    def escamas(self, capa, m, W, tilt):
        """Plumas del cuerpo como escamas: arcos de borde iridiscente por filas (bronce arriba, verde/violeta abajo)."""
        P = self.paleta
        ir = P['irid']
        for row in range(8):
            for col in range(11):
                lx = -32 + col * 7 + (row % 2) * 3.5
                ly = -21 + row * 6
                if (lx / 36) ** 2 + (ly / 26) ** 2 > 0.8:
                    continue
                x, y = capa.a_px(W(lx, ly))
                tn = 2 if row < 2 else (0 if (row + col) % 3 else 1)
                for dx, dy in ((-3, -1), (-2, 0), (-1, 1), (0, 1), (1, 1), (2, 0), (3, -1)):
                    X, Y = x + dx, y + dy
                    if capa.dentro(X, Y) and m[Y, X] and capa.ton[Y, X] > 0:
                        # en la sombra el reflejo se apaga
                        if capa.ton[Y, X] == 1 and (dx + row) % 2:
                            continue
                        capa.mat[Y, X] = ir
                        capa.ton[Y, X] = tn
                for dx in (-2, -1, 0, 1, 2):
                    X, Y = x + dx, y - 1 + abs(dx) // 2 - 1
                    if capa.dentro(X, Y) and m[Y, X] and capa.mat[Y, X] == P['pluma']:
                        capa.ton[Y, X] = max(0, capa.ton[Y, X] - 1)

    # ------------------------------------------------------------------------------------------------
    def ala(self, capa, hombro, ala, tilt, lejana=False, aleteo=0.0):
        """Ala: plegada (ala=0) sobre el costado apuntando atrás; abierta (1) hacia arriba con las rémiges en
        abanico. `aleteo` > 0 la baja por delante (golpe del aleteo)."""
        P = self.paleta
        th = -80 - ala * 116 + aleteo * 170 - tilt * (1 - ala) * 0.5
        if lejana:
            th += 8
        L = 36 + 14 * ala
        d = dir_ang(th)
        tr = th + 90 if aleteo < 0.5 else th - 90          # borde de fuga
        mu = mas(hombro, d, L * 0.58)                     # muñeca
        abre = 0.25 + ala * 0.75
        # rémiges primarias (desde la muñeca) con barras claras
        sg = 1 if aleteo < 0.5 else -1
        for k in range(7):
            a = th + sg * (k / 6) * (10 + 62 * ala) - 3 * sg
            pluma_barrada(capa, mas(mu, d, -2), a, 21 + 11 * ala - k * 1.0, 3.2, P['pluma'], P['banda'], 2,
                          cada=3.6, tonos=(0, 1, 2))
        # secundarias (borde de fuga del brazo): forman la vela del ala abierta
        for k in range(6):
            t = 0.08 + k * 0.1
            b = mas(hombro, d, L * t)
            a = tr + (th - tr) * (0.5 - 0.07 * k) * (1 - 0.5 * ala)
            pluma_barrada(capa, b, a, 14 + 9 * ala + k * 0.6, 3.4, P['pluma'], P['banda'], 2, cada=3.4,
                          tonos=(0, 1, 2))
        # cobijas (la parte de arriba del ala) con reflejo bronce
        pluma(capa, mas(hombro, d, -3), th, L * (0.72 - 0.1 * ala), 11.0 - 3 * ala, P['pluma'], tonos=(1, 2, 3),
              raquis=None)
        nn = (-d[1], d[0])
        for k in range(4):
            c = mas(hombro, d, 4 + k * 4.5)
            capa.pon_m(mas(c, nn, 2), P['irid'], 2 if k % 2 else 1)
            capa.pon_m(mas(mas(c, nn, 2), d, 1), P['irid'], 2)

    # ------------------------------------------------------------------------------------------------
    def pata(self, capa, cad, a1, a2, apie, q):
        """Muslo emplumado (cadera → corvejón, hacia atrás), tarso escamoso (→ pie, hacia adelante), dedos y espolón."""
        P = self.paleta
        L1, L2 = 20 * (1 - q.g('baja') * 0.3), 25 * (1 - q.g('baja') * 0.35)
        hock = mas(cad, dir_ang(a1), L1)
        tob = mas(hock, dir_ang(a2), L2)
        pa = P['pata']
        r = math.radians(apie)
        fwd = (math.cos(r), -math.sin(r))
        down = (math.sin(r), math.cos(r))
        # dedos: tres al frente (el de en medio más largo) y uno atrás
        for k, (ab, L) in enumerate(((-14, 9.0), (3, 12.0), (18, 8.0))):
            aa = math.radians(apie - ab)
            dd = (math.cos(aa), -math.sin(aa))
            nud = mas(tob, dd, L * 0.5)
            tip = mas(tob, dd, L)
            capa.capsula(tob, nud, 1.9, 1.6, pa, tonos=(0, 1, 2))
            capa.capsula(nud, tip, 1.6, 1.1, pa, tonos=(0, 1, 2), pliegues=[(0.5, 0)])
            capa.pon_m(mas(tip, dd, 1.2), P['pico'], 1)
            capa.pon_m(mas(mas(tip, dd, 2.0), down, 1.0), P['pico'], 2)
            capa.pon_m(mas(mas(tip, dd, 2.2), down, 2.0), P['pico'], 0)
        atr = mas(tob, fwd, -5)
        capa.capsula(tob, atr, 1.7, 1.2, pa, tonos=(0, 1, 1))
        capa.pon_m(mas(atr, fwd, -1.2), P['pico'], 1)
        # tarso con escamas y espolón
        capa.capsula(hock, tob, 2.6, 2.0, pa, tonos=(0, 1, 2),
                     pliegues=[(0.2, 0), (0.35, 0), (0.5, 0), (0.65, 0), (0.8, 0)])
        esp = mas(mas(hock, dir_ang(a2), L2 * 0.6), dir_ang(a2 - 90), 2.6)
        capa.linea(esp, mas(esp, dir_ang(a2 - 120), 3), P['pico'], 1)
        # muslo emplumado
        capa.capsula(cad, hock, 8.0, 3.4, P['pluma'], tonos=(1, 2, 3))
        capa.elipse(hock, 3.0, 3.0, pa, tonos=(0, 1, 2))
        # plumas sueltas sobre el muslo
        for k in range(3):
            pluma(capa, mas(cad, dir_ang(a1), 3 + k * 4), a1 - 30, 7, 2.2, P['pluma'], tonos=(1, 2, 3), raquis=3)

    # ------------------------------------------------------------------------------------------------
    def cuello_cabeza(self, lz, base, q, tilt):
        P = self.paleta
        ca, cr = P['cabeza'], P['carun']
        hx, hy = 13 + q.g('cuello_x'), -30 + q.g('cuello_y')
        head = (base[0] + hx, base[1] + hy)
        ctrl = (base[0] + hx * 0.15 - 3, base[1] + hy * 0.55)
        n = 8
        cad = []
        for i in range(n + 1):
            t = i / n
            x = (1 - t) ** 2 * base[0] + 2 * (1 - t) * t * ctrl[0] + t * t * head[0]
            y = (1 - t) ** 2 * base[1] + 2 * (1 - t) * t * ctrl[1] + t * t * head[1]
            cad.append((x, y))
        cu = lz.parte()
        # collar de plumas donde nace el cuello
        for k in range(6):
            pluma(cu, mas(base, (-6 + k * 2.4, 2)), 170 + k * 14 - tilt, 9, 3.0, P['pluma'], tonos=(1, 2, 3),
                  raquis=3)
        sk = lz.parte()
        for i in range(n):
            r0 = 6.0 - 2.6 * i / n
            r1 = 6.0 - 2.6 * (i + 1) / n
            sk.capsula(cad[i], cad[i + 1], r0, r1, ca, tonos=(0, 1, 2))
        # arrugas
        for i in range(2, n, 2):
            a, b = cad[i], cad[i + 1]
            v = (b[0] - a[0], b[1] - a[1])
            Lv = math.hypot(*v) or 1
            nn = (-v[1] / Lv, v[0] / Lv)
            sk.linea(mas(a, nn, -2), mas(a, nn, 1.5), ca, 1)
        # carúnculas: verrugas rojas por el frente del cuello
        car = lz.parte()
        for i in range(1, n - 1):
            a, b = cad[i], cad[i + 1]
            v = (b[0] - a[0], b[1] - a[1])
            Lv = math.hypot(*v) or 1
            fw = (v[1] / Lv, -v[0] / Lv)          # hacia el frente (derecha) del cuello
            if fw[0] < 0:
                fw = (-fw[0], -fw[1])
            r = 4.6 - 2.2 * i / n
            c = mas(a, fw, r)
            car.elipse(c, 2.4, 2.0, cr, tonos=(1, 2, 3))
            car.elipse(mas(c, (-1.5, 2.2)), 1.7, 1.5, cr, tonos=(1, 2, 3))
            if i % 2 and i < n - 2:
                car.elipse(mas(mas(c, fw, -5), (0, 1)), 1.6, 1.4, cr, tonos=(0, 1, 2))
        # cabeza
        hd = lz.parte()
        ang = q.g('cab_ang')

        def H(dx, dy):
            v = _rot((dx, dy), ang)
            return head[0] + v[0], head[1] + v[1]
        hd.elipse(H(0, 0), 8.0, 7.0, ca, tonos=(1, 2, 3))
        hd.elipse(H(3.5, 2.8), 5.0, 4.0, ca, tonos=(1, 2, 3))
        # pico ganchudo
        boca = q.g('boca')
        pi = P['pico']
        hd.poligono([H(5.5, -2.6), H(10.5, -1.6), H(13.4, 1.2), H(12.6, 3.6), H(11.2, 2.0), H(6, 1.8)], pi,
                    sombreado=(0, 1, 2), ks=1)
        if boca:
            ab = boca * 9
            def Jm(dx, dy):
                v = _rot((dx - 6, dy - 2), ab)
                return H(6 + v[0], 2 + v[1])
            hd.poligono([H(6, 1.5), H(11, 2.2), Jm(10.6, 3.4), Jm(6.5, 4.0)], cr, sombreado=(0, 0, 1), ks=1)
            hd.poligono([Jm(6.4, 2.6), Jm(11.2, 2.8), Jm(10.4, 4.4), Jm(6.6, 4.6)], pi, sombreado=(0, 1, 1), ks=1)
        else:
            hd.poligono([H(6.4, 2.2), H(11, 2.6), H(10, 4.2), H(6.6, 4.4)], pi, sombreado=(0, 1, 1), ks=1)
        # moco (snood) que cae sobre el pico y papada bajo la barbilla
        mo = lz.parte()
        cae = q.g('moco', 0)            # se balancea
        m0 = H(4, -5.5)
        m1 = H(9 + cae, -3.5)
        m2 = mas(H(11 + cae * 1.5, 3), (0, 0))
        m3 = mas(H(11.5 + cae * 2, 9 + q.g('moco_largo', 0)), (0, 0))
        mo.capsula(m0, m1, 1.8, 1.6, cr, tonos=(1, 2, 3))
        mo.capsula(m1, m2, 1.6, 1.5, cr, tonos=(1, 2, 3))
        mo.capsula(m2, m3, 1.5, 1.1, cr, tonos=(1, 2, 2))
        pap = q.g('papada', 0)
        mo.capsula(H(3, 5), mas(H(2.5 + pap, 13), (0, 0)), 2.6, 2.0, cr, tonos=(1, 2, 3))
        mo.elipse(mas(H(2.5 + pap, 13), (0, 1)), 2.4, 2.2, cr, tonos=(0, 1, 2))
        lz.pegar(cu, 'contorno', 0)
        lz.pegar(sk, 'contorno', 0, proyecta=1)
        lz.pegar(car, 'contorno', 0)
        lz.pegar(hd, 'contorno', 0, proyecta=1)
        lz.pegar(mo, 'contorno', 0)
        # ojo de fuego fatuo, ceja de piel arrugada
        g = lz.parte()
        ex, ey = g.a_px(H(1.0, -1.5))
        fa = P['fatuo']
        cerr = q.g('ojo_cerrado')
        brillo = q.g('brillo', 1)
        for dx, dy in ((-1, 0), (0, 0), (1, 0), (2, 0), (0, -1), (1, -1), (0, 1), (1, 1)):
            g.pon(ex + dx, ey + dy, ca, 0, fijo=True)
        if cerr:
            g.pon(ex, ey, ca, 1, fijo=True)
            g.pon(ex + 1, ey, ca, 1, fijo=True)
        elif q.g('calma'):
            g.pon(ex, ey, P['pico'], 2, fijo=True)
            g.pon(ex + 1, ey, P['pluma'], 0, fijo=True)
        else:
            g.pon(ex, ey, fa, 2, fijo=True)
            g.pon(ex + 1, ey, fa, 3 if brillo else 1, fijo=True)
            if brillo >= 2:
                for dx, dy, t in ((2, -1, 1), (3, -1, 0), (2, 0, 2), (-1, -1, 1)):
                    g.pon(ex + dx, ey + dy, fa, t, fx=True)
        g.linea(H(-2.5, -4.2), H(3, -4.6), ca, 0)
        g.pon_m(H(9.4, -0.6), pi, 0, fijo=True)                   # narina
        g.pon_m(H(12.6, 1.2), pi, 2, fijo=True)
        lz.pegar(g, None, 0)
        self._cabeza = H(0, 0)

    # ------------------------------------------------------------------------------------------------
    def efectos(self, lz, q, BC):
        P = self.paleta
        fa = P['fatuo']
        k = int(q.g('k'))
        ll = q.g('charcos')
        if ll:
            # charcos de fuego fatuo que brotan del suelo alrededor
            for j, dx in enumerate((-56, -38, 40, 60, -72, 76)):
                h = (8 + 12 * ll) * (0.7 + 0.3 * ((j + k) % 3) / 2)
                if j >= 2 + int(ll * 4):
                    continue
                gy = self._suelo
                base = (dx, gy - 2)
                llama(lz, base, h, 2.6 + 1.6 * ll, fa, fase=k + j)
                llama(lz, (dx + 4, gy - 1), h * 0.55, 1.8 + ll, fa, fase=k + j + 2)
                x, y = lz.a_px(base)
                for xx in range(-7, 9):
                    lz.pon(x + xx, y + 1, fa, 0 if abs(xx - 1) > 4 else 1, fx=True)
                    if abs(xx - 1) < 4:
                        lz.pon(x + xx, y, fa, 2 if abs(xx - 1) < 2 else 1, fx=True)
        if q.g('llama_lomo'):
            # fuego fatuo que brota del lomo (se transforma / se enfurece)
            for j, dx in enumerate((-14, -2, 10)):
                v = _rot((dx, -27 + abs(dx) * 0.15), q.g('tilt'))
                llama(lz, (BC[0] + v[0], BC[1] + v[1]), 6 + q.g('llama_lomo') * 6, 2.2, fa, fase=k + j)
        if q.g('rafaga') is not None and q.g('rafaga') != 0:
            # ráfaga del aleteo: arcos de aire claros por delante y abajo
            rf = int(q.g('rafaga'))
            for j in range(3):
                for t in range(12):
                    a = math.radians(30 + t * 9)
                    r = 34 + j * 7 + rf * 8
                    x, y = lz.a_px((BC[0] + 6 + math.sin(a) * r, BC[1] + 10 + math.cos(a) * r * 0.5 - j * 4))
                    if (t + j + rf) % 4 != 3 and lz.dentro(x, y) and lz.mat[y, x] < 0:
                        lz.pon(x, y, P['cabeza'], 3 if t % 3 else 2, fx=True)
        if q.get('chispas') is not None:
            chispas(lz, mas(self._cabeza, (-34, 52)), fa, int(q['chispas']), radio=44, n=14, tonos=(1, 3), sube=1)
        if q.get('mareo') is not None:
            kk = int(q['mareo'])
            cen = self._cabeza
            for j in range(3):
                a = (j / 3 + kk / 4) * 2 * math.pi
                x, y = lz.a_px((cen[0] + math.cos(a) * 10, cen[1] - 12 + math.sin(a) * 3))
                lz.pon(x, y, fa, 3 if j == 0 else 1, fx=True)
                if j == 0:
                    for ex2, ey2 in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        if lz.mat[y + ey2, x + ex2] < 0:
                            lz.pon(x + ex2, y + ey2, fa, 0, fx=True)
        if q.get('humo') is not None:
            humo(lz, (BC[0] - 6, BC[1] - 18), int(q['humo']), P['pluma'], n=9, radio=7, abre=20, sube=8,
                 tonos=(2, 3, 3), semilla=11)
        if q.get('sueltas') is not None:
            s = q['sueltas']
            for j in range(7):
                hx = (_h(j, 31) % 90) - 45
                hy = (_h(j, 32) % 40) - 50 + s * 9
                a = (_h(j, 33) % 140) - 70 + s * 30
                pluma(lz, (BC[0] + hx, BC[1] + hy), a, 8, 2.0, P['pluma'], tonos=(1, 2, 3), raquis=3)
        if q.get('luz') is not None:
            chispas(lz, (BC[0], BC[1] - 6), fa, int(q['luz']), radio=46, n=16, tonos=(2, 3), sube=3)


# ------------------------------------------------------------------------------------------------------
#  Poses
# ------------------------------------------------------------------------------------------------------
B = PC(tilt=0, cola=0.55, ala=0.0, muslo_c=-18, tarso_c=10, pie_c=0, muslo_l=-24, tarso_l=6, pie_l=0,
       cuello_x=0, cuello_y=0, k=0)

# ciclo del andar: (muslo, tarso, pie) de la pata cercana; la lejana va media vuelta después
PASO = [(-6, 22, 0), (-14, 14, 0), (-22, 6, 0), (-30, -2, 0), (-34, -8, -10), (-6, -20, -30), (14, 6, -10), (6, 24, 0)]


def animaciones():
    A = {}
    A['reposo'] = Anim([
        B.con(k=0),
        B.con(baja=0.02, cola=0.6, cuello_x=1, k=1, moco=0.5),
        B.con(baja=0.04, cola=0.62, cuello_x=2, cuello_y=1, k=2, moco=1, brillo=2),
        B.con(baja=0.03, cola=0.58, cuello_x=-1, k=3, moco=0.5, papada=0.5),
        B.con(baja=0.0, cola=0.55, cuello_x=-3, cuello_y=-1, cab_ang=-8, boca=1, k=4, moco=-0.5, papada=1),
        B.con(cuello_x=-1, k=5, ojo_cerrado=1),
    ], 5, True)
    cam = []
    for i in range(8):
        a, b = PASO[i], PASO[(i + 4) % 8]
        s = math.sin(i / 8 * 2 * math.pi)
        cam.append(B.con(tilt=3, muslo_c=a[0], tarso_c=a[1], pie_c=a[2], muslo_l=b[0], tarso_l=b[1], pie_l=b[2],
                         cuello_x=4 * s + 2, cuello_y=-abs(s) * 2, cab_ang=-4 * s, moco=-s * 1.5, papada=-s,
                         baja=0.03 * abs(math.cos(i / 8 * 2 * math.pi)), cola=0.55 + 0.05 * s, k=i, ala=0.05))
    A['caminar'] = Anim(cam, 8, True)
    # Embestida: el cuerpo se tiende, cuello al frente y bajo, alas medio abiertas hacia atrás, zancadas largas.
    cor = []
    for i in range(8):
        a, b = PASO[i], PASO[(i + 4) % 8]
        s = math.sin(i / 8 * 2 * math.pi)
        cor.append(B.con(tilt=22, muslo_c=a[0] * 1.5 - 6, tarso_c=a[1] * 1.4, pie_c=a[2], muslo_l=b[0] * 1.5 - 6,
                         tarso_l=b[1] * 1.4, pie_l=b[2], cuello_x=18 + 2 * s, cuello_y=20, cab_ang=10, boca=1,
                         cola=0.2, cola_ang=24, ala=0.2 + 0.08 * s, moco=-3, papada=-2, brillo=2, k=i,
                         alzar=2 if i % 4 == 1 else 0))
    A['correr'] = Anim(cor, 14, True)
    # Salto = anuncio de la embestida: se agacha, abanica la cola, alza las alas y echa la cabeza atrás.
    s0 = B.con(tilt=-6, baja=0.25, cola=1.0, ala=0.55, muslo_c=10, tarso_c=40, muslo_l=4, tarso_l=36,
               cuello_x=-8, cuello_y=6, cab_ang=-14, boca=2, brillo=2, k=0, papada=1)
    s1 = s0.con(baja=0.35, ala=0.75, cuello_x=-10, cuello_y=8, k=1, moco=1)
    s2 = s0.con(baja=0.4, ala=0.8, tilt=6, cuello_x=6, cuello_y=12, cab_ang=6, boca=3, k=2, llama_lomo=1)
    A['salto'] = Anim([s0, s1, s2], 6, False)
    A['subida'] = A['salto']
    A['caida'] = Anim([B.con(tilt=-4, ala=1.0, cola=0.9, muslo_c=10, tarso_c=-10, pie_c=-30, muslo_l=0,
                             tarso_l=-20, pie_l=-40, cuello_x=-2, cuello_y=-2, boca=1, k=1),
                       B.con(tilt=0, ala=0.6, aleteo=0.4, cola=0.8, muslo_c=4, tarso_c=0, pie_c=-20, muslo_l=-6,
                             tarso_l=-6, pie_l=-30, k=2)], 6, False)
    A['aterrizar'] = Anim([B.con(baja=0.45, ala=0.4, tilt=10, muslo_c=14, tarso_c=44, muslo_l=8, tarso_l=40,
                                 cuello_x=8, cuello_y=10, k=0),
                           B.con(baja=0.15, ala=0.1, muslo_c=-8, tarso_c=20, cuello_x=2, k=1)], 10, False)
    # Invocar (charcos de fuego / transformación): despliegue total del guajolote, grita, el fuego brota.
    iv = B.con(tilt=-4, cola=1.0, ala=0.0, aleteo=0.0, cuello_x=-6, cuello_y=-6, cab_ang=-22, boca=3, brillo=2,
               papada=1.5, moco_largo=2, muslo_c=-10, tarso_c=16)
    A['invocar'] = Anim([
        iv.con(charcos=0.3, k=0, chispas=0),
        iv.con(charcos=0.6, k=1, chispas=1, cuello_y=-8, boca=4, llama_lomo=0.6),
        iv.con(charcos=0.9, k=2, chispas=2, cuello_y=-7, boca=4, llama_lomo=1.0, moco=1),
        iv.con(charcos=1.0, k=3, chispas=3, cuello_y=-6, boca=3, llama_lomo=0.8, moco=-1),
    ], 7, True)
    A['conjuro'] = Anim([p.con(charcos=0) for p in A['invocar'].poses], 7, True)
    # Golpe = anuncio del aleteo: se yergue y levanta las dos alas muy arriba.
    g0 = B.con(tilt=-14, ala=0.8, cola=0.9, cuello_x=-6, cuello_y=-4, cab_ang=-12, boca=2, brillo=2,
               muslo_c=-4, tarso_c=24, muslo_l=-14, tarso_l=18, k=0)
    g1 = g0.con(tilt=-18, ala=1.0, cuello_x=-8, boca=3, k=1, llama_lomo=0.5)
    A['golpe'] = Anim([g0, g1], 6, False)
    # Ataque = aleteo: las alas bajan con fuerza por delante, ráfaga; se recupera.
    a2 = B.con(tilt=10, ala=0.6, aleteo=0.8, cola=0.8, cuello_x=8, cuello_y=6, boca=3, brillo=2, baja=0.15,
               muslo_c=-4, tarso_c=30, rafaga=1, k=2)
    a3 = a2.con(aleteo=1.0, ala=0.5, rafaga=2, k=3, boca=2)
    a4 = B.con(tilt=4, ala=0.2, cola=0.7, cuello_x=4, k=4)
    A['ataque'] = Anim([g0, g1, a2, a3, a4], 10, False)
    # Lanzar / disparar: picotazo.
    A['lanzar'] = Anim([
        B.con(tilt=-6, cuello_x=-10, cuello_y=4, cab_ang=-10, boca=2, brillo=2, k=0),
        B.con(tilt=18, cuello_x=26, cuello_y=26, cab_ang=20, boca=3, brillo=2, k=1, moco=-3),
        B.con(tilt=10, cuello_x=14, cuello_y=12, cab_ang=10, boca=1, k=2)], 9, False)
    A['disparar'] = A['lanzar']
    A['interactuar'] = Anim([B.con(tilt=14, cuello_x=16, cuello_y=30, cab_ang=30),
                             B.con(tilt=16, cuello_x=18, cuello_y=34, cab_ang=34, boca=1)], 4, False)
    # Daño: se encabrita, plumas sueltas.
    A['dano'] = Anim([
        B.con(tilt=-16, ala=0.5, cola=0.9, cuello_x=-12, cuello_y=-2, cab_ang=-24, boca=3, ojo_cerrado=1,
              sueltas=0, muslo_c=-30, tarso_c=0),
        B.con(tilt=-8, ala=0.2, cola=0.7, cuello_x=-6, cab_ang=-10, boca=1, sueltas=1),
        B.con(tilt=-2, cola=0.6, cuello_x=-2, sueltas=2),
    ], 9, False)
    # Aturdido (ventana): echado a medias, alas caídas, la cabeza se bambolea, destellos girando.
    at = B.con(tilt=8, baja=0.4, ala=0.25, aleteo=0.15, cola=0.2, cola_ang=12, muslo_c=20, tarso_c=50,
               muslo_l=14, tarso_l=46, cuello_x=10, cuello_y=22, cab_ang=26, brillo=0, moco=2, moco_largo=2)
    A['aturdido'] = Anim([at.con(mareo=0), at.con(cuello_x=12, cuello_y=24, cab_ang=34, mareo=1),
                          at.con(cuello_x=8, cuello_y=22, cab_ang=18, ojo_cerrado=1, mareo=2),
                          at.con(cuello_x=6, cuello_y=20, cab_ang=22, mareo=3)], 5, True)
    A['agotado'] = A['aturdido']
    # Morir (sello completo): se desploma, alas abiertas en el suelo, humo y plumas; el fuego del ojo se apaga.
    ca = B.con(tilt=14, baja=1.0, ala=0.3, aleteo=0.3, cola=0.1, cola_ang=20, muslo_c=60, tarso_c=110, pie_c=0,
               muslo_l=54, tarso_l=104, pie_l=0, cuello_x=24, cuello_y=46, cab_ang=60, ojo_cerrado=1)
    A['morir'] = Anim([
        A['dano'].poses[0],
        at.con(humo=0, sueltas=0, brillo=0),
        ca.con(baja=0.75, cuello_x=18, cuello_y=36, cab_ang=40, humo=1, sueltas=1),
        ca.con(humo=2, sueltas=2),
        ca.con(humo=3, calma=1, ojo_cerrado=1),
    ], 5, False)
    A['purificar'] = Anim([
        at.con(brillo=2, luz=0),
        at.con(brillo=0, luz=1, humo=0),
        ca.con(baja=0.6, cuello_x=14, cuello_y=26, cab_ang=20, luz=2, humo=1, ojo_cerrado=0, calma=1),
        ca.con(baja=0.6, cuello_x=12, cuello_y=24, cab_ang=16, luz=3, calma=1, ojo_cerrado=1),
    ], 4, False)
    # Esquivar: salto atrás aleteando.
    A['esquivar'] = Anim([
        B.con(baja=0.3, tilt=-4, ala=0.6, muslo_c=10, tarso_c=40, muslo_l=4, tarso_l=36, cuello_x=-6, k=0),
        B.con(tilt=-10, ala=1.0, cola=0.9, dx=-6, muslo_c=10, tarso_c=-10, pie_c=-30, muslo_l=0, tarso_l=-20,
              pie_l=-40, cuello_x=-8, cuello_y=-2, boca=2, alzar=8, k=1),
        B.con(baja=0.2, tilt=6, ala=0.3, aleteo=0.5, dx=-8, cuello_x=2, k=2),
    ], 12, False)
    return A


PERSONAJE = GuajoloteAve()
