"""La Llorona (María transformada; aliada etérea): vestido blanco largo y deshilachado en capas que flota,
mangas anchas rasgadas, piel pálida, descalza, cabello negro larguísimo y revuelto, ojos turquesa que brillan y
jirones de luz turquesa que le cuelgan de las manos. Triste, no aterradora: nada de gore.

Flota (el juego la eleva con `hover`): los pies cuelgan en punta y el vestido ondea. `invocar` = su lamento:
brazos al frente, cabeza atrás, el pelo y el vestido se agitan y los jirones de luz se encienden.

Medidas: cuadro 96×88, pivote (48, 85), ~75 px de alto (su kit de Codex: 75 px a escala 1)."""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import animaciones_humanas  # noqa: E402
from personajes._humanoides import (chispas, desvanecer, estela, falda, pelo_largo, rasgar,  # noqa: E402
                                    variante)
from personajes.maria import Maria  # noqa: E402

PAL = Paleta([
    Material('pelo',     ['#0c0a10', '#1e1a26', '#34303f', '#524c64'],             '#08070c'),
    Material('piel',     ['#5e5a6c', '#9290a2', '#c2c0cc', '#e6e4ec'],             '#2e2a3a'),
    Material('vestido',  ['#5a5662', '#96929e', '#cdc9cf', '#f2eef0'],             '#2a2632'),
    Material('espectro', ['#0e3a44', '#1e6e76', '#3aaeae', '#9cf2e8'],             '#0e3a44'),
])

LEY_CABEZA = {
    '0': ('pelo', 0), '1': ('pelo', 1), '2': ('pelo', 2), '3': ('pelo', 3),
    's': ('piel', 1), 'k': ('piel', 2), 'l': ('piel', 3), 'd': ('piel', 0, 'f'),
    'b': ('pelo', 1, 'f'), 'm': ('piel', 0, 'f'),
    'E': ('espectro', 3, 'f'), 'D': ('espectro', 1, 'f'),
}
# Mechones que le caen sobre la frente y el ojo; ojo turquesa que brilla.
CABEZA_N = """
    ......11111....
    ....1122222211.
    ...112223333221
    ..1122233333321
    ..1122223332221
    ..1112222122221
    ..11221221221l.
    ..11221221bbk1.
    ..1122112kDEk1.
    ..1122121lkkkkl
    ..11221skkkkks.
    ..1121sskkkmk..
    ..1121.sskkk...
    ..121...sss....
    ..1......ss....
"""
CABEZAS = {
    'normal': CABEZA_N,
    'parpadeo': variante(CABEZA_N, {8: '..1122112kbbk1.'}),
    'concentrado': variante(CABEZA_N, {7: '..11221221kbb1.', 8: '..1122112kDEk1.'}),
    'grito': variante(CABEZA_N, {7: '..11221221kbb1.', 11: '..1121sskkmmk..', 12: '..1121.sskmk...'}),
    'dolor': variante(CABEZA_N, {8: '..1122112kbbk1.', 11: '..1121sskkmmk..'}),
}
CABEZAS['apunta'] = CABEZAS['concentrado']
CABEZAS['canta'] = CABEZAS['grito']
CABEZAS['triste'] = CABEZAS['normal']


def _cabeza(nombre: str) -> Mapa:
    return Mapa.de_texto(CABEZAS.get(nombre, CABEZA_N), LEY_CABEZA, PAL, {'cuello': (9, 14), 'nuca': (5, 6)})


LEY_TORSO = {
    'a': ('vestido', 0), 'b': ('vestido', 1), 'c': ('vestido', 2), 'C': ('vestido', 3),
    's': ('piel', 1), 'k': ('piel', 2),
}
TORSO = """
    ......bkkb...
    ....bcCksCb..
    ...bCCCCCCcb.
    ..bCCCCCCCcb.
    ..bCCCCCCcCcb
    ..bCCCCCCccCb
    ..bcCCbCCcccb
    ..bcCCbCCccb.
    ..bbcCbCcccb.
    ..bbcCCbccb..
    ..bbcCCbccb..
    ..bbcCCcbcb..
    ..bbcCCcbcb..
    ..bbcCCcbcb..
    ..bbcCCccbb..
    ..bbcCCcccb..
"""
ANCLAS_TORSO = {'o': (7, 19), 'cuello': (8, 0), 'hombro_c': (8, 3), 'hombro_l': (5, 3),
                'cint_b': (3, 14), 'cint_f': (11, 14), 'mono': (2, 13)}


class Llorona(Maria):
    id = 'llorona'
    fw, fh = 96, 88
    pivote = (48, 85)
    alto = 75
    L_muslo, L_pierna, L_pie, alto_tobillo = 17, 18, 7, 2
    L_brazo, L_ante = 12, 11
    paleta = PAL
    largo_falda = 31.0

    def torso_mapa(self, pose):
        return Mapa.de_texto(TORSO, LEY_TORSO, PAL, ANCLAS_TORSO)

    def cabeza_mapa(self, pose):
        return _cabeza(pose.cara)

    def orden(self, pose):
        o = ['pelo', 'brazo_l', 'pierna_l', 'pierna_c', 'enagua', 'falda', 'torso', 'cabeza', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    # ---- miembros: descalza (pies en punta al flotar); mangas acampanadas rasgadas ------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        pi = P['piel']
        r = math.radians(p['ang_pie'])
        fwd = (math.cos(r), -math.sin(r))
        planta = mas(p['tobillo'], (math.sin(r), math.cos(r)), 1.2)
        capa.capsula(mas(planta, fwd, -1.2), mas(planta, fwd, self.L_pie - 2.5), 1.5, 1.0, pi, tonos=(1, 2, 3))
        capa.capsula(p['rodilla'], p['tobillo'], 1.9, 1.4, pi, tonos=(1, 2, 3))
        capa.capsula(p['cadera'], p['rodilla'], 2.6, 2.0, pi, tonos=(1, 2, 3))

    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        dibujar_mano(capa, P, b, 'abierta' if mano.startswith('sena_') else mano)
        ve = P['vestido']
        capa.capsula(b['hombro'], b['codo'], 2.7, 2.3, ve, tonos=(1, 2, 3))
        # manga acampanada: se abre hacia la muñeca y cuelga (la punta va hacia abajo en el mundo)
        m0 = capa.mascara().copy()
        capa.capsula(b['codo'], mas(b['muneca'], dir_ang(b['ang_ante']), -1.0), 2.3, 3.3, ve, tonos=(1, 2, 3),
                     redondo_b=False)
        w = b['muneca']
        capa.poligono([mas(w, (-4.0, -1.5)), mas(w, (1.2, -1)), mas(w, (0.5, 7.0)), mas(w, (-3.5, 8.5))], ve,
                      sombreado=(0, 1, 2), ks=1)
        nueva = capa.mascara() & ~m0 & (capa.mat == ve)
        rasgar(capa, nueva, 3 if lado == 'c' else 5, 2, paso=1)

    # ---- capas -------------------------------------------------------------------------------------
    def parte_pelo(self, lz, c, pose):
        p = lz.parte()
        est = self.cabeza_previa(c, pose)
        R = c['R']
        raiz = est.punto('nuca')
        d = R @ [-2.5, 1.0]
        raiz = (raiz[0] + d[0], raiz[1] + d[1])
        v = self.viento(pose)
        pelo_largo(p, raiz, pose.extra.get('pelo_largo', 38), 15, self.paleta['pelo'], viento=v * 1.8, R=R,
                   mechones=7, fase=pose.extra.get('fase', 0), tonos=(1, 2, 3), volumen=1.05, abajo=(-0.12, 1.0))
        return [(p, 'contorno', 0)]

    def parte_enagua(self, lz, c, pose):
        """Capa de abajo del vestido: más larga, gris y en jirones (se ve bajo la de encima)."""
        p = lz.parte()
        tor = c['torso']
        v = self.viento(pose)
        falda(self, p, c, pose, self.paleta['vestido'], tor.punto('cint_b'), tor.punto('cint_f', 1, 0),
              self.largo_falda + 1, vuelo=4.5 + v * 0.3, viento=v * 1.3, tonos=(0, 1, 1), cadera_ancho=(6.5, 6.5),
              pliegues=(0.2, 0.5, 0.8), tono_pliegue=0, rasgado=4, semilla=int(pose.extra.get('fase', 0)) + 2,
              ondas=2)
        return [(p, 'contorno', 0)]

    def parte_falda(self, lz, c, pose):
        p = lz.parte()
        tor = c['torso']
        v = self.viento(pose)
        falda(self, p, c, pose, self.paleta['vestido'], tor.punto('cint_b'), tor.punto('cint_f', 1, 0),
              self.largo_falda - 3, vuelo=3.0 + v * 0.2, viento=v, tonos=(1, 2, 3), cadera_ancho=(6.0, 6.0),
              pliegues=(0.25, 0.5, 0.75), rasgado=3, semilla=int(pose.extra.get('fase', 0)), ondas=1)
        return [(p, 'contorno', 0, 1)]

    def retoques(self, lz, c, pose):
        P = self.paleta
        es = P['espectro']
        # jirones de luz que cuelgan de las manos (se mecen; más largos al lamentarse)
        lam = pose.extra.get('lamento', 0)
        fase = pose.extra.get('fase', 0)
        for k, brazo in enumerate(('brazo_c', 'brazo_l')):
            w = c[brazo]['muneca']
            for j in range(3 if lam else 2):
                pts = []
                largo = 9 + j * 3 + lam * 5
                for i in range(7):
                    t = i / 6
                    pts.append((w[0] + 1 - j * 1.5 - self.viento(pose) * 0.8 * t + math.sin(t * 5 + fase + j + k) * 1.5,
                                w[1] + 2 + largo * t))
                estela(lz, pts, es, tonos=(1, 2, 3) if lam else (0, 1, 2))
        ch = pose.extra.get('chispas')
        if ch is not None:
            cen = [c['brazo_c']['muneca'], c['brazo_l']['muneca']]
            chispas(lz, cen, es, int(ch), 3, 1)



BASE = Pose(tronco=2, cabeza=4, hombro_c=6, codo_c=20, hombro_l=-2, codo_l=18,
            muslo_c=8, rodilla_c=14, pie_c=-40, muslo_l=-2, rodilla_l=18, pie_l=-48, mano_c='abierta', mano_l='abierta',
            extra={'viento': 1.5})


def animaciones():
    A = animaciones_humanas(BASE, paso=0.6, lean_correr=8)
    B = BASE

    def ext(p, **kw):
        e = dict(p.extra)
        e.update(kw)
        return p.con(extra=e)

    # Reposo: flota; el vestido y el pelo ondean, la cabeza baja triste.
    A['reposo'] = Anim([ext(B.con(), fase=0, viento=1.5), ext(B.con(hunde=0.6, hombro_c=8), fase=1, viento=2.5),
                        ext(B.con(hunde=1, hombro_c=9, codo_c=24), fase=2, viento=3),
                        ext(B.con(hunde=0.4, cara='parpadeo'), fase=3, viento=2)], 3.5, True)
    # Caminar / correr: se desliza; las piernas apenas se mueven, todo ondea hacia atrás.
    cam = []
    for i in range(8):
        s = math.sin(i / 8 * 2 * math.pi)
        cam.append(B.con(tronco=6, muslo_c=10 + 6 * s, rodilla_c=18 - 4 * s, muslo_l=-2 - 6 * s, rodilla_l=20 + 4 * s,
                         hombro_c=10 + 8 * s, codo_c=22, hombro_l=-6 - 8 * s, codo_l=20, hunde=0.5 if i % 4 in (1, 2) else 0,
                         extra={'viento': 4 + s, 'fase': i}))
    A['caminar'] = Anim(cam, 9, True)
    cor = [p.con(tronco=14, hombro_c=-30 + 6 * (i % 2), codo_c=30, hombro_l=-40, codo_l=24, cabeza=-2,
                 extra={'viento': 8 + (i % 3), 'fase': i}) for i, p in enumerate(cam)]
    A['correr'] = Anim(cor, 12, True)
    for k, v in (('subida', 3), ('caida', 6), ('aterrizar', 3)):
        A[k] = Anim([ext(p.con(pie_c=-40, pie_l=-48), viento=v, fase=i) for i, p in enumerate(A[k].poses)],
                    A[k].fps, A[k].loop)
    A['salto'] = A['subida']
    # Esquivar: se desvanece de lado (un barrido etéreo en vez de rodar).
    A['esquivar'] = Anim([ext(B.con(tronco=24, hombro_c=-40, hombro_l=-50, codo_c=20, codo_l=20), viento=10, fase=0),
                          ext(B.con(tronco=30, hombro_c=-50, hombro_l=-60, codo_c=10, codo_l=10), viento=12, fase=1,
                              desvanece=0.5),
                          ext(B.con(tronco=20, hombro_c=-30, hombro_l=-40), viento=8, fase=2, desvanece=0.25),
                          ext(B.con(tronco=10), viento=5, fase=3)], 13, False)
    # Invocar = el lamento: brazos al frente y arriba, cabeza atrás, todo se agita, los jirones de luz se encienden.
    lm = B.con(tronco=-6, cabeza=-12, hombro_c=104, codo_c=14, hombro_l=92, codo_l=20, cara='grito')
    A['invocar'] = Anim([ext(lm, viento=7, fase=0, lamento=1, chispas=0),
                         ext(lm.con(hombro_c=110, hombro_l=98, hunde=1), viento=9, fase=1, lamento=1, chispas=1),
                         ext(lm.con(hombro_c=106, cabeza=-14), viento=8, fase=2, lamento=1, chispas=2),
                         ext(lm.con(hombro_c=100, hunde=0.5), viento=10, fase=3, lamento=1, chispas=3)], 7, True)
    cj = B.con(tronco=4, hombro_c=86, codo_c=8, hombro_l=60, codo_l=20, cara='concentrado')
    A['conjuro'] = Anim([ext(cj, viento=3, fase=i, chispas=i, lamento=1) for i in range(4)], 6, True)
    A['disparar'] = Anim([ext(cj.con(hombro_c=90), viento=4, lamento=1, chispas=0),
                          ext(cj.con(hombro_c=84, tronco=1), viento=3, chispas=2)], 10, False)
    A['ataque'] = Anim([ext(B.con(tronco=-8, hombro_c=150, codo_c=20, hombro_l=-20, cara='grito'), viento=4, fase=0),
                        ext(B.con(tronco=14, hombro_c=86, codo_c=4, hombro_l=-30, cara='grito'), viento=8, fase=1,
                            lamento=1),
                        ext(B.con(tronco=8, hombro_c=60, codo_c=20), viento=5, fase=2)], 10, False)
    A['golpe'] = A['ataque']
    A['lanzar'] = A['ataque']
    pu = B.con(tronco=-2, cabeza=-6, hombro_c=60, codo_c=10, hombro_l=50, codo_l=12)
    A['purificar'] = Anim([ext(pu, viento=2, fase=i, chispas=i) for i in range(3)], 6, True)
    A['interactuar'] = Anim([ext(B.con(tronco=10, hombro_c=50, codo_c=30), fase=0),
                             ext(B.con(tronco=14, hombro_c=74, codo_c=10, hunde=1), fase=1)], 5, False)
    A['dano'] = Anim([ext(B.con(tronco=-14, cabeza=-10, hombro_c=-30, codo_c=40, hombro_l=-40, codo_l=40, cara='dolor'),
                          viento=-3, fase=0),
                      ext(B.con(tronco=-6, cabeza=-4, hombro_c=-14, codo_c=30, cara='dolor'), viento=0, fase=1)], 8, False)
    at = B.con(tronco=24, cabeza=18, hombro_c=10, codo_c=10, hombro_l=6, codo_l=10, muslo_c=14, rodilla_c=30,
               cara='parpadeo')
    A['aturdido'] = Anim([ext(at, fase=0), ext(at.con(tronco=26, hunde=1), fase=1), ext(at.con(cara='dolor'), fase=2),
                          ext(at.con(hunde=1), fase=3)], 4, True)
    A['agotado'] = A['aturdido']
    # Morir: se encoge y se deshace en luz (sin caer al suelo).
    A['morir'] = Anim([ext(B.con(tronco=-10, cabeza=-10, hombro_c=-20, codo_c=40, cara='dolor'), viento=2, fase=0),
                       ext(at, viento=3, fase=1, chispas=0),
                       ext(at.con(tronco=30), viento=4, fase=2, chispas=1, desvanece=0.3),
                       ext(at.con(tronco=32), viento=5, fase=3, chispas=2, desvanece=0.55),
                       ext(at.con(tronco=34), viento=6, fase=4, chispas=3, desvanece=0.8)], 6, False)
    return A


PERSONAJE = Llorona()
