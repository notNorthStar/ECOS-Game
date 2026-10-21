"""María (joven de Catemaco, aliada): vestido largo color crema de manga larga abullonada, faja azul con moño
atrás y cintas que cuelgan, cabello negro muy largo (hasta los muslos) con un broche de flor azul y blanca,
zapatos cafés. Canta (lamento) para ayudar en combate: `invocar` = manos al pecho, cabeza en alto, notas de luz.

Medidas: cuadro 96×88, pivote (48, 85), ~70 px de alto (igual que su kit de Codex: 70 px a escala 1)."""
from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas, mat_rot  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import animaciones_humanas  # noqa: E402
from personajes._humanoides import HumanoideX, chispas, falda, pelo_largo, variante  # noqa: E402

PAL = Paleta([
    Material('pelo',    ['#121018', '#211d29', '#353042', '#4e4860'],             '#0c0a12'),
    Material('piel',    ['#7a4636', '#b8785c', '#dea482', '#f6caa6'],             '#4a2a22'),
    Material('vestido', ['#8e7c6a', '#c4b098', '#e6d6bc', '#faf0de'],             '#4a3a32'),
    Material('faja',    ['#2e3a5a', '#4e6492', '#7a96c4', '#b0c8ec'],             '#1a2238'),
    Material('zapato',  ['#3a2016', '#5e3622', '#86522e'],                        '#1e120c'),
    Material('luz',     ['#5a72a0', '#9ac0f0', '#dcecff', '#ffffff'],             '#5a72a0'),
])

# ------------------------------------------------------------------------------------------------
# Cabeza 15×15 (mirando a la derecha): flequillo, ojos grandes, broche de flor atrás. Ancla 'cuello'.
# 0-3 pelo · s k l piel · e ojo · w blanco del ojo / pétalo · q pétalo azul · b ceja/pestaña · m boca
# ------------------------------------------------------------------------------------------------
LEY_CABEZA = {
    '0': ('pelo', 0), '1': ('pelo', 1), '2': ('pelo', 2), '3': ('pelo', 3),
    's': ('piel', 1), 'k': ('piel', 2), 'l': ('piel', 3), 'd': ('piel', 0, 'f'),
    'e': ('pelo', 0, 'f'), 'b': ('pelo', 1, 'f'), 'm': ('piel', 0, 'f'),
    'w': ('vestido', 3, 'f'), 'q': ('faja', 2, 'f'), 'Q': ('faja', 1, 'f'),
}
CABEZA_N = """
    ......11111....
    ....1122222211.
    ..ww12223333221
    .wqqw2233333321
    ..wQ12223332221
    ..1112222122221
    ..11221221lll2.
    ..1122121kbbbk.
    ..112211lkwekk.
    ..11221lkkeekkl
    ..1121skkkkkks.
    ..1121sskkkmk..
    ...121.sskkk...
    ...12...sss....
    ...1.....ss....
"""
CABEZAS = {
    'normal': CABEZA_N,
    'parpadeo': variante(CABEZA_N, {8: '..112211lkkkkk.', 9: '..11221lkbbbkkl'}),
    'concentrado': variante(CABEZA_N, {7: '..1122121kkbbb.', 8: '..112211lkbekk.'}),
    'canta': variante(CABEZA_N, {7: '..1122121kbbkk.', 8: '..112211lkbbkk.', 9: '..11221lkkkkkkl',
                                 11: '..1121sskkmmk..', 12: '...121.sskmk...'}),
    'grito': variante(CABEZA_N, {7: '..1122121kkbbb.', 11: '..1121sskkmmk..', 12: '...121.sskmk...'}),
    'dolor': variante(CABEZA_N, {7: '..1122121kbbkk.', 8: '..112211lkkbkk.', 9: '..11221lkbbkkkl',
                                 11: '..1121sskkmmk..'}),
    'triste': variante(CABEZA_N, {7: '..1122121kbbkk.', 8: '..112211lkbbek.'}),
}
CABEZAS['apunta'] = CABEZAS['concentrado']


def _cabeza(nombre: str) -> Mapa:
    return Mapa.de_texto(CABEZAS.get(nombre, CABEZA_N), LEY_CABEZA, PAL, {'cuello': (9, 14), 'nuca': (5, 6)})


# ------------------------------------------------------------------------------------------------
# Torso: corpiño crema con escote redondo, faja azul con moño atrás (columnas 0-3). Ancla 'o' = cadera.
# ------------------------------------------------------------------------------------------------
LEY_TORSO = {
    'a': ('vestido', 0), 'b': ('vestido', 1), 'c': ('vestido', 2), 'C': ('vestido', 3),
    's': ('piel', 1), 'k': ('piel', 2),
    'x': ('faja', 0), 'y': ('faja', 1), 'z': ('faja', 2), 'Z': ('faja', 3),
}
TORSO = """
    ......bkkb...
    ....bcCksCb..
    ...bCCCCCCcb.
    ..bCCCCCCCcb.
    ..bCCCCCCcCcb
    ..bCCCCCCccCb
    ..bcCCCCCcccb
    ..bcCCCCCccb.
    ..bbcCCCcccb.
    ..bbcCCCccb..
    ..bbcCCcccb..
    .Zy.bcCCccb..
    zZyyxZzzzyyx.
    yxzyxyyzzyyx.
    .yx.xxyyyyxx.
    ..x.bcccccb..
"""
ANCLAS_TORSO = {'o': (7, 19), 'cuello': (8, 0), 'hombro_c': (8, 3), 'hombro_l': (5, 3),
                'cint_b': (3, 15), 'cint_f': (11, 15), 'mono': (2, 13)}

LEY_ZAPATO = {'a': ('zapato', 0), 'b': ('zapato', 1), 'c': ('zapato', 2)}
ZAPATO = Mapa.de_texto("""
    .bc....
    bccbb..
    abbbbbc
""", LEY_ZAPATO, PAL, {'o': (1, 0)})


class Maria(HumanoideX):
    id = 'maria'
    fw, fh = 96, 88
    pivote = (48, 85)
    alto = 70
    L_muslo, L_pierna, L_pie, alto_tobillo = 16, 17, 7, 2
    L_brazo, L_ante = 11, 10
    sep_cadera = (1.0, -1.0)
    paleta = PAL
    largo_falda = 30.0

    def torso_mapa(self, pose):
        return Mapa.de_texto(TORSO, LEY_TORSO, PAL, ANCLAS_TORSO)

    def cabeza_mapa(self, pose):
        return _cabeza(pose.cara)

    def orden(self, pose):
        o = ['pelo', 'brazo_l', 'pierna_l', 'pierna_c', 'falda', 'cintas', 'torso', 'cabeza', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    # ---- miembros -------------------------------------------------------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        capa.estampa(ZAPATO, p['tobillo'], mat_rot(-p['ang_pie']), 'o')
        pi = P['piel']
        tob = mas(p['tobillo'], dir_ang(p['ang_pierna']), 1.0)
        capa.capsula(p['rodilla'], tob, 2.0, 1.6, pi, tonos=(1, 2, 3), redondo_b=False)
        capa.capsula(p['cadera'], p['rodilla'], 2.8, 2.1, pi, tonos=(1, 2, 3))

    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        erguida = mano.startswith('sena_')
        if not erguida:
            dibujar_mano(capa, P, b, mano)
        ve = P['vestido']
        # manga larga: abullonada en el hombro, fruncida en el puño
        capa.capsula(b['codo'], b['muneca'], 2.4, 2.0, ve, tonos=(1, 2, 3),
                     bandas=[(0.82, 1.2, ve, (0, 1, 2))], redondo_b=False)
        capa.capsula(b['hombro'], b['codo'], 3.2, 2.5, ve, tonos=(1, 2, 3), pliegues=[(0.55, 1)])
        if erguida:
            dibujar_mano(capa, P, b, mano)

    # ---- capas extra ----------------------------------------------------------------------------
    def viento(self, pose) -> float:
        return float(pose.extra.get('viento', 0))

    def parte_pelo(self, lz, c, pose):
        p = lz.parte()
        est = self.cabeza_previa(c, pose)
        raiz = est.punto('nuca')
        R = c['R']
        d = R @ [-2.5, 1.0]
        raiz = (raiz[0] + d[0], raiz[1] + d[1])
        v = self.viento(pose)
        largo = pose.extra.get('pelo_largo', 33)
        pelo_largo(p, raiz, largo, 15, self.paleta['pelo'], viento=v * 1.7, R=c['R'], mechones=6,
                   fase=pose.extra.get('fase', 0), tonos=(1, 2, 3), volumen=1.0, abajo=(-0.1, 1.0))
        return [(p, 'contorno', 0)]

    def parte_falda(self, lz, c, pose):
        p = lz.parte()
        tor = c['torso']
        P = self.paleta
        falda(self, p, c, pose, P['vestido'], tor.punto('cint_b', 0, 0), tor.punto('cint_f', 1, 0),
              self.largo_falda + pose.extra.get('falda_dl', 0), vuelo=3.0 + self.viento(pose) * 0.2,
              viento=self.viento(pose), tonos=(1, 2, 3), cadera_ancho=(6.0, 6.0), pliegues=(0.28, 0.55, 0.8),
              ondas=1 if self.viento(pose) > 3 else 0, semilla=int(pose.extra.get('fase', 0)),
              borde=(P['vestido'], 3), alto_borde=1)
        return [(p, 'contorno', 0, 1)]

    def parte_cintas(self, lz, c, pose):
        """Las dos cintas del moño, colgando por la espalda de la falda."""
        P = self.paleta
        p = lz.parte()
        m = c['torso'].punto('mono')
        v = self.viento(pose)
        R = c['R']
        for k, (lg, dx) in enumerate(((13, 0.0), (10, 2.0))):
            prev = m
            for i in range(1, 6):
                t = i / 5
                d = R @ [(-1.5 - v * 0.9 * t ** 1.2 + math.sin(t * 3 + k + pose.extra.get('fase', 0)) * 0.7) * 1 + dx * t,
                         lg * t - v * 0.3 * t * t]
                q = (m[0] + d[0], m[1] + d[1])
                p.capsula(prev, q, 0.7, 0.6, P['faja'], tonos=(1, 2, 3))
                prev = q
        return [(p, 'contorno', 0)]

    def retoques(self, lz, c, pose):
        P = self.paleta
        ch = pose.extra.get('chispas')
        if ch is not None:
            w = [c['brazo_c']['muneca'], c['brazo_l']['muneca']]
            if pose.extra.get('notas'):
                cab = c['cuello']
                w = [(cab[0] + 8, cab[1] - 8)]
            chispas(lz, w, P['luz'], int(ch), 3, 1,
                    pts=((-3, -4), (5, -7), (2, -11), (-6, -2), (8, -2), (3, 3), (-2, -14), (9, -12)))


BASE = Pose(tronco=0, hombro_c=4, codo_c=18, hombro_l=-4, codo_l=16,
            muslo_c=4, rodilla_c=3, pie_c=0, muslo_l=-4, rodilla_l=2, pie_l=0)


def animaciones():
    A = animaciones_humanas(BASE, paso=0.85, lean_correr=10)
    B = BASE

    def con_viento(anim: Anim, v: float, fases=True) -> Anim:
        return Anim([p.con(extra={'viento': p.extra.get('viento', v), 'fase': i if fases else 0})
                     for i, p in enumerate(anim.poses)], anim.fps, anim.loop)

    # Reposo: respira, el pelo apenas se mece.
    A['reposo'] = Anim([B.con(extra={'viento': 0}), B.con(hunde=0.6, extra={'viento': 0.5, 'fase': 1}),
                        B.con(hunde=1, hombro_c=6, codo_c=22, extra={'viento': 1, 'fase': 2}),
                        B.con(hunde=0.4, cara='parpadeo', extra={'viento': 0.5, 'fase': 3})], 3.5, True)
    A['caminar'] = con_viento(A['caminar'], 2.0)
    A['correr'] = con_viento(A['correr'], 6.5)
    for k in ('subida', 'caida', 'aterrizar', 'esquivar'):
        A[k] = con_viento(A[k], {'subida': 1, 'caida': 4, 'aterrizar': 2, 'esquivar': 3}[k])
    A['salto'] = A['subida']

    # Invocar = su canto (lamento): manos juntas al pecho, cabeza en alto, notas de luz.
    can = B.con(tronco=-4, cabeza=-8, hombro_c=40, codo_c=110, hombro_l=34, codo_l=112, mano_c='abierta',
                mano_l='abierta', cara='canta', muslo_c=6, muslo_l=-4, brazo_l_delante=False)
    A['invocar'] = Anim([can.con(extra={'chispas': 0, 'notas': 1, 'viento': 1}),
                         can.con(hunde=0.6, cabeza=-10, extra={'chispas': 1, 'notas': 1, 'viento': 2, 'fase': 1}),
                         can.con(hunde=1, extra={'chispas': 2, 'notas': 1, 'viento': 2.5, 'fase': 2}),
                         can.con(hunde=0.5, cabeza=-6, extra={'chispas': 3, 'notas': 1, 'viento': 1.5, 'fase': 3})],
                        5, True)
    # Conjuro: palmas al frente (como en su hoja de Codex).
    cj = B.con(tronco=4, hombro_c=82, codo_c=8, hombro_l=70, codo_l=14, mano_c='abierta', mano_l='abierta',
               muslo_c=14, rodilla_c=8, muslo_l=-10, cara='concentrado')
    A['conjuro'] = Anim([cj.con(extra={'chispas': 0, 'viento': 1}), cj.con(hombro_c=86, extra={'chispas': 1, 'viento': 2}),
                         cj.con(hombro_c=80, hunde=1, extra={'chispas': 2, 'viento': 2}),
                         cj.con(hombro_c=84, extra={'chispas': 3, 'viento': 1})], 6, True)
    A['purificar'] = Anim([p.con(extra={**p.extra, 'viento': 1.5}) for p in A['purificar'].poses],
                          A['purificar'].fps, True)
    # Disparar / ataque: empuja con la palma (no pelea con armas).
    dsp = B.con(tronco=8, hombro_c=84, codo_c=4, hombro_l=-14, codo_l=30, mano_c='abierta', muslo_c=18,
                rodilla_c=10, muslo_l=-14, rodilla_l=6, cara='concentrado')
    A['disparar'] = Anim([dsp.con(extra={'chispas': 0, 'viento': 1}), dsp.con(hombro_c=88, tronco=5, extra={'chispas': 2}),
                          dsp.con(hombro_c=80, tronco=2)], 10, False)
    A['ataque'] = Anim([B.con(tronco=-6, hombro_c=-24, codo_c=90, hombro_l=30, codo_l=50, cara='concentrado',
                              muslo_c=12, muslo_l=-10, extra={'viento': 1}),
                        dsp.con(tronco=12, hombro_c=90, codo_c=0, cara='grito', extra={'viento': 3, 'chispas': 1}),
                        dsp.con(tronco=6, hombro_c=70, codo_c=20, extra={'viento': 2})], 10, False)
    A['golpe'] = A['ataque']
    A['interactuar'] = con_viento(A['interactuar'], 0.5)
    A['dano'] = Anim([p.con(extra={'viento': -2}) for p in A['dano'].poses], A['dano'].fps, False)
    A['aturdido'] = Anim([p.con(cara='triste' if p.cara == 'parpadeo' and i % 2 else p.cara) for i, p in
                          enumerate(A['aturdido'].poses)], A['aturdido'].fps, True)
    A['agotado'] = A['aturdido']
    # Morir: se desmaya (cae de rodillas y queda tendida); la falda se queda un poco corta para no tapar todo.
    A['morir'] = Anim([p.con(extra={'viento': 1, 'fase': i}) for i, p in enumerate(A['morir'].poses)], 7, False)
    return A


PERSONAJE = Maria()
