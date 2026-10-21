"""Protagonista (18–20 años): chamarra café de punto con franjas claras, camisa blanca, pantalón caqui,
tenis blancos, bolsa cruzada, gema roja al cuello y pistola láser (brillo turquesa al disparar)."""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import (Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas, mat_rot, mezclar)  # noqa: E402
from humanoide import Humanoide  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import animaciones_humanas  # noqa: E402

# ------------------------------------------------------------------------------------------------
# Paleta (≤ 32 colores). Rampas tomadas de la paleta global de ECOS (ART_SPEC §3) y extendidas donde el
# vestuario lo pide (piel morena, caqui). Contornos: el tono más oscuro de cada familia, nunca negro.
# ------------------------------------------------------------------------------------------------
PAL = Paleta([
    #            nombre       rampa (oscuro → claro)                                  contorno
    Material('pelo',     ['#1e120e', '#3a2418', '#5c3a24', '#8a6246'],             '#1e120e'),
    Material('chamarra', ['#2a1810', '#45291b', '#674330', '#8a6246'],             '#1e120e'),
    Material('franja',   ['#8a7556', '#d2bf96', '#ece0c2'],                        '#3a2418'),
    Material('piel',     ['#5e2f22', '#94573e', '#c07e58', '#e3a77c'],             '#3a2418'),
    Material('camisa',   ['#8a8790', '#c9c6c4', '#f0ede4'],                        '#2e2c34'),
    Material('caqui',    ['#5e4c36', '#8a7556', '#b29b76', '#d2bf96'],             '#1e120e'),
    Material('suela',    ['#45434a', '#625f62'],                                   '#1e1c24'),
    Material('gema',     ['#5a0a1a', '#b81c30', '#ff4a3a', '#ffc4a8'],             '#5a0a1a'),
    Material('metal',    ['#1e1c24', '#2e2c34', '#45434a', '#625f62'],             '#1e1c24'),
    Material('turquesa', ['#128a8a', '#2ad0c0', '#9af8e8', '#e8fff8'],             '#128a8a'),
])

# ------------------------------------------------------------------------------------------------
# Cabeza (mirando a la derecha). 12×13. Ancla 'cuello' = donde se apoya en el torso.
#   0-3 pelo (oscuro→claro) · s k l piel (sombra, base, luz) · d piel profunda · e ojo · b ceja · m boca
# ------------------------------------------------------------------------------------------------
LEY_CABEZA = {
    '0': ('pelo', 0), '1': ('pelo', 1), '2': ('pelo', 2), '3': ('pelo', 3),
    'd': ('piel', 0), 's': ('piel', 1), 'k': ('piel', 2), 'l': ('piel', 3),
    'e': ('pelo', 0, 'f'), 'b': ('pelo', 1, 'f'), 'm': ('piel', 0, 'f'),
    'w': ('camisa', 2, 'f'),
}

CABEZAS = {
    'normal': """
        ....12221...
        ..112233221.
        .11223333221
        012222322221
        0122122lllk.
        012112lllkk.
        01211kkbbbk.
        0111kskwekk.
        0110kskkekkk
        .010ksskkkks
        ..00sskkkmk.
        ...sssskkk..
        ....sss.....
    """,
}


def variante(base: str, filas: dict) -> str:
    """Copia de un mapa con algunas filas cambiadas (expresiones: solo cambian ojos, cejas y boca)."""
    ls = [l.strip() for l in base.strip('\n').split('\n')]
    for i, f in filas.items():
        ls[i] = f
    return '\n'.join(ls)


_N = CABEZAS['normal']
CABEZAS['parpadeo'] = variante(_N, {7: '0111kskkkkk.', 8: '0110kskbbkkk'})
CABEZAS['concentrado'] = variante(_N, {6: '01211kkkbbb.', 7: '0111kskbekk.'})
CABEZAS['apunta'] = variante(_N, {6: '01211kkkbbk.', 7: '0111kskbekk.', 8: '0110kskkekkk'})
CABEZAS['grito'] = variante(_N, {6: '01211kkkbbb.', 7: '0111kskbekk.', 10: '..00sskkmmk.', 11: '...ssskkmk..'})
CABEZAS['dolor'] = variante(_N, {6: '01211kkbbkk.', 7: '0111kskkbbk.', 8: '0110kskbkkkk', 10: '..00sskmmmk.'})


def _cabeza(nombre: str) -> Mapa:
    return Mapa.de_texto(CABEZAS[nombre], LEY_CABEZA, PAL, {'cuello': (5, 12)})


# ------------------------------------------------------------------------------------------------
# Torso. Ancla 'o' = cadera; 'cuello' = base del cuello; hombros cercano y lejano.
#   j J K chamarra (sombra, base, luz) · q sombra profunda · r R franja (luz, sombra) · W w V camisa
# ------------------------------------------------------------------------------------------------
LEY_TORSO = {
    'q': ('chamarra', 0), 'j': ('chamarra', 1), 'J': ('chamarra', 2), 'K': ('chamarra', 3),
    'r': ('franja', 2), 'R': ('franja', 1), 'T': ('franja', 0),
    'w': ('camisa', 0), 'W': ('camisa', 1), 'V': ('camisa', 2),
    'n': ('piel', 1),
}

TORSO = """
    .....RrRrVW.....
    ....rRrRrRVW....
    ..jjJKKKKKJjVW..
    .jJKKKKKKJJjWVW.
    jJKKKKKKJJJjWVWw
    jJKKKKKJJJJjWWWw
    jJKKKKJJJJJjWWWw
    jJKKKJJJJJJjWWWw
    jJKKJJJJJJJjWWWw
    jJKJJJJJJJJjWWw.
    jJKJJJJJJJJjWWw.
    jJJJJJJJJJJjwWw.
    jjJJJJJJJJJjwWw.
    jjJJJJJJJJJJjWw.
    jjJJJJJJJJJJjWw.
    qjJJJJJJJJJJjww.
    qjjJJJJJJJJJJj..
    qjjjJJJJJJJJJj..
    RrRrRrRrRrRrRr..
    TRTRTRTRTRTRTR..
    qjjjjjjjjjjjjj..
    .qqjjjjjjjjjjq..
"""
ANCLAS_TORSO = {'o': (6, 20), 'cuello': (7, 0), 'hombro_c': (7, 3), 'hombro_l': (4, 3),
                'bolsa': (1, 18), 'gema': (14, 8), 'nuca': (6, 0)}


def _torso() -> Mapa:
    return Mapa.de_texto(TORSO, LEY_TORSO, PAL, ANCLAS_TORSO)


# ------------------------------------------------------------------------------------------------
# Tenis (ancla 'o' = tobillo). Bolsa (ancla 'o' = donde cuelga de la correa).
# ------------------------------------------------------------------------------------------------
LEY_TENIS = {'w': ('camisa', 0), 'W': ('camisa', 1), 'V': ('camisa', 2), 's': ('suela', 1), 'S': ('suela', 0)}
TENIS = Mapa.de_texto("""
    .WVW......
    WVVVWW....
    wWWWWVVW..
    wwWWWWWWW.
    SssssssssS
""", LEY_TENIS, PAL, {'o': (2, 0)})

LEY_BOLSA = {'q': ('pelo', 0), 'j': ('pelo', 1), 'J': ('pelo', 2), 'K': ('pelo', 3), 'h': ('metal', 3, 'f'),
             't': ('turquesa', 1, 'f')}
BOLSA = Mapa.de_texto("""
    .jJJJJj.
    jJKKKKJj
    jJKhJJJj
    jJJtJJJj
    jJJJJJJj
    qjjjjjjq
""", LEY_BOLSA, PAL, {'o': (4, 0)})


# Pistola láser (ancla 'o' = empuñadura). El emisor turquesa se enciende al disparar.
LEY_PISTOLA = {'m': ('metal', 1), 'M': ('metal', 2), 'L': ('metal', 3), 't': ('turquesa', 0, 'f'),
               'T': ('turquesa', 1, 'f')}
PISTOLA = Mapa.de_texto("""
    .LLLLLMt.
    mMMMMMMtT
    .mmMm....
    .mm......
""", LEY_PISTOLA, PAL, {'o': (2, 2)})


class Protagonista(Humanoide):
    id = 'protagonista'
    fw, fh = 80, 88
    pivote = (40, 85)
    alto = 72
    L_muslo, L_pierna, L_pie, alto_tobillo = 17, 16, 9, 3
    L_brazo, L_ante = 12, 11
    sep_cadera = (1.0, -1.0)
    paleta = PAL

    def torso_mapa(self, pose):
        return _torso()

    def cabeza_mapa(self, pose):
        return _cabeza(pose.cara if pose.cara in CABEZAS else 'normal')

    # ---- miembros ---------------------------------------------------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        # tenis
        capa.estampa(TENIS, p['tobillo'], mat_rot(-p['ang_pie']), 'o')
        # pantorrilla (con el dobladillo del pantalón cubriendo el tobillo) y muslo
        caq = P['caqui']
        tob = mas(p['tobillo'], dir_ang(p['ang_pierna']), 1.0)
        capa.capsula(p['rodilla'], tob, 2.7, 2.6, caq, tonos=(1, 2, 3), redondo_b=False)
        capa.capsula(p['cadera'], p['rodilla'], 3.6, 2.8, caq, tonos=(1, 2, 3), pliegues=[(0.92, 0)])

    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        ch, fr = P['chamarra'], P['franja']
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        erguida = mano.startswith('sena_')
        if not erguida:
            dibujar_mano(capa, P, b, 'puno' if mano == 'pistola' else mano)
        capa.capsula(b['codo'], b['muneca'], 2.2, 1.9, ch, tonos=(1, 2, 3),
                     bandas=[(0.70, 0.79, fr, (0, 1, 2)), (0.88, 1.2, fr, (0, 1, 2))], redondo_b=False)
        capa.capsula(b['hombro'], b['codo'], 2.6, 2.3, ch, tonos=(1, 2, 3))
        if erguida:   # las señas van encima del puño de la manga
            dibujar_mano(capa, P, b, mano)
        if mano == 'pistola':
            # la pistola sigue al antebrazo (90° = horizontal hacia adelante)
            capa.estampa(PISTOLA, mas(b['muneca'], dir_ang(b['ang_ante']), 1.5), mat_rot(90 - b['ang_ante']), 'o')
            b['canon'] = mas(b['muneca'], dir_ang(b['ang_ante']), 9.5)

    # ---- efectos (sin contorno) -----------------------------------------------------------
    def retoques(self, lz, c, pose):
        P = self.paleta
        tq = P['turquesa']
        k = pose.extra.get('destello')
        if k and 'canon' in c['brazo_c']:
            x, y = lz.a_px(c['brazo_c']['canon'])
            # destello en estrella: centro blanco, brazos turquesa (tramado en las puntas, sin semitransparencia)
            r = 3 if k >= 2 else 2
            for i in range(-r, r + 1):
                t = 3 if abs(i) == 0 else (2 if abs(i) == 1 else 1)
                lz.pon(x + i + (r if k >= 2 else 1), y, tq, t, fx=True)
                if abs(i) <= r - 1:
                    lz.pon(x + (r if k >= 2 else 1), y + i, tq, t, fx=True)
            if k >= 2:
                for dx, dy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
                    lz.pon(x + r + dx * 2, y + dy * 2, tq, 0, fx=True)
        ch = pose.extra.get('chispas')
        if ch is not None:
            # chispas de luz alrededor de las manos (posiciones fijas por cuadro: no hay azar)
            pts = [(-3, -4), (4, -6), (1, -9), (-5, 1), (6, -1), (2, 3)]
            for brazo in ('brazo_c', 'brazo_l'):
                w = c[brazo]['muneca']
                for j, (dx, dy) in enumerate(pts):
                    if (j + ch) % 3 == 0:
                        px, py = lz.a_px((w[0] + dx, w[1] + dy - ch))
                        lz.pon(px, py, tq, 3, fx=True)
                        if (j + ch) % 2 == 0:
                            for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                                if lz.mat[py + ey, px + ex] < 0:
                                    lz.pon(px + ex, py + ey, tq, 1, fx=True)

    # ---- capas extra ------------------------------------------------------------------------
    def orden(self, pose):
        o = super().orden(pose)
        o.insert(o.index('cabeza') + 1, 'bolsa')
        return o

    def parte_bolsa(self, lz, c, pose):
        P = self.paleta
        p = lz.parte()
        tor = c['torso']
        anc = tor.punto('bolsa')
        # correa: del hombro cercano a la bolsa
        p.linea(tor.punto('hombro_c', 1, -2), anc, P['pelo'], 1)
        p.estampa(BOLSA, mas(anc, (-1, 0)), c['M_torso'] if abs(pose.tronco) < 30 else c['R'], 'o')
        # gema colgada del cuello
        g = tor.punto('gema')
        p.linea(tor.punto('cuello', 3, 0), g, P['pelo'], 0)
        p.pon_m(g, P['gema'], 2, fijo=True)
        p.pon_m(mas(g, (0, 1)), P['gema'], 1, fijo=True)
        p.pon_m(mas(g, (1, 0)), P['gema'], 1, fijo=True)
        p.pon_m(mas(g, (1, 1)), P['gema'], 0, fijo=True)
        p.pon_m(mas(g, (0, 2)), P['gema'], 0, fijo=True)
        return [(p, 'contorno', 0)]


# ------------------------------------------------------------------------------------------------
# Animaciones
# ------------------------------------------------------------------------------------------------
BASE = Pose(tronco=2, hombro_c=4, codo_c=14, hombro_l=-4, codo_l=12,
            muslo_c=6, rodilla_c=4, pie_c=0, muslo_l=-5, rodilla_l=2, pie_l=0)

def animaciones():
    A = animaciones_humanas(BASE)
    # Disparar: brazo extendido con la pistola; destello turquesa y retroceso.
    B = BASE
    dsp = B.con(tronco=0, hombro_c=78, codo_c=4, hombro_l=10, codo_l=30, muslo_c=14, rodilla_c=8,
                muslo_l=-12, rodilla_l=6, pie_l=0, mano_c='pistola', cabeza=0, cara='apunta')
    A['disparar'] = Anim([dsp.con(extra={'destello': 2}), dsp.con(hombro_c=86, codo_c=10, tronco=-3, extra={'destello': 1}),
                          dsp.con(hombro_c=80, codo_c=6, tronco=-1)], 12, False)

    return A


PERSONAJE = Protagonista()
