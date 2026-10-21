"""Forma animal de los nahuales (Nivel 6, CDMX; ~84 px). Dos variantes con los mismos nombres del kit anterior
(tools/codex-sheets.py: 'lobo' ← nahual.png, 'ave' ← bestia-2.png):

  'lobo'  hombre-lobo encorvado y fornido: pelaje café tierra, melena greñuda gris oscuro del cuello a la espalda,
          orejas en punta, hocico con colmillos, ojos naranjas encendidos, garras.
  'ave'   cuerpo flaco café rojizo con máscara de cráneo de ave (pico largo y ganchudo, cuencas oscuras con una
          brasa por ojo) y una melena de plumas negras que baja por la espalda.

Al purificarse el brillo de los ojos pasa a turquesa sereno; al morir caen de rodillas y se deshacen en humo.

Rig: `_criaturas.BestiaBipeda` (sobre Humanoide). Ambas variantes van en la misma hoja: `VARIANTES_KIT` hace
que `generar.py` escriba `variants: ['lobo', 'ave']` y `cuadrosPorVariante`."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Material, Paleta, Pose, mas  # noqa: E402
from personajes._criaturas import BestiaBipeda, animaciones_bestia, kit_variantes  # noqa: E402

PAL = Paleta([
    Material('piel_lobo', ['#1e120e', '#3a2418', '#5c3a24', '#8a5a34'],  '#140a08'),
    Material('crin_lobo', ['#1e1c24', '#2e2c34', '#45434a'],             '#120e1a'),
    Material('piel_ave',  ['#3a1a18', '#6a2e24', '#9a4630', '#c46a40'],  '#140a08'),
    Material('crin_ave',  ['#120e1a', '#1e1c24', '#2e2c34'],             '#120e1a'),
    Material('hueso',     ['#8a857e', '#b3ab9c', '#dcdff0', '#fff4cc'],  '#3a2418'),
    Material('ojo',       ['#d0742c', '#f2a640', '#ffd77a'],             '#7a3a1a'),
    Material('turq',      ['#128a8a', '#2ad0c0', '#9af8e8'],             '#0a3a40'),
])

LOBO = dict(
    medidas=dict(L_muslo=18, L_pierna=18, L_pie=10, alto_tobillo=3, L_brazo=16, L_ante=15),
    anclas={'barriga': (1, -9), 'pecho': (3, -19), 'cuello': (5, -28), 'hombro_c': (3, -24), 'hombro_l': (-1, -24)},
    radios=dict(muslo=5.0, pierna=3.0, tobillo=2.1, pie=1.8, brazo=3.6, ante=3.0, muneca=2.2, pelvis=5.4,
                cintura=5.0, pecho=7.6, pecho_dx=1.5, cuello=4.4, dedos=4.0),
    piel='piel_lobo', crin='crin_lobo', ojo='ojo', una='hueso', espinas='melena', n_espinas=10, largo_espina=5.5,
    espinas_desde=0.25, cola=None, K=1.25, cabeza_off=(4.0, -3.5), nuca=(-5, -1), costillas=0)
AVE = dict(
    medidas=dict(L_muslo=19.5, L_pierna=18.5, L_pie=10, alto_tobillo=3, L_brazo=16, L_ante=15),
    anclas={'barriga': (1, -9), 'pecho': (2, -17), 'cuello': (3, -26), 'hombro_c': (2, -23), 'hombro_l': (-1, -23)},
    radios=dict(muslo=3.6, pierna=2.3, tobillo=1.6, pie=1.4, brazo=2.3, ante=1.9, muneca=1.5, pelvis=4.2,
                cintura=3.4, pecho=5.0, cuello=2.6, dedos=4.8),
    piel='piel_ave', crin='crin_ave', ojo='ojo', una='hueso', espinas='plumas', n_espinas=11, largo_espina=6.0,
    espinas_desde=0.3, cola=None, K=1.15, cabeza_off=(3.5, -4.5), nuca=(-4, -3), costillas=3)


class NahualAnimal(BestiaBipeda):
    id = 'nahual_animal'
    fw, fh = 120, 112
    pivote = (60, 109)
    alto = 84
    paleta = PAL
    L_muslo, L_pierna, L_pie, alto_tobillo = 17, 17, 10, 3
    L_brazo, L_ante = 15, 14
    sep_cadera = (2.0, -2.0)
    VARIANTES = {'lobo': LOBO, 'ave': AVE}
    humo = {'lobo': [PAL.mat(PAL['piel_lobo']).color(2), PAL.mat(PAL['crin_lobo']).color(2),
                     PAL.mat(PAL['piel_lobo']).color(3)],
            'ave': [PAL.mat(PAL['piel_ave']).color(2), PAL.mat(PAL['crin_ave']).color(2),
                    PAL.mat(PAL['hueso']).color(1)]}

    # ---- lobo ----------------------------------------------------------------------------------
    def cabeza_lobo(self, lz, c, pose, L, K):
        pi, cr, hu = self.m('piel'), self.m('crin'), PAL['hueso']
        boca = pose.extra.get('boca', 0)
        fl = pose.extra.get('crin', 0)
        f = lz.parte()
        f.poligono([L(-3.5, -2.5), L(-5.5 - fl, -10), L(-0.5, -4)], cr, sombreado=(0, 0, 1))      # oreja lejana
        h = lz.parte()
        # greña de las mejillas y la nuca
        for k, (bx, by, ex, ey) in enumerate(((-3, 2, -8, 5), (-4, -1, -9.5, 0.5), (-2, 4, -5, 8), (0, 4.5, -1, 8.5))):
            h.capsula(L(bx, by), L(ex - fl, ey), 2.2, 0.6, cr, tonos=(0, 1, 2))
        h.elipse(L(0, 0), 5.6, 5.0, pi, tonos=(1, 2, 3))
        h.capsula(L(3, 0.2), L(10.0, 1.6), 3.1, 2.3, pi, tonos=(1, 2, 3))                       # hocico
        h.capsula(L(2, 3.2 + boca * 0.4), L(8.6, 3.9 + boca * 1.0), 2.0, 1.3, pi, tonos=(0, 1, 2))  # quijada
        o = lz.parte()
        o.poligono([L(-2.5, -3), L(-3.0 - fl, -11), L(1.5, -4.5)], pi, sombreado=(1, 2, 3), ks=1)  # oreja
        o.linea(L(-1.5, -4.5), L(-2.4 - fl, -9), cr, 0)
        g = lz.parte()
        self.ojo(g, *g.a_px(L(3.2, -1.4)), pose, grande=True)
        g.linea(L(1.0, -3.4), L(5.2, -2.2), cr, 0, fijo=True)          # ceño
        g.pon_m(L(10.4, 0.2), cr, 0, fijo=True)                         # nariz
        g.pon_m(L(10.8, 0.8), cr, 0, fijo=True)
        g.linea(L(5, -1.8), L(9, -0.6), pi, 3, fijo=True)               # luz en la caña del hocico
        if boca > 0.5:
            for i in range(int(round(boca))):
                g.linea(L(3.5, 2.8 + i * 0.9), L(9.6, 2.6 + i * 1.0), cr, 0, fijo=True)
            g.pon_m(L(8.8, 2.6), hu, 2, fijo=True)                      # colmillos
            g.pon_m(L(8.6, 3.4), hu, 1, fijo=True)
            g.pon_m(L(7.6, 2.6 + boca * 1.0), hu, 2, fijo=True)
        else:
            g.linea(L(4, 2.6), L(9.8, 2.4), cr, 0, fijo=True)
            g.pon_m(L(8.6, 3.0), hu, 2, fijo=True)
        return [(f, 'contorno', 1), (h, 'contorno', 0, 1), (o, 'contorno', 0), (g, None, 0)]

    # ---- ave: máscara de cráneo con pico ganchudo --------------------------------------------------
    def cabeza_ave(self, lz, c, pose, L, K):
        pi, cr, hu = self.m('piel'), self.m('crin'), PAL['hueso']
        boca = pose.extra.get('boca', 0)
        fl = pose.extra.get('crin', 0)
        h = lz.parte()
        # capucha de plumas detrás del cráneo
        for k, (bx, by, ex, ey) in enumerate(((-2, -4, -8, -9), (-3, -1, -10, -3), (-3, 2, -9, 4.5),
                                               (-1, 4, -4, 8.5), (0, -4.5, -3, -10))):
            h.capsula(L(bx, by), L(ex - fl, ey - fl * 0.5), 2.0, 0.5, cr, tonos=(0, 0, 1))
        k_ = lz.parte()
        k_.elipse(L(0, -0.5), 5.0, 4.6, hu, tonos=(1, 2, 3))                       # cráneo
        # pico superior largo y ganchudo
        k_.capsula(L(2.5, -1.0), L(9.5, 0.0), 2.8, 1.8, hu, tonos=(1, 2, 3))
        k_.capsula(L(9.5, 0.0), L(12.2, 1.6), 1.8, 1.2, hu, tonos=(1, 2, 3))
        k_.capsula(L(12.2, 1.6), L(12.6, 4.2), 1.2, 0.6, hu, tonos=(0, 1, 2))      # gancho
        # pico inferior (se abre con la boca)
        k_.capsula(L(3.0, 2.4 + boca * 0.5), L(8.6, 2.6 + boca * 1.2), 1.4, 0.8, hu, tonos=(0, 1, 2))
        g = lz.parte()
        # cuenca oscura con la brasa del ojo
        ox, oy = g.a_px(L(1.8, -1.2))
        for dx, dy in ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1), (0, 0)):
            g.pon(ox + dx, oy + dy, cr, 0, fijo=True)
        self.ojo(g, ox + 1, oy, pose)
        g.pon_m(L(5.6, -0.8), cr, 1, fijo=True)                         # narina
        g.linea(L(-2.5, -3.5), L(-0.5, -1.5), hu, 0, fijo=True)         # grieta del cráneo
        g.linea(L(3, 1.6), L(9.6, 1.8), hu, 0, fijo=True)               # comisura del pico
        if boca > 0.5:
            g.linea(L(4, 2.2), L(9, 2.2 + boca * 0.8), cr, 0, fijo=True)
        return [(h, 'contorno', 0), (k_, 'contorno', 0, 1), (g, None, 0)]

    def detalle_pierna(self, capa, p, lado, pose):
        if self.variante != 'lobo':
            return
        # mechones de pelo detrás de la pantorrilla
        cr = self.m('crin')
        r, t = p['rodilla'], p['tobillo']
        v = (t[0] - r[0], t[1] - r[1])
        for k in (0.2, 0.5):
            b = mas(r, v, k)
            capa.capsula(b, mas(b, (-3.2, 1.6)), 1.4, 0.5, cr, tonos=(0, 1, 2))

    def detalle_brazo(self, capa, b, lado, pose):
        if self.variante != 'lobo':
            return
        cr = self.m('crin')
        cdo = b['codo']
        capa.capsula(cdo, mas(cdo, (-2.8, 2.0)), 1.6, 0.5, cr, tonos=(0, 1, 2))

    def detalle_torso(self, p, c, pose, u, n):
        if self.variante != 'lobo':
            return
        # pectorales y abdomen marcados
        tor = c['torso']
        pec, bar = tor.punto('pecho'), tor.punto('barriga')
        pi = self.m('piel')
        p.linea(mas(mas(pec, n, 4), u, -3), mas(mas(pec, n, 7.5), u, -2), pi, 1)
        p.linea(mas(mas(bar, n, 3.5), u, 1), mas(mas(bar, n, 5.5), u, 1.5), pi, 1)
        p.pon_m(mas(mas(bar, n, 4.5), u, 4), pi, 3)


B = Pose(tronco=24, cabeza=-10, hombro_c=10, codo_c=30, hombro_l=-8, codo_l=26, muslo_c=18, rodilla_c=34, pie_c=-8,
         muslo_l=-10, rodilla_l=28, pie_l=-8, mano_c='abierta', mano_l='abierta')


def animaciones():
    return animaciones_bestia(B)


PERSONAJE = NahualAnimal()
VARIANTES_KIT, cuadro_variante, revision_variantes = kit_variantes(PERSONAJE, ['lobo', 'ave'])
