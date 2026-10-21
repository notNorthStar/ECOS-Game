"""Encapuchado de la Cofradía del Espejo Negro (enemigo; dispara y ataca). Capucha grande con punta, rostro en
sombra con ojos que brillan, capa que cae de los hombros hasta la pantorrilla y termina en jirones, túnica con
cinturón, mangas anchas, pantalón y botas oscuros. Tres variantes (mismos nombres que el kit de Codex):

  * `rojo`  (miembro-cofradia-rojo.png): capa y túnica rojo oscuro, cinturón de cuero, bolsa de tela clara y
             BASTÓN de madera (su ataque es un bastonazo); un ojo blanco.
  * `negro` (miembro-cofradia-negro.png): todo gris carbón, capa que lo envuelve, broche, ojos ámbar; sin bastón
             (ataca con un zarpazo de la manga).
  * `elite` (miembro-cofradia-rojo-negro.png): capa roja sobre túnica negra, cinturón dorado con medallón,
             guantes negros, dos ojos blancos; sin bastón.

`conjuro` = carga el proyectil con la mano alzada al frente, a la altura de la capucha (el juego dibuja el
orbe en x+14, y−64; la mano queda en ≈ x+19, y−63); `ataque` = anticipación larga (≈0,6 s) y golpe; `morir` = cae y se deshace en humo.

Medidas: cuadro 112×100, pivote (56, 96), ~74 px de alto (su kit de Codex: 74–75 px a escala 1)."""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas, mat_rot  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import animaciones_humanas  # noqa: E402
from personajes._humanoides import (HumanoideX, capa_trasera, chispas, desvanecer, falda, humo,  # noqa: E402
                                    instalar_variantes, rasgar, variante)

VARIANTES = ('rojo', 'negro', 'elite')

# Rampas por variante (mismos materiales; el dibujo cambia de color sin cambiar de estructura).
COLORES = {
    'rojo': {
        'capa':    (['#2c0b10', '#4e171b', '#742826', '#983a30'], '#16050a'),
        'tunica':  (['#2c0b10', '#4e171b', '#742826', '#983a30'], '#16050a'),
        'cinto':   (['#24140e', '#3e261a', '#583a28'], '#140a06'),
        'ojo':     (['#8a8a90', '#f4f2ee'], '#8a8a90'),
        'piel':    (['#24140e', '#3e261a', '#583a28', '#74503a'], '#140a06'),
    },
    'negro': {
        'capa':    (['#121014', '#1f1c22', '#2e2a32', '#423d48'], '#08070a'),
        'tunica':  (['#121014', '#1c1a20', '#29262e', '#38343e'], '#08070a'),
        'cinto':   (['#100e12', '#18161a', '#5e5a62'], '#08070a'),
        'ojo':     (['#a04a10', '#ffb050'], '#a04a10'),
        'piel':    (['#141216', '#221f24', '#332f36', '#46424a'], '#08070a'),
    },
    'elite': {
        'capa':    (['#300c10', '#56181c', '#802a28', '#a6403a'], '#18060a'),
        'tunica':  (['#121014', '#1e1b22', '#2c2830', '#3c3842'], '#08070a'),
        'cinto':   (['#6a4614', '#b0862e', '#e8c466'], '#3a240a'),
        'ojo':     (['#8a8a90', '#f4f2ee'], '#8a8a90'),
        'piel':    (['#141216', '#221f24', '#332f36', '#46424a'], '#08070a'),
    },
}

PAL = Paleta([
    Material('capa',    list(COLORES['rojo']['capa'][0]),   COLORES['rojo']['capa'][1]),
    Material('tunica',  list(COLORES['rojo']['tunica'][0]), COLORES['rojo']['tunica'][1]),
    Material('sombra',  ['#0a0608', '#140c10'],                              '#0a0608'),
    Material('ojo',     list(COLORES['rojo']['ojo'][0]),    COLORES['rojo']['ojo'][1]),
    Material('cinto',   list(COLORES['rojo']['cinto'][0]),  COLORES['rojo']['cinto'][1]),
    Material('bolsa',   ['#6a6460', '#a29c94', '#cec8be'],                   '#2e2a28'),
    Material('madera',  ['#2a180e', '#4a2e1c', '#6e482c', '#8e6440'],        '#140a06'),
    Material('bota',    ['#161214', '#262022', '#3a3234'],                   '#0a0808'),
    Material('piel',    list(COLORES['rojo']['piel'][0]),   COLORES['rojo']['piel'][1]),
    Material('morado',  ['#2a0a40', '#5a1890', '#a040ff', '#e0b0ff'],        '#2a0a40'),
    Material('humo',    ['#4a4652', '#6e6a76', '#9a96a2'],                   '#4a4652'),
])

_VAR = {'v': 'rojo'}


def usar_variante(v: str):
    """Cambia los colores (y los detalles: bastón, bolsa, ojos) a la variante `v`."""
    _VAR['v'] = v
    for nombre, (rampa, cont) in COLORES[v].items():
        m = PAL.mat(PAL[nombre])
        m.rampa = list(rampa)
        m.contorno = cont


# ------------------------------------------------------------------------------------------------
# Capucha 17×17 (mirando a la derecha): punta atrás arriba, borde iluminado, rostro en sombra con ojo(s).
# c C D E capa (sombra→luz) · v sombra del rostro · o ojo · O ojo lejano (solo élite/negro)
# ------------------------------------------------------------------------------------------------
LEY_CAPUCHA = {
    'b': ('capa', 0), 'c': ('capa', 1), 'C': ('capa', 2), 'D': ('capa', 3),
    'v': ('sombra', 0, 'f'), 'w': ('sombra', 1, 'f'), 'o': ('ojo', 1, 'f'), 'O': ('ojo', 0, 'f'),
}
CAPUCHA_N = """
    ...cc..............
    ...cDc.............
    ....cDc............
    ....cCDcc..........
    ....bcCDDCcc.......
    ...bcCDDDDDCcc.....
    ...bcCDDDDDDDCc....
    ..bcCDDDDCCccCDc...
    ..bcCDDDCcwvvvvcDc.
    .bccCDDCcwvvvvvvcDc
    .bccCDDCcvvvvvvvcCc
    .bbcCDDCcvvvvvvvcCc
    .bbcCCDCcwvvvvvvcCc
    .bbccCCCcwvvvvvcCc.
    ..bbccCCcbwvvvvcCc.
    ..bbbcccCbbwvvcCc..
    ...bbbcccCcbbccc...
    ....bbbbbbbbbbb....
"""
CAPUCHAS = {'normal': CAPUCHA_N}
CAPUCHAS['parpadeo'] = CAPUCHA_N
CAPUCHAS['dolor'] = CAPUCHAS['parpadeo']


def _capucha(nombre: str, var: str) -> Mapa:
    txt = CAPUCHAS.get(nombre, CAPUCHA_N)
    ley = dict(LEY_CAPUCHA)
    if nombre not in ('parpadeo', 'dolor'):
        filas = [l.strip() for l in txt.strip('\n').split('\n')]
        r = list(filas[11])
        if var == 'rojo':
            r[14] = 'o'                       # un ojo blanco
        else:
            r[12], r[14] = 'O', 'o'           # dos ojos (el lejano más tenue)
        filas[11] = ''.join(r)
        txt = '\n'.join(filas)
    return Mapa.de_texto(txt, ley, PAL, {'cuello': (10, 17), 'nuca': (3, 12), 'ojo': (14, 11)})


# Torso: túnica bajo la esclavina, cinturón (g) con medallón/hebilla (G O).
LEY_TORSO = {
    't': ('tunica', 0), 'T': ('tunica', 1), 'U': ('tunica', 2), 'V': ('tunica', 3),
    'g': ('cinto', 0), 'G': ('cinto', 1), 'O': ('cinto', 2, 'f'),
}
TORSO = """
    .....tTt.....
    ...tTUUUTt...
    ..tTUVVUUTt..
    ..tTUVUUUTt..
    ..tTUVUUUTt..
    ..tTUUUUUTt..
    ..tTUUUUTTt..
    ..tTUUUUTTt..
    ..tTUUUUTTt..
    ..tTUUUTTTt..
    ..tTUUUTTTt..
    ..ggGGGGOGgg.
    ..ggggggOggg.
    ..tTUUUTTt...
"""
ANCLAS_TORSO = {'o': (6, 17), 'cuello': (6, 0), 'hombro_c': (7, 3), 'hombro_l': (4, 3),
                'cint_b': (2, 12), 'cint_f': (10, 12), 'bolsa': (4, 12), 'espalda': (3, 1), 'pecho': (8, 6)}

LEY_BOTA = {'a': ('bota', 0), 'b': ('bota', 1), 'c': ('bota', 2)}
BOTA = Mapa.de_texto("""
    bccb.....
    bccbb....
    bcbbbcc..
    abbbbbbc.
    aaaaaaaaa
""", LEY_BOTA, PAL, {'o': (2, 0)})

LEY_BOLSA = {'a': ('bolsa', 0), 'b': ('bolsa', 1), 'c': ('bolsa', 2), 'g': ('cinto', 1)}
BOLSA = Mapa.de_texto("""
    .gg.
    .bb.
    bccb
    bcbb
    abba
    .aa.
""", LEY_BOLSA, PAL, {'o': (1, 0)})


class Encapuchado(HumanoideX):
    id = 'encapuchado'
    fw, fh = 112, 100
    pivote = (56, 96)
    alto = 74
    L_muslo, L_pierna, L_pie, alto_tobillo = 17, 17, 9, 4
    L_brazo, L_ante = 11, 11
    sep_cadera = (1.5, -1.5)
    paleta = PAL
    torso_cizalla_max = 22.0

    @property
    def var(self) -> str:
        return _VAR['v']

    def torso_mapa(self, pose):
        return Mapa.de_texto(TORSO, LEY_TORSO, PAL, ANCLAS_TORSO)

    def cabeza_mapa(self, pose):
        return _capucha(pose.cara, self.var)

    def orden(self, pose):
        o = ['capa', 'brazo_l', 'pierna_l', 'pierna_c', 'tunica', 'torso', 'bolsa', 'esclavina', 'cabeza',
             'baston', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    def viento(self, pose) -> float:
        return float(pose.extra.get('viento', 1))

    # ---- miembros -------------------------------------------------------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        capa.estampa(BOTA, p['tobillo'], mat_rot(-p['ang_pie']), 'o')
        bo = P['bota']
        tob = mas(p['tobillo'], dir_ang(p['ang_pierna']), 1.0)
        capa.capsula(p['rodilla'], tob, 2.6, 2.6, bo, tonos=(0, 1, 2), redondo_b=False)
        capa.capsula(p['cadera'], p['rodilla'], 3.4, 2.7, bo, tonos=(0, 1, 2))

    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        dibujar_mano(capa, P, b, 'abierta' if mano.startswith('sena') else mano, tam=1.1)
        tu = P['capa'] if self.var == 'elite' else P['tunica']
        capa.capsula(b['hombro'], b['codo'], 2.8, 2.5, tu, tonos=(1, 2, 3))
        # manga ancha que se abre en el puño
        m0 = capa.mascara().copy()
        capa.capsula(b['codo'], mas(b['muneca'], dir_ang(b['ang_ante']), -0.5), 2.5, 3.4, tu, tonos=(1, 2, 3),
                     redondo_b=False, bandas=[(0.75, 1.1, tu, (0, 1, 2))])
        nueva = capa.mascara() & ~m0 & (capa.mat == tu)
        rasgar(capa, nueva, 2 if lado == 'c' else 4, 1, paso=1)

    # ---- capas ----------------------------------------------------------------------------------
    def parte_capa(self, lz, c, pose):
        """Capa larga que cae por la espalda hasta la pantorrilla, en jirones."""
        p = lz.parte()
        tor = c['torso']
        hb = tor.punto('espalda', 0, -2)
        v = self.viento(pose)
        largo = 47 + pose.extra.get('capa_dl', 0)
        capa_trasera(p, hb, largo, 20 + v * 0.5, self.paleta['capa'], v * 1.3, R=c['R'], tonos=(0, 1, 2),
                     rasgado=4, semilla=int(pose.extra.get('fase', 0)), fase=pose.extra.get('fase', 0) * 0.9)
        return [(p, 'contorno', 0)]

    def parte_tunica(self, lz, c, pose):
        p = lz.parte()
        tor = c['torso']
        v = self.viento(pose)
        largo = self.L_muslo + self.L_pierna * (0.62 if self.var != 'negro' else 0.78)
        elite = self.var == 'elite'
        m = falda(self, p, c, pose, self.paleta['capa' if elite else 'tunica'], tor.punto('cint_b'),
                  tor.punto('cint_f', 1, 0), largo, vuelo=2.5 + v * 0.2, viento=v, tonos=(1, 2, 3),
                  cadera_ancho=(5.5, 5.5), pliegues=(0.3, 0.65), rasgado=3, semilla=int(pose.extra.get('fase', 0)) + 1,
                  ondas=1)
        if elite:
            # la capa roja se abre al frente y deja ver la túnica negra
            cf = tor.punto('cint_f', 0, 0)
            ys, xs = np.nonzero(m)
            tu = self.paleta['tunica']
            for y, x in zip(ys, xs):
                wy = y - p.oy
                fila = xs[ys == y]
                borde = fila.max()
                ancho = 3 + (wy - (cf[1])) * 0.12
                if borde - ancho <= x <= borde - 1 and wy > cf[1]:
                    p.mat[y, x] = tu
                    p.ton[y, x] = 1 if x == borde - 1 else 2
        return [(p, 'contorno', 0, 1)]

    def parte_bolsa(self, lz, c, pose):
        if self.var != 'rojo':
            return []
        p = lz.parte()
        p.estampa(BOLSA, c['torso'].punto('bolsa', 0, 1), c['R'], 'o')
        return [(p, 'contorno', 0)]

    def parte_esclavina(self, lz, c, pose):
        """Manto corto sobre los hombros (nace de la capucha) con el borde en jirones."""
        P = self.paleta
        p = lz.parte()
        tor = c['torso']
        cu = tor.punto('cuello')
        hc = tor.punto('hombro_c')
        hl = tor.punto('hombro_l')
        v = self.viento(pose)
        R = c['R']

        def L(base, dx, dy):
            d = R @ np.array([dx, dy])
            return base[0] + d[0], base[1] + d[1]

        largo = 6 if self.var != 'negro' else 12
        pts = [L(cu, -5, -2), L(cu, 4, -2), L(hc, 4.5, 2), L(hc, 4.0, largo), L(hc, 0, largo + 2),
               L(hl, -2, largo + 3), L(hl, -6 - v * 0.4, largo + 1), L(hl, -6.5 - v * 0.3, 3)]
        m = p.poligono(pts, P['capa'], sombreado=(1, 2, 3), ks=2, kl=1)
        rasgar(p, m, int(pose.extra.get('fase', 0)) + 5, 3)
        if self.var == 'negro':   # broche
            b = L(cu, 3, 3)
            p.pon_m(b, P['cinto'], 2, fijo=True)
            p.pon_m(mas(b, (0, 1)), P['cinto'], 1, fijo=True)
        return [(p, 'contorno', 0, 1)]

    def parte_baston(self, lz, c, pose):
        if self.var != 'rojo':
            return []
        P = self.paleta
        p = lz.parte()
        w = c['brazo_c']['muneca']
        d = dir_ang(c['brazo_c']['ang_ante'])
        mano = mas(w, d, 1.6)
        a = math.radians(pose.extra.get('baston', 6) + pose.giro)
        up = (math.sin(a), -math.cos(a))
        arriba, abajo = pose.extra.get('baston_l', (28, 31))
        top = mas(mano, up, arriba)
        bot = mas(mano, up, -abajo)
        ma = P['madera']
        p.capsula(bot, top, 1.0, 1.1, ma, tonos=(1, 2, 3), sombra=-0.3)
        # nudo curvo arriba
        n = (-up[1], up[0])
        p.capsula(top, mas(mas(top, up, 2.5), n, -2.0), 1.3, 1.0, ma, tonos=(1, 2, 3))
        p.capsula(mas(top, up, -6), mas(top, up, -4), 1.5, 1.5, ma, tonos=(0, 1, 2))
        return [(p, 'contorno', 0)]

    def retoques(self, lz, c, pose):
        P = self.paleta
        ch = pose.extra.get('chispas')
        if ch is not None:
            w = c['brazo_c']['muneca']
            chispas(lz, [mas(w, (3, -2))], P['morado'], int(ch), 3, 1,
                    pts=((-2, -3), (3, -5), (1, -7), (-4, 1), (5, -1), (2, 3), (6, -6), (-1, -10)))
        k = pose.extra.get('humo')
        if k is not None:
            cad = c['cadera']
            humo(lz, (cad[0], cad[1] - 2), k, P['humo'], n=11, radio=16, sube=16, semilla=3)



BASE = Pose(tronco=4, cabeza=4, hombro_c=24, codo_c=40, hombro_l=-4, codo_l=20,
            muslo_c=6, rodilla_c=4, pie_c=0, muslo_l=-6, rodilla_l=2, pie_l=0, extra={'viento': 1, 'baston': 4})


def animaciones():
    A = animaciones_humanas(BASE, paso=0.9, lean_correr=14)
    B = BASE

    def ext(p, **kw):
        e = dict(p.extra)
        e.update(kw)
        return p.con(extra=e)

    # Reposo: respira bajo la capa; la capa apenas se mece.
    A['reposo'] = Anim([ext(B, fase=0), ext(B.con(hunde=0.6), fase=1, viento=1.5),
                        ext(B.con(hunde=1, hombro_c=26, codo_c=42), fase=2, viento=2),
                        ext(B.con(hunde=0.4, cara='parpadeo'), fase=3, viento=1.5)], 3.5, True)
    # Caminar / correr: el brazo cercano lleva el bastón (se mueve poco), la capa ondea.
    A['caminar'] = Anim([ext(p.con(hombro_c=24 + (p.hombro_c - BASE.hombro_c) * 0.2, codo_c=40),
                             viento=2.5 + (i % 2) * 0.5, fase=i, baston=4 + (i % 4))
                         for i, p in enumerate(A['caminar'].poses)], 9, True)
    A['correr'] = Anim([ext(p.con(hombro_c=40, codo_c=50), viento=7 + (i % 3), fase=i, baston=24)
                        for i, p in enumerate(A['correr'].poses)], 13, True)
    for k, v in (('subida', 3), ('caida', 6), ('aterrizar', 3), ('esquivar', 5)):
        A[k] = Anim([ext(p, viento=v, fase=i, baston=30) for i, p in enumerate(A[k].poses)], A[k].fps, A[k].loop)
    A['salto'] = A['subida']
    # Ataque: alza el bastón por encima de la cabeza (anticipación ~0,55 s) y lo descarga de arriba abajo.
    w0 = B.con(tronco=-4, cabeza=-2, hombro_c=120, codo_c=40, hombro_l=-20, codo_l=30, muslo_c=14, rodilla_c=8,
               muslo_l=-12, extra={'baston': -50, 'baston_l': (20, 18), 'viento': 1.5})
    w1 = w0.con(tronco=-10, hombro_c=150, codo_c=50, extra={'baston': -95, 'fase': 1})
    w2 = w1.con(tronco=-12, hombro_c=160, hunde=0.5, extra={'baston': -110, 'fase': 2})
    s1 = B.con(tronco=18, cabeza=6, hombro_c=96, codo_c=6, hombro_l=-36, codo_l=30, muslo_c=30, rodilla_c=26,
               muslo_l=-24, rodilla_l=8, pie_l=-12, extra={'baston': 80, 'baston_l': (22, 16), 'viento': 5, 'fase': 3})
    s2 = s1.con(tronco=14, hombro_c=80, codo_c=12, extra={'baston': 110, 'fase': 4, 'viento': 3})
    A['ataque'] = Anim([w0, w1, w2, w2.con(hombro_c=162, extra={'fase': 3}), w2.con(extra={'fase': 0}), s1, s2], 9, False)
    A['golpe'] = A['ataque']
    # Conjuro / disparar: carga el proyectil con la mano alzada al frente (donde el juego pinta el orbe).
    cj = B.con(tronco=-2, hombro_c=128, codo_c=-14, hombro_l=40, codo_l=60, mano_c='abierta', muslo_c=14,
               rodilla_c=8, muslo_l=-12, extra={'baston': 4, 'viento': 2})
    A['conjuro'] = Anim([ext(cj, chispas=i, fase=i, viento=2 + (i % 2)) for i in range(4)], 8, True)
    A['disparar'] = Anim([ext(cj.con(hombro_c=122), chispas=2, viento=3), ext(cj.con(tronco=-6, hombro_c=132), viento=4),
                          ext(cj.con(hombro_c=124), fase=2)], 10, False)
    A['lanzar'] = A['disparar']
    A['invocar'] = Anim([ext(B.con(tronco=-6, cabeza=-8, hombro_c=150, codo_c=20, hombro_l=140, codo_l=20,
                                   mano_c='abierta', mano_l='abierta'), chispas=i, fase=i, viento=3, baston=0,
                             baston_l=(8, 40))
                         for i in range(4)], 6, True)
    A['dano'] = Anim([ext(p, viento=-2, fase=i) for i, p in enumerate(A['dano'].poses)], 8, False)
    A['aturdido'] = Anim([ext(p, viento=1, fase=i, baston=30) for i, p in enumerate(A['aturdido'].poses)], 4, True)
    A['agotado'] = A['aturdido']
    # Morir: se dobla, cae de rodillas y se deshace en humo (queda solo el humo que se disipa).
    m = A['morir'].poses
    A['morir'] = Anim([ext(m[0], fase=0), ext(m[1], fase=1, baston=30), ext(m[2], fase=2, baston=40),
                       ext(m[3], fase=3, baston=60, humo=0.3, desvanece=0.35),
                       ext(m[3].con(hunde=2), fase=0, baston=60, humo=0.6, desvanece=0.75),
                       ext(m[3].con(hunde=3), fase=1, baston=60, humo=0.9, desvanece=1.01)], 7, False)
    A['purificar'] = A['aturdido']
    return A


PERSONAJE = Encapuchado()


def _render(v, pose):
    usar_variante(v)
    try:
        return PERSONAJE.cuadro(pose)
    finally:
        usar_variante('rojo')


instalar_variantes('encapuchado', VARIANTES, _render)
