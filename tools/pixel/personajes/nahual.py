"""Nahual infiltrado en forma humana: hombre fornido de cabello negro largo y barba, camiseta sin mangas azul
marino con escote abierto, muñequeras azules, pantalón cargo pardo con cinturón, botas oscuras. Pelea a puño
limpio; su `invocar` es el momento en que empieza a transformarse (se encorva, manos en garra, ojos que brillan
en ámbar). La forma animal es otro kit (`nahual_animal`).

Medidas: cuadro 96×88, pivote (48, 85), ~74 px de alto (su kit de Codex: 74 px a escala 1)."""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas, mat_rot  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import animaciones_humanas  # noqa: E402
from personajes._humanoides import HumanoideX, chispas, pelo_largo, variante  # noqa: E402

PAL = Paleta([
    Material('pelo',     ['#120e12', '#221a1e', '#362a2c', '#4e3e3a'],             '#0a0608'),
    Material('piel',     ['#5a3220', '#8e5634', '#b87a4c', '#d89c68'],             '#2e1810'),
    Material('camisa',   ['#121828', '#202a42', '#33415e', '#4b5b7c'],             '#0a0c16'),
    Material('pantalon', ['#2a241e', '#463c30', '#605244', '#7c6a54'],             '#16120e'),
    Material('bota',     ['#1a1614', '#2c2622', '#433a32'],                        '#0e0a08'),
    Material('metal',    ['#6a5a3e', '#a8916a', '#d8c49a'],                        '#2a2016'),
    Material('ambar',    ['#7a3a10', '#d07a20', '#ffc860', '#fff0b0'],             '#7a3a10'),
])

LEY_CABEZA = {
    '0': ('pelo', 0), '1': ('pelo', 1), '2': ('pelo', 2), '3': ('pelo', 3),
    's': ('piel', 1), 'k': ('piel', 2), 'l': ('piel', 3), 'd': ('piel', 0),
    'e': ('pelo', 0, 'f'), 'b': ('pelo', 0, 'f'), 'w': ('metal', 2, 'f'), 'm': ('piel', 0, 'f'),
    'B': ('pelo', 1, 'f'), 'A': ('ambar', 2, 'f'), 'a': ('ambar', 1, 'f'),
}
# Cabeza 14×15: melena hacia atrás, frente despejada, ceja gruesa, nariz recta, barba cerrada.
CABEZA_N = """
    .....112221...
    ...1122333221.
    ..112223333221
    .1122222332211
    .11221122221k.
    112211122lllk.
    11221111kkkkk.
    1122111kbbbbk.
    112211kkwekkk.
    11221dskkekkkl
    11221dskkkkkks
    1121.dB1kk1kk.
    .121..B1B1BB..
    ..1...BB1BB...
    .......BB.....
"""
CABEZAS = {
    'normal': CABEZA_N,
    'parpadeo': variante(CABEZA_N, {8: '112211kkkkkkk.', 9: '11221dskbbkkkl'}),
    'concentrado': variante(CABEZA_N, {7: '1122111kkbbbb.', 8: '112211kkbekkk.'}),
    'grito': variante(CABEZA_N, {7: '1122111kkbbbb.', 8: '112211kkbekkk.', 11: '1121.dB1kmmmk.', 12: '.121..B1mmBB..'}),
    'dolor': variante(CABEZA_N, {7: '1122111kbbkkk.', 8: '112211kkkbbkk.', 9: '11221dskkkkkkl',
                                 11: '1121.dB1kmmkk.'}),
    # transformándose: ojos ámbar que brillan, gesto feroz
    'bestia': variante(CABEZA_N, {7: '1122111kkbbbb.', 8: '112211kkaAkkk.', 11: '1121.dB1wmwmk.', 12: '.121..B1mmBB..'}),
}
CABEZAS['apunta'] = CABEZAS['concentrado']


def _cabeza(nombre: str) -> Mapa:
    return Mapa.de_texto(CABEZAS.get(nombre, CABEZA_N), LEY_CABEZA, PAL, {'cuello': (7, 14), 'nuca': (3, 5)})


LEY_TORSO = {
    'q': ('camisa', 0), 'j': ('camisa', 1), 'J': ('camisa', 2), 'K': ('camisa', 3),
    's': ('piel', 1), 'k': ('piel', 2), 'l': ('piel', 3),
    'c': ('pantalon', 1), 'C': ('pantalon', 2), 'D': ('pantalon', 3), 'g': ('pantalon', 0),
    'O': ('metal', 2, 'f'), 'o': ('metal', 1, 'f'),
}
# Torso ancho: camiseta sin mangas (los hombros quedan a la vista: los pone el brazo), escote en V.
TORSO = """
    .......skk......
    .....jJJsklJj...
    ...jJKKKJsklJj..
    ..jJKKKKKJskJJj.
    ..jJKKKKKJJkJJj.
    ..jJKKKKJJJskJj.
    ..jJKKKJJJJJJjj.
    ..jJKKJJJJJJJjj.
    ..jJKKJJJJJJJj..
    ..jJKJJJJJJJJj..
    ..jJKJJJJJJJJj..
    ..jJJJJJJJJJJj..
    ..jjJJJJJJJJJj..
    ..qjJJJJJJJJjj..
    ..qjjJJJJJJJjj..
    ..qjjjJJJJJjjq..
    ..ggggggggoOOg..
    ..cCCDDCCCCCCc..
    ..cCDDCCCCCCCc..
    ..cCDCCCCCCCCc..
    ..ccCCCCCCCCcc..
"""
ANCLAS_TORSO = {'o': (7, 20), 'cuello': (8, 0), 'hombro_c': (9, 3), 'hombro_l': (5, 3)}

LEY_BOTA = {'a': ('bota', 0), 'b': ('bota', 1), 'c': ('bota', 2)}
BOTA = Mapa.de_texto("""
    bccb......
    bccbb.....
    bcbbbcc...
    abbbbbbcc.
    aaaaaaaaaa
""", LEY_BOTA, PAL, {'o': (2, 0)})


class Nahual(HumanoideX):
    id = 'nahual'
    fw, fh = 96, 88
    pivote = (48, 85)
    alto = 74
    L_muslo, L_pierna, L_pie, alto_tobillo = 17, 17, 10, 4
    L_brazo, L_ante = 12, 11
    sep_cadera = (1.5, -1.5)
    paleta = PAL

    def torso_mapa(self, pose):
        return Mapa.de_texto(TORSO, LEY_TORSO, PAL, ANCLAS_TORSO)

    def cabeza_mapa(self, pose):
        return _cabeza(pose.cara)

    def orden(self, pose):
        o = ['pelo', 'brazo_l', 'pierna_l', 'pierna_c', 'torso', 'cabeza', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        capa.estampa(BOTA, p['tobillo'], mat_rot(-p['ang_pie']), 'o')
        pa = P['pantalon']
        tob = mas(p['tobillo'], dir_ang(p['ang_pierna']), 1.5)
        capa.capsula(p['rodilla'], tob, 3.0, 3.1, pa, tonos=(1, 2, 3), redondo_b=False, pliegues=[(0.5, 1)])
        # muslo con bolsa de carga (banda más oscura a media pierna)
        capa.capsula(p['cadera'], p['rodilla'], 4.0, 3.2, pa, tonos=(1, 2, 3), pliegues=[(0.92, 0)],
                     bandas=[(0.45, 0.72, pa, (0, 1, 2))])

    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        dibujar_mano(capa, P, b, 'garra' if mano == 'garra' else ('abierta' if mano.startswith('sena') else mano),
                     tam=1.25)
        pi = P['piel']
        capa.capsula(b['codo'], b['muneca'], 2.7, 2.2, pi, tonos=(1, 2, 3),
                     bandas=[(0.72, 1.05, P['camisa'], (1, 2, 3))], redondo_b=False)
        capa.capsula(b['hombro'], b['codo'], 3.4, 2.7, pi, tonos=(1, 2, 3))
        # deltoide y bíceps
        capa.elipse(mas(b['hombro'], dir_ang(b['ang_brazo']), 2.0), 3.6, 3.4, pi, tonos=(1, 2, 3))
        capa.elipse(mas(b['hombro'], dir_ang(b['ang_brazo']), 6.5), 3.0, 3.0, pi, tonos=(1, 2, 3))

    def parte_pelo(self, lz, c, pose):
        p = lz.parte()
        est = self.cabeza_previa(c, pose)
        raiz = est.punto('nuca')
        v = float(pose.extra.get('viento', 0))
        pelo_largo(p, raiz, 21, 10, self.paleta['pelo'], viento=v * 1.6, R=c['R'], mechones=5,
                   fase=pose.extra.get('fase', 0), tonos=(1, 2, 3), abajo=(-0.25, 1.0))
        return [(p, 'contorno', 0)]

    def retoques(self, lz, c, pose):
        ch = pose.extra.get('chispas')
        if ch is not None:
            chispas(lz, [c['brazo_c']['muneca'], c['brazo_l']['muneca'], mas(c['cuello'], (2, -8))],
                    self.paleta['ambar'], int(ch), 3, 1)


BASE = Pose(tronco=4, hombro_c=8, codo_c=20, hombro_l=-2, codo_l=18,
            muslo_c=7, rodilla_c=4, pie_c=0, muslo_l=-6, rodilla_l=2, pie_l=0)


def animaciones():
    A = animaciones_humanas(BASE, lean_correr=14)
    B = BASE

    def vt(anim, v):
        return Anim([p.con(extra={'viento': p.extra.get('viento', v), 'fase': i}) for i, p in enumerate(anim.poses)],
                    anim.fps, anim.loop)

    A['caminar'] = vt(A['caminar'], 1.5)
    A['correr'] = vt(A['correr'], 5)
    for k, v in (('subida', 1), ('caida', 4), ('esquivar', 3), ('aterrizar', 2)):
        A[k] = vt(A[k], v)
    A['salto'] = A['subida']
    # Ataque: puñetazo con anticipación (como en su hoja) · golpe: mazazo con los dos puños desde arriba.
    a0 = B.con(tronco=-6, hombro_c=-40, codo_c=110, hombro_l=50, codo_l=70, muslo_c=22, rodilla_c=14, muslo_l=-18,
               rodilla_l=10, cara='concentrado')
    a1 = B.con(tronco=16, hombro_c=90, codo_c=0, hombro_l=-36, codo_l=50, muslo_c=32, rodilla_c=26, muslo_l=-26,
               rodilla_l=8, pie_l=-14, cara='grito', extra={'viento': 2})
    a2 = B.con(tronco=10, hombro_c=66, codo_c=24, hombro_l=-14, codo_l=40, muslo_c=26, rodilla_c=18, muslo_l=-20,
               rodilla_l=8)
    A['ataque'] = Anim([a0, a0.con(hombro_c=-46, tronco=-8), a1, a2], 11, False)
    g0 = B.con(tronco=-10, cabeza=-6, hombro_c=170, codo_c=30, hombro_l=160, codo_l=30, brazo_l_delante=True,
               muslo_c=18, rodilla_c=10, muslo_l=-14, cara='grito')
    g1 = B.con(tronco=24, cabeza=8, hombro_c=70, codo_c=10, hombro_l=62, codo_l=14, brazo_l_delante=True,
               muslo_c=34, rodilla_c=40, muslo_l=-20, rodilla_l=20, hunde=2, cara='grito', extra={'viento': 2})
    A['golpe'] = Anim([g0, g1, g1.con(tronco=18, hunde=1, cara='concentrado')], 9, False)
    # Invocar = empieza la transformación: se encorva, manos en garra, ojos ámbar.
    tr = B.con(tronco=26, cabeza=-8, hombro_c=40, codo_c=60, hombro_l=30, codo_l=64, mano_c='garra', mano_l='garra',
               muslo_c=26, rodilla_c=34, muslo_l=-10, rodilla_l=30, hunde=1, cara='bestia')
    A['invocar'] = Anim([tr.con(extra={'chispas': 0, 'viento': 2}), tr.con(tronco=30, hunde=2, extra={'chispas': 1, 'viento': 3}),
                         tr.con(tronco=28, hombro_c=50, extra={'chispas': 2, 'viento': 4}),
                         tr.con(tronco=32, hunde=2, extra={'chispas': 3, 'viento': 3})], 7, True)
    A['conjuro'] = A['invocar']
    A['disparar'] = Anim([a0, a1, a2], 10, False)
    A['lanzar'] = Anim([B.con(tronco=-8, hombro_c=170, codo_c=60, hombro_l=50, codo_l=30, muslo_c=20, muslo_l=-14),
                        a1.con(hombro_c=100, codo_c=10, mano_c='abierta'), a2], 10, False)
    # Purificar: se endereza, las manos se abren, la luz ámbar se apaga en chispas.
    A['purificar'] = Anim([B.con(tronco=-2, cabeza=-6, hombro_c=20, codo_c=20, hombro_l=14, codo_l=20, mano_c='abierta',
                                 mano_l='abierta', extra={'chispas': i}) for i in range(3)], 5, True)
    return A


PERSONAJE = Nahual()
