"""Madre (~40 años, criptógrafa sorda): blusa blanca de manga corta abullonada, pañoleta café al cuello, cabello
oscuro recogido en chongo, aretes dorados, pantalón café de tiro alto con cinturón, tenis claros. Habla en LSM:
sus poses de conjuro / interactuar / invocar son señas claras con las dos manos."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas, mat_rot  # noqa: E402
from humanoide import Humanoide  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import animaciones_humanas  # noqa: E402

PAL = Paleta([
    Material('pelo',     ['#140c10', '#2a1a1c', '#42292a', '#5e3e38'],             '#140c10'),
    Material('piel',     ['#6a3628', '#a2644a', '#cc916a', '#eab48c'],             '#2a1a1c'),
    Material('blusa',    ['#8a8790', '#cfccc8', '#f4f1ea'],                        '#2e2c34'),
    Material('panoleta', ['#3e1c12', '#6e3a22', '#9a5a30', '#c4844a'],             '#2a140c'),
    Material('pantalon', ['#241812', '#3e2c22', '#5c4434', '#7c6048'],             '#140c10'),
    Material('oro',      ['#7a5a1a', '#d0a030', '#ffe07a'],                        '#3e1c12'),
    Material('suela',    ['#45434a', '#625f62'],                                   '#1e1c24'),
    Material('labios',   ['#9a3e44'],                                              '#6a3628'),
])

# ------------------------------------------------------------------------------------------------
# Cabeza 14×13: chongo atrás, arete dorado bajo la oreja. Ancla 'cuello'.
# ------------------------------------------------------------------------------------------------
LEY_CABEZA = {
    '0': ('pelo', 0), '1': ('pelo', 1), '2': ('pelo', 2), '3': ('pelo', 3),
    's': ('piel', 1), 'k': ('piel', 2), 'l': ('piel', 3), 'd': ('piel', 0, 'f'),
    'e': ('pelo', 0, 'f'), 'b': ('pelo', 1, 'f'), 'm': ('labios', 0, 'f'), 'w': ('blusa', 2, 'f'),
    'o': ('oro', 2, 'f'), 'O': ('oro', 1, 'f'),
}
CABEZA_N = """
    .....112211...
    ...1122333221.
    .1112223332211
    1221122222211.
    123211222111l.
    12210121111lk.
    .110121llkbbk.
    ..01121skwekk.
    ..0111kskkekkk
    ...011sOkkkks.
    ....0s.okkmk..
    .....ssskkk...
    .....sss......
"""


def _var(filas: dict) -> str:
    ls = [l.strip() for l in CABEZA_N.strip('\n').split('\n')]
    for i, f in filas.items():
        ls[i] = f
    return '\n'.join(ls)


CABEZAS = {
    'normal': CABEZA_N,
    'parpadeo': _var({7: '..01121skkkkk.', 8: '..0111kskbbkkk'}),
    'concentrado': _var({6: '.110121llkkbb.', 7: '..01121skbekk.'}),
    'apunta': _var({6: '.110121llkkbb.', 7: '..01121skbekk.'}),
    'grito': _var({6: '.110121llkkbb.', 10: '....0s.okmmk..', 11: '.....sssmkk...'}),
    'dolor': _var({6: '.110121llbbkk.', 7: '..01121skkbbk.', 8: '..0111kskbkkkk', 10: '....0s.okmmk..'}),
    'sonrie': _var({10: '....0s.okkmk..', 9: '...011sOkkkms.'}),
}


def _cabeza(nombre):
    return Mapa.de_texto(CABEZAS.get(nombre, CABEZA_N), LEY_CABEZA, PAL, {'cuello': (6, 12)})


# ------------------------------------------------------------------------------------------------
# Torso: blusa (W w V), pañoleta anudada (p P Q), cinturón (g) con hebilla dorada, pantalón de tiro alto (c C D).
# ------------------------------------------------------------------------------------------------
LEY_TORSO = {
    'w': ('blusa', 0), 'W': ('blusa', 1), 'V': ('blusa', 2),
    'q': ('panoleta', 0), 'p': ('panoleta', 1), 'P': ('panoleta', 2), 'Q': ('panoleta', 3),
    'c': ('pantalon', 1), 'C': ('pantalon', 2), 'D': ('pantalon', 3), 'g': ('pantalon', 0),
    'o': ('oro', 2, 'f'), 'O': ('oro', 1, 'f'),
}
TORSO = """
    ......pPPp....
    .....pPQQPp...
    ..wWVWpPQPPp..
    .wWVVVWpPPPqq.
    wWVVVVWWpPPQpW
    wWVVVWWWWpPPqW
    wWVVWWWWWWpPqV
    wWVWWWWWWWWqpW
    wWWWWWWWWWWWqW
    wWWWWWWWWWWWWw
    .wWWWWWWWWWWw.
    .wWWWWWWWWWw..
    .wwWWWWWWWww..
    .wwWWWWWWWww..
    .gggggggggOog.
    cCCDDCCCCCCCc.
    cCDDCCCCCCCCc.
    cCDCCCCCCCCCc.
    cCCCCCCCCCCCc.
    .cccCCCCCCcc..
"""
ANCLAS_TORSO = {'o': (6, 18), 'cuello': (7, 0), 'hombro_c': (6, 3), 'hombro_l': (3, 3)}

LEY_TENIS = {'w': ('blusa', 0), 'W': ('blusa', 1), 'V': ('blusa', 2), 's': ('suela', 1), 'S': ('suela', 0)}
TENIS = Mapa.de_texto("""
    .WVW.....
    WVVVWW...
    wWWWWVVW.
    wwWWWWWWW
    SssssssS.
""", LEY_TENIS, PAL, {'o': (2, 0)})


class Madre(Humanoide):
    id = 'madre'
    fw, fh = 80, 88
    pivote = (40, 85)
    alto = 70
    L_muslo, L_pierna, L_pie, alto_tobillo = 15, 14, 8, 3
    L_brazo, L_ante = 11, 10
    sep_cadera = (1.0, -1.0)
    paleta = PAL

    def torso_mapa(self, pose):
        return Mapa.de_texto(TORSO, LEY_TORSO, PAL, ANCLAS_TORSO)

    def cabeza_mapa(self, pose):
        return _cabeza(pose.cara)

    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        capa.estampa(TENIS, p['tobillo'], mat_rot(-p['ang_pie']), 'o')
        pa = P['pantalon']
        tob = mas(p['tobillo'], dir_ang(p['ang_pierna']), 1.0)
        capa.capsula(p['rodilla'], tob, 2.8, 2.9, pa, tonos=(1, 2, 3), redondo_b=False)
        capa.capsula(p['cadera'], p['rodilla'], 3.5, 2.8, pa, tonos=(1, 2, 3), pliegues=[(0.92, 0)])

    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        erguida = mano.startswith('sena_')
        if not erguida:
            dibujar_mano(capa, P, b, mano)
        pi, bl = P['piel'], P['blusa']
        # antebrazo de piel; reloj dorado en la muñeca cercana
        bandas = [(0.80, 0.92, P['oro'], (0, 1, 2))] if lado == 'c' else []
        capa.capsula(b['codo'], b['muneca'], 1.9, 1.6, pi, tonos=(1, 2, 3), bandas=bandas, redondo_b=False)
        # brazo: manga corta abullonada hasta la mitad, luego piel
        capa.capsula(b['hombro'], b['codo'], 2.3, 2.0, pi, tonos=(1, 2, 3))
        capa.capsula(b['hombro'], mas(b['hombro'], dir_ang(b['ang_brazo']), 5.5),
                     2.9, 2.5, bl, tonos=(0, 1, 2), redondo_b=True)
        if erguida:
            dibujar_mano(capa, P, b, mano)


BASE = Pose(tronco=0, hombro_c=6, codo_c=16, hombro_l=-4, codo_l=14,
            muslo_c=5, rodilla_c=3, pie_c=0, muslo_l=-4, rodilla_l=2, pie_l=0)


def animaciones():
    A = animaciones_humanas(BASE, paso=0.9, senas=('sena_b', 'sena_l', 'sena_y', 'sena_o'), lean_correr=10)
    B = BASE
    # El deletreo en LSM es con UNA mano (la cercana, frente a la cara); la otra descansa.
    sen = B.con(tronco=0, hombro_c=74, codo_c=76, hombro_l=-2, codo_l=30,
                muslo_c=8, rodilla_c=4, muslo_l=-6, cara='normal')
    A['conjuro'] = Anim([
        sen.con(mano_c='sena_b'),
        sen.con(hombro_c=80, codo_c=70, mano_c='sena_l', mano_l='puno', hombro_l=0),
        sen.con(hombro_c=70, codo_c=82, mano_c='sena_y', mano_l='puno', hombro_l=-4, cara='sonrie'),
        sen.con(hombro_c=78, codo_c=74, mano_c='sena_u'),
    ], 5, True)
    A['interactuar'] = Anim([sen.con(mano_c='sena_d', cara='sonrie'),
                             sen.con(hombro_c=50, codo_c=104, mano_c='sena_a', cara='sonrie')], 4, False)
    # Invocar (la madre despierta / MAMA): brazos que se abren con las palmas al frente.
    inv = B.con(tronco=-3, hombro_c=110, codo_c=20, hombro_l=96, codo_l=24, mano_c='abierta', mano_l='abierta',
                cabeza=-6, cara='concentrado', muslo_c=10, muslo_l=-8)
    A['invocar'] = Anim([inv, inv.con(hombro_c=120, hombro_l=104, hunde=1), inv.con(hombro_c=126, hombro_l=110),
                         inv.con(hombro_c=116, hunde=1)], 5, True)
    # Disparar no lo usa; por si acaso, señala al frente.
    A['disparar'] = Anim([B.con(hombro_c=84, codo_c=6, mano_c='sena_d', cara='concentrado')], 1, False)
    return A


PERSONAJE = Madre()
