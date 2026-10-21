"""Cabeza Olmeca Poseída (jefa del Nivel 3, Catemaco, ~120 px): cabeza colosal de piedra que despierta.

Diseño de la hoja Codex `cabeza-olmeca.png`: cúpula de piedra clara (cantera crema), casco de jade verde brillante
con vetas de luz y ribete de piedra, orejeras de cuentas redondas y panel lateral de jade con celosía, ojos
redondos como discos (lente oscura con aro), nariz ancha con narinas verdes, labios gruesos en banda, manchas de
musgo. Vista de tres cuartos mirando a la derecha. Cuando ataca los ojos se encienden de verde; vencida se le
cierran los ojos y el musgo la cubre en calma.

FASES (el juego tiene 3): la piedra se va agrietando. Las grietas existen desde el reposo (fase 1), en `dano`
(cambio de fase) se abren y brillan, y al purificarse brillan suave y se apagan. Como el kit no tiene variantes
por fase, cada animación muestra el estado que le toca (ver el informe para integrarlo por fase si se quiere).

Se dibuja por píxel (criatura sin rig): la cabeza es un volumen elipsoidal sombreado con luz arriba-izquierda,
y cada rasgo (casco, ojos, nariz, boca, orejeras, grietas, musgo) se pinta encima."""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import LUZ, Anim, Material, Paleta, desplazar, tono_por_luz  # noqa: E402
from personajes._jefes1 import PC, Criatura, chispas, humo, _h  # noqa: E402

PAL = Paleta([
    Material('piedra', ['#5a5246', '#8e8270', '#bcae94', '#e0d4b8', '#f6eedc'],   '#2a261e'),
    Material('jade',   ['#0e3a24', '#1a5e38', '#2e8a52', '#62b47e', '#b4e2bc'],   '#082014'),
    Material('musgo',  ['#2a4a1e', '#4a6e2a', '#7a9a3a'],                         '#082014'),
    Material('oscuro', ['#141a16', '#26302a', '#3e4a40'],                         '#082014'),
    Material('brillo', ['#1aa04a', '#5aff8a', '#d0ffe0'],                         '#082014'),
    Material('tierra', ['#3a2e22', '#5e4a36', '#86704e'],                         '#2a261e'),
])

CY, RY, RX = -62.0, 60.0, 64.0         # centro y radios del volumen de la cabeza
OJO_L, OJO_C = (6.0, -56.0), (45.0, -56.0)   # ojo lejano / cercano (centro)

# Grietas: polilíneas en el espacio de la cabeza, por fase (1: finas; 2: se abren; 3: cruzan la cara)
GRIETAS = {
    1: [[(-40, -96), (-34, -88), (-36, -80), (-30, -72)], [(52, -30), (58, -22), (55, -14)]],
    2: [[(-30, -72), (-22, -64), (-24, -52), (-16, -44)], [(18, -98), (12, -90), (16, -82), (10, -76)],
        [(58, -46), (62, -38)], [(-48, -20), (-40, -14), (-42, -6)]],
    3: [[(-16, -44), (-8, -38), (-10, -28), (-4, -20), (-6, -10)], [(10, -76), (4, -70), (-2, -66)],
        [(30, -104), (36, -96), (32, -88)], [(60, -64), (54, -58)], [(-56, -50), (-50, -44), (-54, -36)]],
}


def _mitad(y: float) -> float:
    """Semiancho del volumen en la fila y (cúpula arriba, costados casi rectos, base un poco recogida)."""
    if y < CY:
        t = (y - CY) / RY
        return RX * math.sqrt(max(0.0, 1 - t * t))
    t = (y - CY) / (-CY)
    return RX * (1 + 0.04 * math.sin(t * math.pi) - 0.16 * t ** 3)


class CabezaOlmeca(Criatura):
    id = 'cabeza_olmeca'
    tipo = 'criatura'
    fw, fh = 176, 152
    pivote = (88, 148)
    alto = 120
    paleta = PAL

    # ------------------------------------------------------------------------------------------------
    def dibujar(self, lz, q: PC):
        P = self.paleta
        pi, ja = P['piedra'], P['jade']
        H, W = lz.h, lz.w
        ys, xs = np.mgrid[0:H, 0:W]
        wx = xs + 0.5 - lz.ox                 # coordenadas del mundo de cada píxel
        wy = ys + 0.5 - lz.oy
        # ---- máscara del volumen
        mitad = np.vectorize(_mitad)(np.clip(wy, CY - RY, 0))
        cab = (wy > CY - RY) & (wy < 0) & (np.abs(wx) <= mitad)
        # ---- normal aproximada de elipsoide → luz
        u = wx / RX
        v = np.where(wy < CY, (wy - CY) / RY, (wy - CY) / (-CY) * 0.55)
        lit = (u * LUZ[0] + v * LUZ[1])
        # ---- casco: banda que baja hacia el frente de la cara (vista 3/4 a la derecha)
        band = -80 + 9 * np.clip(1 - ((wx - 26) / 62) ** 2, 0, 1)
        jade_m = cab & (wy < band - 6) & ((wx / (RX - 7)) ** 2 + ((wy - CY + 2) / (RY - 7)) ** 2 < 1)
        rim_m = cab & (wy < band) & ~jade_m
        # pinta piedra
        for y, x in zip(*np.nonzero(cab)):
            t = tono_por_luz(lit[y, x], (1, 2, 3), -0.35, 0.3, x, y, True)
            if lit[y, x] > 0.62:
                t = 4 if (x + y) % 2 == 0 or lit[y, x] > 0.72 else 3
            if lit[y, x] < -0.55:
                t = 0 if (x + y) % 2 == 0 or lit[y, x] < -0.65 else 1
            lz.pon(x, y, pi, t)
        # ribete (banda de piedra clara): un tono arriba
        for y, x in zip(*np.nonzero(rim_m)):
            lz.ton[y, x] = min(4, lz.ton[y, x] + 1)
        # jade brillante con vetas de luz diagonales
        for y, x in zip(*np.nonzero(jade_m)):
            l2 = lit[y, x] * 1.3
            t = tono_por_luz(l2, (1, 2, 3), -0.25, 0.45, x, y, True)
            # reflejo principal arriba-izquierda y vetas de luz diagonales (vidriado del jade)
            hx, hy = wx[y, x] + 18, wy[y, x] + 104
            if (hx / 16) ** 2 + (hy / 7) ** 2 < 1:
                t = 4 if (hx / 16) ** 2 + (hy / 7) ** 2 < 0.45 else 3
            veta = (wx[y, x] * 0.8 + wy[y, x])
            for v0 in (-120.0, -104.0, -92.0):
                if abs(veta - v0) < 1.0 and wx[y, x] < 40 and t >= 2:
                    t = 4 if v0 == -104.0 else 3
            if wy[y, x] > band[y, x] - 9 and t > 1:
                t -= 1              # el borde inferior del casco cae en sombra
            lz.pon(x, y, ja, t)
        # borde del jade: línea oscura
        jb = jade_m & ~(desplazar(jade_m, 0, 1) & desplazar(jade_m, 0, -1) & desplazar(jade_m, 1, 0) & desplazar(jade_m, -1, 0))
        for y, x in zip(*np.nonzero(jb)):
            if wy[y, x] > CY - RY + 8:
                lz.pon(x, y, ja, 0)
        # segmentos del ribete (bloques tallados)
        for y, x in zip(*np.nonzero(rim_m)):
            if int(wx[y, x] + 64) % 13 == 0:
                lz.pon(x, y, pi, max(0, lz.ton[y, x] - 2))
        self.lado(lz, q)
        self.rostro(lz, q)
        self.grietas(lz, q)
        self.musgo(lz, q, cab)
        if q.g('alzar') <= 3:
            self.base(lz, q)
        self.efectos(lz, q)
        s = q.g('cizalla')
        if s:
            self.cizallar(lz, s)

    # ------------------------------------------------------------------------------------------------
    def lado(self, lz, q):
        """Panel lateral de jade con celosía y orejera de cuentas redondas (lado izquierdo visible)."""
        P = self.paleta
        ja, pi = P['jade'], P['piedra']
        for y in range(-84, -18):
            w = _mitad(y)
            x0, x1 = -w + 2, -w + 13 - max(0, (y + 30) * 0.08)
            x = x0
            while x <= x1:
                X, Y = lz.a_px((x, y))
                d = (int(x) + y) % 8
                e = (int(x) - y) % 8
                tn = 1 if (d == 0 or e == 0) else (2 if x < x0 + 4 else 1)
                if d == 0 or e == 0:
                    tn = 3 if y < -50 else 2
                lz.pon(X, Y, ja, tn if (d and e) or True else 0)
                x += 1
        # borde del panel
        for y in range(-84, -18):
            w = _mitad(y)
            X, Y = lz.a_px((-w + 14 - max(0, (y + 30) * 0.08), y))
            lz.pon(X, Y, pi, 0)
        # cuentas de la orejera
        for k, cy in enumerate((-74, -60, -46, -33)):
            cx = -_mitad(cy) + 19
            r = 6.0 if k < 3 else 5.0
            lz.elipse((cx, cy), r, r * 1.05, pi, tonos=(1, 3, 4))
            # aro de sombra abajo-derecha
            for a in range(0, 360, 12):
                ra = math.radians(a)
                if 0 < a < 160:
                    lz.pon_m((cx + math.cos(ra) * (r + 0.6), cy + math.sin(ra) * (r + 0.6)), pi, 0)

    # ------------------------------------------------------------------------------------------------
    def rostro(self, lz, q):
        P = self.paleta
        pi, os_, br = P['piedra'], P['oscuro'], P['brillo']
        # ceja: arco saliente sobre los ojos (luz arriba, sombra abajo)
        for x in range(-6, 60):
            y = -70 + 0.002 * (x - 26) ** 2 * 3
            lz.pon_m((x, y - 1), pi, 4 if x < 30 else 3)
            lz.pon_m((x, y), pi, 3)
            lz.pon_m((x, y + 1), pi, 1)
        # mejillas: sombra suave bajo los ojos
        for (cx, cy, rx, ry) in ((10, -40, 10, 6), (50, -40, 9, 6)):
            for y in range(int(cy - ry), int(cy + ry) + 1):
                for x in range(int(cx - rx), int(cx + rx) + 1):
                    if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1 and (x + y) % 2 == 0:
                        X, Y = lz.a_px((x, y))
                        if lz.mat[Y, X] == pi and lz.ton[Y, X] > 1:
                            lz.ton[Y, X] -= 1
        # nariz ancha y chata
        nar = [(22, -62), (31, -62), (36, -46), (38, -38), (33, -34), (20, -34), (15, -38), (18, -46)]
        lz.poligono(nar, pi, sombreado=(1, 3, 4), ks=2, kl=1)
        for (x, y) in ((19, -37), (20, -37), (33, -37), (34, -37), (20, -36), (33, -36)):
            lz.pon_m((x, y), P['jade'], 0 if y == -36 else 1)
        lz.pon_m((26, -60), pi, 4)
        lz.pon_m((26, -58), pi, 4)
        # boca: labios gruesos en banda
        boca = q.g('boca')
        top, bot = -34.0 - boca * 1.5, -14.0 + boca * 1.0
        x0, x1 = 4.0, 58.0
        lab = [(x0 + 4, top), (x1 - 4, top), (x1, top + 4), (x1, bot - 4), (x1 - 4, bot), (x0 + 4, bot),
               (x0, bot - 4), (x0, top + 4)]
        ml = lz.poligono(lab, pi, sombreado=(2, 3, 4), ks=2, kl=2)
        borde = ml & ~(desplazar(ml, 0, 1) & desplazar(ml, 0, -1) & desplazar(ml, 1, 0) & desplazar(ml, -1, 0))
        lz.ton[borde] = 0
        for y_, x_ in zip(*np.nonzero(borde)):
            if lz.mat[y_ + 1, x_] == pi and not ml[y_ + 1, x_]:
                lz.ton[y_ + 1, x_] = max(0, lz.ton[y_ + 1, x_] - 1)
        # abertura
        ab = max(1.0, boca * 4.5)
        my = (top + bot) / 2
        for x in range(int(x0 + 6), int(x1 - 5)):
            for y in range(int(my - ab / 2), int(my + ab / 2) + 1):
                tn = 0 if y > my - ab / 2 + 1 or boca < 0.5 else 1
                lz.pon_m((x, y), os_, tn)
            if boca >= 1 and q.g('boca_brillo'):
                lz.pon_m((x, my + ab / 2 - 1), br, 0 if x % 3 else 1)
        if boca >= 1.2:
            # colmillos de piedra en las comisuras
            for fx_ in (x0 + 8, x1 - 9):
                for k in range(3):
                    lz.pon_m((fx_, my - ab / 2 + k), pi, 4 - k)
                    lz.pon_m((fx_ + 1, my - ab / 2 + k), pi, 3 - k)
        # surcos de la comisura
        lz.linea((x0 - 1, top + 3), (x0 - 3, bot + 2), pi, 0)
        lz.linea((x1 + 1, top + 3), (x1 + 2, bot + 1), pi, 0)
        # ojos
        for (cx, cy), r, lej in ((OJO_L, 8.0, True), (OJO_C, 10.0, False)):
            self.ojo(lz, cx, cy, r * (0.82 if lej else 1.0), r, q, lej)

    def ojo(self, lz, cx, cy, rx, ry, q, lejano):
        P = self.paleta
        pi, os_, br = P['piedra'], P['oscuro'], P['brillo']
        modo = q.g('ojos', 'normal')
        nivel = q.g('brillo', 0)
        for y in range(int(cy - ry - 2), int(cy + ry + 3)):
            for x in range(int(cx - rx - 2), int(cx + rx + 3)):
                d = ((x + 0.5 - cx) / (rx + 1.6)) ** 2 + ((y + 0.5 - cy) / (ry + 1.6)) ** 2
                di = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
                X, Y = lz.a_px((x, y))
                if d <= 1 and di > 1:
                    # aro tallado: claro arriba-izquierda, sombra abajo-derecha
                    lt = ((x - cx) * LUZ[0] + (y - cy) * LUZ[1]) / ry
                    lz.pon(X, Y, pi, 0 if lt < -0.2 else (4 if lt > 0.4 else 2), fijo=True)
                elif di <= 1:
                    if modo == 'brillo' and nivel:
                        tn = 2 if di < 0.12 * nivel else (1 if di < 0.55 + 0.1 * nivel else 0)
                        if 0.62 < di < 0.75 and nivel >= 2:
                            tn = 2
                        lz.pon(X, Y, br, tn, fijo=True)
                    else:
                        ring = 0.55 < di < 0.72
                        tn = 2 if ring else (0 if di > 0.72 else 1)
                        lz.pon(X, Y, os_, tn, fijo=True)
        X, Y = lz.a_px((cx, cy))
        if modo == 'normal':
            # pupila con reflejo
            lz.pon(X, Y, os_, 0, fijo=True)
            lz.pon(X + 1, Y, os_, 0, fijo=True)
            lz.pon(X - 2, Y - 3, pi, 4, fijo=True)
            lz.pon(X - 1, Y - 3, pi, 3, fijo=True)
        elif modo == 'brillo' and nivel:
            lz.pon(X - 2, Y - 3, br, 2, fijo=True)
        elif modo == 'cerrado':
            # párpado de piedra: la mitad de arriba se vuelve piedra y queda una línea
            for y in range(int(cy - ry), int(cy) + 1):
                for x in range(int(cx - rx), int(cx + rx) + 1):
                    if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                        XX, YY = lz.a_px((x, y))
                        lz.pon(XX, YY, pi, 2 if y < cy - 2 else 1, fijo=True)
            for x in range(int(cx - rx + 1), int(cx + rx)):
                lz.pon_m((x, cy), pi, 0, fijo=True)
                lz.pon_m((x, cy + 1), os_, 1, fijo=True)
        elif modo == 'calma':
            # ojos cerrados en paz: arco hacia abajo
            for y in range(int(cy - ry), int(cy + ry) + 1):
                for x in range(int(cx - rx), int(cx + rx) + 1):
                    if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                        XX, YY = lz.a_px((x, y))
                        lz.pon(XX, YY, pi, 3 if y < cy else 2, fijo=True)
            for x in range(int(cx - rx + 2), int(cx + rx - 1)):
                yy = cy + 1 + 2.2 * (1 - ((x - cx) / rx) ** 2)
                lz.pon_m((x, yy), pi, 0, fijo=True)
        elif modo == 'x':
            for k in range(-4, 5):
                for dx in (0, 1):
                    lz.pon(X + k + dx, Y + k, pi, 3, fijo=True)
                    lz.pon(X + k + dx, Y - k, pi, 3, fijo=True)
        elif modo == 'apagado':
            lz.pon(X, Y, os_, 2, fijo=True)

    # ------------------------------------------------------------------------------------------------
    def grietas(self, lz, q):
        P = self.paleta
        fase = int(q.g('grietas', 1))
        brillo = q.g('brillo_grietas', 0)
        calma = q.g('calma')
        col = P['brillo']
        for f in range(1, fase + 1):
            for linea in GRIETAS[f]:
                for a, b in zip(linea, linea[1:]):
                    tmp = lz.vacia_como()
                    tmp.linea(a, b, 0, 0)
                    for y, x in zip(*np.nonzero(tmp.mascara())):
                        if lz.mat[y, x] < 0:
                            continue
                        if brillo:
                            lz.pon(x, y, col, 2 if brillo >= 2 and not calma else 1, fijo=True)
                            # orilla oscura de la grieta
                            for dx, dy in ((1, 0), (0, 1)):
                                if lz.mat[y + dy, x + dx] == P['piedra']:
                                    lz.ton[y + dy, x + dx] = 0
                        else:
                            lz.pon(x, y, P['oscuro'], 1, fijo=True)
                            if lz.mat[y + 1, x + 1] == P['piedra']:
                                lz.ton[y + 1, x + 1] = min(4, lz.ton[y + 1, x + 1] + 1)

    def musgo(self, lz, q, cab):
        P = self.paleta
        mu = P['musgo']
        extra = q.g('musgo', 0)
        manchas = [(-46, -6, 14, 6), (-30, -2, 10, 4), (30, -4, 16, 5), (56, -10, 6, 8), (-20, -78, 8, 3),
                   (44, -80, 7, 3), (10, -12, 8, 3)]
        if extra:
            manchas += [(-50, -40, 8, 10), (0, -90, 12, 4), (60, -40, 5, 10), (20, -6, 14, 5)][:int(extra * 4)]
        for j, (cx, cy, rx, ry) in enumerate(manchas):
            for y in range(int(cy - ry), int(cy + ry) + 1):
                for x in range(int(cx - rx), int(cx + rx) + 1):
                    d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
                    if d > 1:
                        continue
                    X, Y = lz.a_px((x, y))
                    if not (0 <= Y < lz.h and 0 <= X < lz.w) or not cab[Y, X] or lz.fijo[Y, X]:
                        continue
                    if lz.mat[Y, X] not in (P['piedra'],):
                        continue
                    hh = _h(X, Y, j) % 10
                    if d > 0.55 and hh < 5:
                        continue
                    tn = 2 if (y < cy - ry * 0.3 and hh < 6) else (0 if hh > 7 else 1)
                    lz.pon(X, Y, mu, tn)

    def base(self, lz, q):
        """Piedras y tierra removida al pie de la cabeza."""
        P = self.paleta
        ti, pi = P['tierra'], P['piedra']
        for j, (x, r) in enumerate(((-62, 5), (-54, 3.5), (58, 4.5), (66, 3), (-70, 2.5), (40, 3))):
            lz.elipse((x, -r * 0.7), r, r * 0.75, ti if j % 2 else pi, tonos=(0, 1, 2))

    # ------------------------------------------------------------------------------------------------
    def efectos(self, lz, q):
        P = self.paleta
        br = P['brillo']
        k = int(q.g('k'))
        if q.g('anillos'):
            # carga de los rayos: anillos que se cierran sobre los ojos
            n = q.g('anillos')
            for (cx, cy), r0 in ((OJO_L, 8), (OJO_C, 10)):
                R = r0 + 10 - n * 3
                for a in range(0, 360, 8):
                    ra = math.radians(a + k * 11)
                    X, Y = lz.a_px((cx + math.cos(ra) * R, cy + math.sin(ra) * R * 0.9))
                    if (a // 8 + k) % 3 and lz.dentro(X, Y) and lz.mat[Y, X] < 0 or (lz.dentro(X, Y) and not lz.fijo[Y, X] and (a // 8) % 4 == 0):
                        lz.pon(X, Y, br, 1 if a % 16 else 2, fx=True)
        if q.get('chispas') is not None:
            chispas(lz, (24, -70), br, int(q['chispas']), radio=60, n=18, tonos=(1, 2), sube=4)
        if q.get('luz') is not None:
            chispas(lz, (10, -70), br, int(q['luz']), radio=66, n=20, tonos=(1, 2), sube=3)
        if q.get('polvo') is not None:
            pk = int(q['polvo'])
            for lado in (-1, 1):
                humo(lz, (lado * 54, -4), pk, P['tierra'], n=6, radio=6, abre=10, sube=3, tonos=(1, 2, 2),
                     semilla=20 + lado)
        if q.get('lascas') is not None:
            # lascas de piedra que saltan (cambio de fase): sin violencia, solo piedra y polvo
            lk = q['lascas']
            for j in range(9):
                a = math.radians(-160 + j * 36 + (_h(j, 4) % 20))
                r = 52 + lk * 11 + (_h(j, 5) % 10)
                x, y = 10 + math.cos(a) * r, min(-2.0, -64 + math.sin(a) * r * 0.85 + lk * lk * 3)
                X, Y = lz.a_px((x, y))
                for dx, dy in ((0, 0), (1, 0), (0, 1)) if j % 2 else ((0, 0), (1, 0)):
                    if lz.dentro(X + dx, Y + dy):
                        lz.pon(X + dx, Y + dy, P['piedra'], 3 if dy == 0 else 1, fx=True)

    def cizallar(self, lz, s):
        """Inclina toda la cabeza (las filas de arriba se corren `s` px por cada 100 px de alto)."""
        for Y in range(lz.h):
            wy = Y + 0.5 - lz.oy
            d = int(round(-wy * s / 100.0))
            if d == 0:
                continue
            for arr, vac in ((lz.mat, -1), (lz.ton, 0), (lz.fijo, False), (lz.fx, False)):
                fila = arr[Y].copy()
                arr[Y] = vac
                if d > 0:
                    arr[Y, d:] = fila[:-d]
                else:
                    arr[Y, :d] = fila[-d:]


B = PC(grietas=1, brillo=0, ojos='normal', boca=0, k=0)


def animaciones():
    A = {}
    # Reposo: respira la piedra (se alza 1 px), los ojos laten apenas, polvillo que cae.
    A['reposo'] = Anim([
        B.con(k=0),
        B.con(k=1, alzar=1),
        B.con(k=2, alzar=1, ojos='brillo', brillo=1),
        B.con(k=3, alzar=1),
        B.con(k=4),
        B.con(k=5, ojos='cerrado'),
    ], 3, True)
    # Caminar / correr (no se usan: se mece pesadamente)
    A['caminar'] = Anim([B.con(cizalla=-3, k=0), B.con(cizalla=0, alzar=2, k=1), B.con(cizalla=3, k=2),
                         B.con(cizalla=0, alzar=2, k=3)], 5, True)
    A['correr'] = Anim([p.con(polvo=i % 3) for i, p in enumerate(A['caminar'].poses)], 7, True)
    # Golpe = anuncio de las ondas: se hunde, se eleva temblando con los ojos encendidos (se queda arriba).
    A['golpe'] = Anim([
        B.con(ojos='brillo', brillo=1, boca=0.5, polvo=0, k=0),
        B.con(ojos='brillo', brillo=2, boca=1, alzar=6, polvo=1, k=1, brillo_grietas=1),
        B.con(ojos='brillo', brillo=3, boca=1.4, alzar=12, cizalla=-2, polvo=2, k=2, brillo_grietas=1),
        B.con(ojos='brillo', brillo=3, boca=1.4, alzar=13, cizalla=2, polvo=3, k=3, brillo_grietas=2),
    ], 8, False)
    # Ataque = rayos oculares: los ojos se cargan (anillos que se cierran) y la boca se abre.
    A['ataque'] = Anim([
        B.con(ojos='brillo', brillo=1, anillos=1, boca=0.5, k=0),
        B.con(ojos='brillo', brillo=2, anillos=2, boca=1.2, k=1, brillo_grietas=1),
        B.con(ojos='brillo', brillo=3, anillos=3, boca=1.8, boca_brillo=1, k=2, brillo_grietas=1),
        B.con(ojos='brillo', brillo=3, boca=2.0, boca_brillo=1, k=3, brillo_grietas=2, alzar=1),
    ], 6, False)
    A['disparar'] = Anim(A['ataque'].poses[2:], 8, False)
    A['lanzar'] = A['disparar']
    # Invocar (despertar / espíritus): boca muy abierta, ojos y grietas encendidos, chispas que suben.
    iv = B.con(ojos='brillo', brillo=3, boca=2.4, boca_brillo=1, brillo_grietas=2, grietas=2)
    A['invocar'] = Anim([iv.con(chispas=0, k=0), iv.con(chispas=1, k=1, alzar=1, boca=2.6),
                         iv.con(chispas=2, k=2, alzar=2, brillo=2), iv.con(chispas=3, k=3, alzar=1, boca=2.2)],
                        5, True)
    A['conjuro'] = Anim([B.con(ojos='brillo', brillo=1 + i % 2, boca=0.6, brillo_grietas=i % 2, k=i)
                         for i in range(4)], 4, True)
    # Salto / caída / aterrizar: se eleva y cae de golpe (polvo).
    A['salto'] = Anim([A['golpe'].poses[0], A['golpe'].poses[2]], 8, False)
    A['subida'] = A['salto']
    A['caida'] = Anim([B.con(ojos='brillo', brillo=2, boca=1, alzar=10)], 1, False)
    A['aterrizar'] = Anim([B.con(ojos='brillo', brillo=1, boca=0.6, polvo=1, k=1),
                           B.con(polvo=2, k=2), B.con(polvo=3, k=3)], 10, False)
    # Aturdido (ventana): ojos apagados de piedra, ladeada, se mece; polvillo.
    at = B.con(ojos='cerrado', grietas=2, brillo_grietas=0)
    A['aturdido'] = Anim([at.con(cizalla=-4, k=0), at.con(cizalla=-5, k=1, ojos='apagado'),
                          at.con(cizalla=-3, k=2), at.con(cizalla=-4, k=3, ojos='apagado')], 3, True)
    A['agotado'] = A['aturdido']
    # Daño = cambio de fase: se sacude, las grietas se abren y brillan, saltan lascas.
    A['dano'] = Anim([
        B.con(ojos='x', grietas=2, brillo_grietas=2, cizalla=4, lascas=0, boca=1.4, k=0),
        B.con(ojos='x', grietas=3, brillo_grietas=2, cizalla=-3, lascas=1, boca=1.6, k=1, polvo=0),
        B.con(ojos='brillo', brillo=2, grietas=3, brillo_grietas=1, lascas=2, boca=1, k=2, polvo=1),
    ], 7, False)
    # Purificar (calmada): las grietas brillan suave y se apagan, ojos cerrados en paz, el musgo la cubre.
    A['purificar'] = Anim([
        B.con(ojos='cerrado', grietas=3, brillo_grietas=2, calma=1, luz=0, k=0),
        B.con(ojos='calma', grietas=3, brillo_grietas=1, calma=1, luz=1, musgo=0.25, k=1),
        B.con(ojos='calma', grietas=3, brillo_grietas=1, calma=1, luz=2, musgo=0.5, k=2),
        B.con(ojos='calma', grietas=3, brillo_grietas=0, calma=1, luz=3, musgo=1.0, k=3),
    ], 2, False)
    # Morir (no lo usa el juego: se calma con purificar): ojos en X, grietas, polvo.
    A['morir'] = Anim([A['dano'].poses[0], A['dano'].poses[1],
                       B.con(ojos='x', grietas=3, polvo=2, musgo=0.5, k=2),
                       B.con(ojos='calma', grietas=3, polvo=3, musgo=1.0, k=3)], 4, False)
    A['esquivar'] = Anim([B.con(cizalla=-6, alzar=4, polvo=0), B.con(cizalla=4, polvo=1)], 8, False)
    A['interactuar'] = Anim([B.con(ojos='brillo', brillo=1, k=0), B.con(k=1, alzar=1)], 3, False)
    return A


PERSONAJE = CabezaOlmeca()
