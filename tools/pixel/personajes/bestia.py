"""Bestias corruptas del olvido (Nivel 4, callejones de Oaxaca; ~76 px). Dos variantes, con los mismos nombres del kit
anterior ('1' y '3', de las hojas Codex bestia-1.png y bestia-3.png):

  '1'  gris azulado de noche, flaca y alargada, cráneo largo de caballo-reptil con un cuerno-oreja hacia atrás,
       púas oscuras por la espalda y cola larga de látigo que arrastra.
  '3'  verde olivo, lagarto erguido: hocico romo, cresta de púas que nace en la cabeza y baja por la espalda.

Ambas: encorvadas, brazos largos con garras, pies digitígrados, un ojo que brilla en ámbar. Al purificarse el ojo
pasa a turquesa sereno; al morir se arrodillan y se deshacen en humo (sin violencia).

Rig: `_criaturas.BestiaBipeda` (sobre Humanoide). Las dos variantes van en la misma hoja: `instalar_variantes`
hace que `generar.py` escriba `variants: ['1', '3']` y `cuadrosPorVariante` (ver _criaturas.py)."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Material, Paleta, Pose, mas  # noqa: E402
from personajes._criaturas import BestiaBipeda, animaciones_bestia, instalar_variantes  # noqa: E402

PAL = Paleta([
    Material('piel1', ['#152536', '#24394a', '#33505a', '#8aa4a8'],  '#0a0f1a'),
    Material('crin1', ['#0f1826', '#152536', '#24394a'],             '#0a0f1a'),
    Material('piel3', ['#22482c', '#36663a', '#5a8a46', '#9ab85a'],  '#0a1a14'),
    Material('crin3', ['#14301f', '#22482c', '#36663a'],             '#0a1a14'),
    Material('ojo',   ['#d0742c', '#f2a640', '#ffd77a', '#fff4cc'],  '#7a3a1a'),
    Material('una',   ['#625f62', '#b3ab9c', '#dcdff0'],             '#1e1c24'),
    Material('turq',  ['#128a8a', '#2ad0c0', '#9af8e8'],             '#0a3a40'),
])

MEDIDAS = dict(L_muslo=17, L_pierna=17, L_pie=9, alto_tobillo=3, L_brazo=15, L_ante=14)
ANCLAS = {'barriga': (1, -8), 'pecho': (2, -16), 'cuello': (3, -24), 'hombro_c': (2, -21), 'hombro_l': (-1, -21)}
RADIOS = dict(muslo=3.6, pierna=2.3, tobillo=1.7, pie=1.4, brazo=2.4, ante=2.0, muneca=1.5, pelvis=4.2,
              cintura=3.4, pecho=5.2, cuello=2.6, dedos=4.4)


class Bestia(BestiaBipeda):
    id = 'bestia'
    fw, fh = 112, 104
    pivote = (56, 101)
    alto = 76
    paleta = PAL
    L_muslo, L_pierna, L_pie, alto_tobillo = 16, 16, 8, 3
    L_brazo, L_ante = 14, 13
    sep_cadera = (1.5, -1.5)
    VARIANTES = {
        '1': dict(medidas=MEDIDAS, anclas=ANCLAS, radios=RADIOS, piel='piel1', crin='crin1', ojo='ojo', una='una',
                  espinas='pua', n_espinas=9, largo_espina=4.5, espinas_desde=0.2, cola=(12, 3.0, 1.8),
                  cola_ang=-35, cola_curva=-12, K=1.15, cabeza_off=(3.5, -4.0), nuca=(-4, -2)),
        '3': dict(medidas=MEDIDAS, anclas=ANCLAS, radios=dict(RADIOS, pecho=5.4, cintura=3.6), piel='piel3',
                  crin='crin3', ojo='ojo', una='una', espinas='pua', n_espinas=11, largo_espina=5.0,
                  espinas_desde=0.1, cola=None, K=1.15, cabeza_off=(3.5, -4.5), nuca=(-3, -4)),
    }
    humo = {'1': [PAL.mat(PAL['piel1']).color(1), PAL.mat(PAL['piel1']).color(2), PAL.mat(PAL['crin1']).color(2)],
            '3': [PAL.mat(PAL['piel3']).color(1), PAL.mat(PAL['piel3']).color(2), PAL.mat(PAL['crin3']).color(2)]}

    # ---- cabeza '1': cráneo largo de caballo-reptil, cuerno-oreja hacia atrás ---------------------
    def cabeza_1(self, lz, c, pose, L, K):
        pi, cr, hu = self.m('piel'), self.m('crin'), self.m('una')
        boca = pose.extra.get('boca', 0)
        f = lz.parte()
        f.poligono([L(-3, -2), L(-8, -9), L(-1, -4)], cr, sombreado=(0, 0, 1))        # oreja lejana
        h = lz.parte()
        h.elipse(L(0, 0), 5.0, 4.4, pi, tonos=(1, 2, 3))
        h.capsula(L(2, -0.5), L(10.5, 1.8), 3.3, 2.3, pi, tonos=(1, 2, 3))           # hocico largo
        h.capsula(L(1, 3.0 + boca * 0.4), L(8.5, 4.0 + boca * 1.0), 1.9, 1.2, pi, tonos=(0, 1, 2))   # quijada
        o = lz.parte()
        o.poligono([L(-2.5, -2.5), L(-8.5, -11), L(-5.5, -3.5), L(-1.5, -0.5)], pi, sombreado=(1, 2, 3), ks=1)
        g = lz.parte()
        self.ojo(g, *g.a_px(L(3.2, -1.5)), pose)
        g.linea(L(1.4, -3.2), L(5.0, -2.8), pi, 0, fijo=True)          # arco de la ceja
        g.pon_m(L(10.6, 0.6), pi, 0, fijo=True)                         # fosa nasal
        if boca > 0.5:
            for i in range(int(round(boca))):
                g.linea(L(3.5, 2.8 + i * 0.9), L(10.0, 2.8 + i * 1.0), cr, 0, fijo=True)
            for i in range(4, 10, 2):
                g.pon_m(L(i, 2.6), hu, 2, fijo=True)
        else:
            g.linea(L(3.5, 2.6), L(10.4, 2.6), cr, 0, fijo=True)
            g.pon_m(L(9.0, 3.0), hu, 1, fijo=True)
        return [(f, 'contorno', 1), (h, 'contorno', 0, 1), (o, 'contorno', 0), (g, None, 0)]

    # ---- cabeza '3': lagarto de hocico romo, cresta de púas -------------------------------------
    def cabeza_3(self, lz, c, pose, L, K):
        pi, cr, hu = self.m('piel'), self.m('crin'), self.m('una')
        boca = pose.extra.get('boca', 0)
        fl = pose.extra.get('crin', 0)
        h = lz.parte()
        # cresta: púas en la coronilla y la nuca
        for k, (bx, by, dx, dy) in enumerate(((-1, -4, -2, -5), (-3.5, -3, -3, -4.5), (-5.5, -1, -3.5, -3),
                                               (1.5, -4.2, -1, -4.5))):
            L0 = 1 + 0.2 * fl
            h.poligono([L(bx - 1.2, by + 0.6), L(bx + 1.2, by + 0.6), L(bx + dx * L0, by + dy * L0)], cr,
                       sombreado=(0, 1, 2), ks=1)
        h.elipse(L(0, 0), 5.2, 4.6, pi, tonos=(1, 2, 3))
        h.capsula(L(2, 0), L(8.6, 1.4), 3.6, 2.8, pi, tonos=(1, 2, 3))              # hocico romo
        h.capsula(L(1, 3.0 + boca * 0.4), L(7.5, 3.6 + boca * 1.0), 2.2, 1.6, pi, tonos=(0, 1, 2))
        h.elipse(L(-2.5, 2.5), 3.0, 2.6, pi, tonos=(1, 2, 3))                        # papada / gola
        g = lz.parte()
        self.ojo(g, *g.a_px(L(2.8, -1.4)), pose, grande=True)
        g.linea(L(0.6, -3.4), L(5.0, -2.6), cr, 0, fijo=True)
        g.pon_m(L(9.4, 0.2), pi, 0, fijo=True)
        # escamas: puntos claros en la cabeza
        for (dx, dy) in ((-2, -1), (0, 2), (-4, 0.5), (5, -1.5)):
            g.pon_m(L(dx, dy), pi, 3, fijo=True)
        if boca > 0.5:
            for i in range(int(round(boca))):
                g.linea(L(3.0, 2.6 + i * 0.9), L(9.0, 2.4 + i * 1.0), cr, 0, fijo=True)
            g.pon_m(L(8.0, 2.4), hu, 2, fijo=True)
            g.pon_m(L(6.0, 2.4), hu, 2, fijo=True)
        else:
            g.linea(L(3.0, 2.5), L(9.2, 2.2), cr, 0, fijo=True)
        return [(h, 'contorno', 0, 1), (g, None, 0)]

    def detalle_torso(self, p, c, pose, u, n):
        # escamas / manchas claras en el pecho (más marcadas en el lagarto)
        tor = c['torso']
        pec = tor.punto('pecho')
        pi = self.m('piel')
        for k, (a, b) in enumerate(((1.5, 3.0), (-1.5, 2.0), (3.0, 1.0), (0.0, -1.0))):
            if self.variante == '3' or k < 2:
                p.pon_m(mas(mas(pec, n, b), u, a), pi, 3 if self.variante == '3' else 2, fijo=True)


B = Pose(tronco=20, cabeza=-14, hombro_c=6, codo_c=24, hombro_l=-10, codo_l=20, muslo_c=14, rodilla_c=26, pie_c=-6,
         muslo_l=-12, rodilla_l=20, pie_l=-6, mano_c='abierta', mano_l='abierta')


def animaciones():
    return animaciones_bestia(B)


PERSONAJE = Bestia()
instalar_variantes(PERSONAJE, ['1', '3'])
