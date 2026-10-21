"""Momia de Guanajuato (~72 px): cuerpo envuelto en vendas viejas color hueso sucio, restos de ropa antigua (faldón
raído y una banda de tela cruzada al pecho), un ojo que brilla naranja entre las vendas y la boca entreabierta.
Inquietante sin gore: no hay carne ni heridas; por los huecos de las vendas solo asoma piel seca oscura.

Vendas = cápsulas con bandas alternas de tono (cada vuelta) y costuras del lado de la sombra, así las vueltas
giran con el miembro. Las manos usan el material 'piel', que aquí ES la venda (manos vendadas).
`purificar` = se arrodilla y el brillo del ojo se apaga en luz cálida; `morir` = se desploma y una tira de venda
queda suelta."""
from __future__ import annotations

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import Anim, Capa, Mapa, Material, Paleta, Pose, dir_ang, mas, mat_rot  # noqa: E402
from manos import dibujar_mano  # noqa: E402
from anim_humano import animaciones_humanas, CAMINAR  # noqa: E402
from personajes._espectros import RigEspectro, eje, motas, registrar_fondo, torso_vacio  # noqa: E402

PAL = Paleta([
    # 'piel' = venda (las manos de manos.py usan 'piel')
    Material('piel',  ['#3e3428', '#62553f', '#8a7b5c', '#b2a27e', '#d6c8a2'],  '#1e170e'),
    Material('ropa',  ['#211913', '#35291d', '#4d3d2a', '#665238'],             '#120c08'),
    Material('seca',  ['#24160e', '#3e2818', '#5c3e26'],                        '#120c08'),
    Material('ojo',   ['#a8401a', '#f07a26', '#ffd27a'],                        '#4a1a0a'),
    Material('luz',   ['#c89a4a', '#ffe0a0', '#fff6dc'],                        '#8a6a2a'),
])

# ------------------------------------------------------------------------------------------------
# Cabeza 13×14: cráneo vendado (vueltas inclinadas hacia la cara), franja oscura de los ojos con el brillo
# naranja, boca entreabierta. 0-4 venda · d hueco seco · o O ojo · m boca. Ancla 'cuello'.
# ------------------------------------------------------------------------------------------------
LEY_CABEZA = {
    '0': ('piel', 0), '1': ('piel', 1), '2': ('piel', 2), '3': ('piel', 3), '4': ('piel', 4),
    'd': ('seca', 0, 'f'), 'D': ('seca', 1, 'f'), 'o': ('ojo', 2, 'f'), 'O': ('ojo', 1, 'f'), 'q': ('ojo', 0, 'f'),
    'm': ('seca', 0, 'f'),
}
CABEZA_N = """
    ....01111....
    ..011233210..
    .01223344321.
    0122000123321
    01233334400121
    0123334444321.
    0122000dDqOd..
    0123333dddDo..
    012333444333..
    .012200003332.
    .012333dmmd2..
    ..0123300dd...
    ...012333.....
    ....0122......
"""


def _cab(filas):
    ls = [l.strip() for l in CABEZA_N.strip('\n').split('\n')]
    for i, f in filas.items():
        ls[i] = f
    return '\n'.join(ls)


CABEZAS = {
    'normal': CABEZA_N,
    'parpadeo': _cab({6: '0122000dDDqd..', 7: '0123333dddDq..'}),
    'concentrado': _cab({6: '0122000dddOd..', 7: '0123333ddDOo..'}),
    'grito': _cab({10: '.012333dmmmd..', 11: '..0123dmmmd...', 12: '...0123mm.....'}),
    'dolor': _cab({6: '0122000dddqd..', 10: '.012333dmmmd..', 11: '..0123dmmmd...'}),
    'calma': _cab({6: '0122000dDDDd..', 7: '0123333ddDDD..', 10: '.012333dDDd2..'}),
}
_cache = {}


def cabeza(cara):
    if cara not in _cache:
        _cache[cara] = Mapa.de_texto(CABEZAS.get(cara, CABEZA_N), LEY_CABEZA, PAL, {'cuello': (5, 13)})
    return _cache[cara]


ANCLAS_TORSO = {'o': (0, 0), 'cintura': (0, -7), 'pecho': (1, -14), 'cuello': (2, -21),
                'hombro_c': (1, -18), 'hombro_l': (-2, -18)}
_TORSO = torso_vacio(PAL, ANCLAS_TORSO)


def vueltas(n: int, t0: float = 0.0, t1: float = 1.0, mat: int = 0):
    """Bandas alternas a lo largo de un miembro: cada vuelta de venda un tono más oscura."""
    out = []
    paso = (t1 - t0) / n
    for k in range(n):
        if k % 2 == 1:
            out.append((t0 + k * paso, t0 + (k + 0.45) * paso, mat, (0, 1, 2)))
    return out


class Momia(RigEspectro):
    id = 'momia'
    tipo = 'humanoide'
    fw, fh = 96, 88
    pivote = (44, 85)
    alto = 72
    L_muslo, L_pierna, L_pie, alto_tobillo = 16, 15, 8, 3
    L_brazo, L_ante = 12, 11
    sep_cadera = (1.0, -1.0)
    torso_cizalla_max = 0.0
    paleta = PAL

    def torso_mapa(self, pose):
        return _TORSO

    def cabeza_mapa(self, pose):
        return cabeza(pose.cara)

    def orden(self, pose):
        o = ['brazo_l', 'pierna_l', 'pierna_c', 'torso', 'faldon', 'cabeza', 'brazo_c', 'tira']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    # ---- piernas vendadas, pies envueltos ------------------------------------------------------
    def pierna(self, capa: Capa, p, lado, pose):
        P = self.paleta
        V = P['piel']
        capa.capsula(p['talon'], p['punta'], 2.2, 1.7, V, tonos=(1, 2, 3), bandas=vueltas(3, mat=V))
        capa.capsula(p['rodilla'], p['tobillo'], 2.6, 2.2, V, tonos=(1, 2, 3), bandas=vueltas(5, mat=V),
                     pliegues=[(0.3, 0), (0.7, 0)])
        capa.capsula(p['cadera'], p['rodilla'], 3.4, 2.7, V, tonos=(1, 2, 3), bandas=vueltas(5, mat=V),
                     pliegues=[(0.55, 0)])
        # hueco entre vueltas: asoma piel seca
        capa.pon_m(mas(p['rodilla'], dir_ang(p['ang_pierna']), 4), P['seca'], 1)

    def brazo(self, capa: Capa, b, lado, pose):
        P = self.paleta
        V = P['piel']
        mano = pose.mano_c if lado == 'c' else pose.mano_l
        dibujar_mano(capa, P, b, mano if mano in ('abierta', 'garra', 'puno') else 'abierta')
        capa.capsula(b['codo'], b['muneca'], 2.1, 1.8, V, tonos=(1, 2, 3), bandas=vueltas(4, mat=V),
                     pliegues=[(0.5, 0)], redondo_b=False)
        capa.capsula(b['hombro'], b['codo'], 2.6, 2.2, V, tonos=(1, 2, 3), bandas=vueltas(4, mat=V))

    # ---- torso por código: vueltas de venda, banda de tela cruzada ---------------------------
    def parte_torso(self, lz, c, pose):
        P = self.paleta
        V, R = P['piel'], P['ropa']
        p = lz.parte()
        tor = c['torso']
        cad = c['cadera_torso']
        cin, pec, cue = tor.punto('cintura'), tor.punto('pecho'), tor.punto('cuello')
        u, n = eje(cad, cue)
        p.capsula(cad, cin, 4.6, 4.2, V, tonos=(1, 2, 3), bandas=vueltas(3, mat=V))
        p.capsula(cin, pec, 4.2, 5.2, V, tonos=(1, 2, 3), bandas=vueltas(4, mat=V))
        p.capsula(pec, mas(cue, (0, 1)), 5.2, 3.6, V, tonos=(1, 2, 3))
        p.capsula(mas(cue, (0, 1)), mas(cue, (1, -2)), 2.0, 1.8, V, tonos=(1, 2, 3), bandas=vueltas(2, mat=V))
        # costuras inclinadas de las vueltas (bajan hacia adelante)
        for k in range(5):
            a = mas(mas(cad, u, 3 + k * 3.6), n, -4.5)
            p.linea(a, mas(mas(a, u, -2.2), n, 8.5), V, 0)
        # costillas marcadas bajo la venda (lado de la luz)
        for k in range(2):
            a = mas(mas(pec, u, -1 - k * 2.5), n, 1.5)
            p.linea(a, mas(a, n, 2.0), V, 3)
        # hueco con piel seca
        p.pon_m(mas(mas(cin, u, 2), n, 2), P['seca'], 1)
        p.pon_m(mas(mas(cin, u, 2), n, 3), P['seca'], 0)
        # banda de tela vieja: del hombro cercano a la cadera trasera
        h = tor.punto('hombro_c')
        a, b = mas(mas(h, u, 1), n, 1.5), mas(mas(cin, u, -1), n, -4.5)
        p.capsula(a, b, 1.7, 1.7, R, tonos=(1, 2, 3))
        p.linea(mas(a, n, -0.5), mas(b, n, -0.5), R, 0)
        c['eje_torso'] = (u, n)
        return [(p, 'contorno', 0)]

    # ---- faldón de ropa antigua raída ------------------------------------------------------
    def parte_faldon(self, lz, c, pose):
        P = self.paleta
        R = P['ropa']
        p = lz.parte()
        cad = c['cadera_torso']
        u, n = c.get('eje_torso', ((0, -1), (1, 0)))
        cin = c['torso'].punto('cintura')
        Rm = c['R']
        caida = (Rm @ np.array([0, 1])).tolist()
        piernas = []
        for lado in ('l', 'c'):
            pts = c['pierna_' + lado]
            piernas.append(mas(pts['cadera'], dir_ang(pts['ang_muslo']), self.L_muslo * 0.62))
        fr = max(piernas, key=lambda q: q[0])
        at = min(piernas, key=lambda q: q[0])
        top_f, top_b = mas(mas(cin, n, 5.0), u, -1), mas(mas(cin, n, -5.0), u, -1)
        hem_f = mas(fr, n, 3.5)
        hem_b = mas(at, n, -3.5)
        borde = []
        for i in range(8):
            t = i / 7
            q = (lerp(hem_f[0], hem_b[0], t), lerp(hem_f[1], hem_b[1], t))
            borde.append(mas(q, caida, 2.5 if i % 2 else -0.5 + (i % 3) * 0.5))
        p.poligono([top_b, top_f] + borde, R, sombreado=(1, 2, 3), ks=1)
        # pliegues y un roto
        for k in (-1.5, 1.5):
            a = mas(mas(cad, n, k), u, 4)
            p.linea(a, mas(a, caida, 9), R, 0)
        p.pon_m(mas(mas(cad, n, 3), caida, 4), P['seca'], 0)
        # cinto de venda
        p.linea(mas(top_b, u, -1), mas(top_f, u, -1), P['piel'], 2)
        p.linea(mas(top_b, u, -2), mas(top_f, u, -2), P['piel'], 1)
        return [(p, 'contorno', 0, 1)]

    # ---- tira de venda suelta (cuelga del brazo lejano / se lanza en 'lanzar') ---------------
    def parte_tira(self, lz, c, pose):
        P = self.paleta
        V = P['piel']
        p = lz.parte()
        lanza = pose.extra.get('tira', 0)
        fase = pose.extra.get('fase', 0)
        if lanza:
            b = c['brazo_c']
            w = b['muneca']
            d = dir_ang(b['ang_ante'])
            prev = w
            for k in range(1, 9):
                t = k / 8
                q = mas(mas(w, d, t * lanza), (-d[1], d[0]), math.sin(t * 7 + fase) * 1.6)
                p.capsula(prev, q, 1.4, 1.2, V, tonos=(1, 2, 3) if k % 2 else (0, 1, 2))
                prev = q
            return [(p, 'contorno', 0)]
        # suelta, colgando del antebrazo lejano
        b = c['brazo_l']
        a = mas(b['codo'], dir_ang(b['ang_ante']), 3)
        prev = a
        vien = pose.extra.get('viento', 0)
        for k in range(1, 5):
            q = mas(a, (-vien * k * 0.8 + math.sin(fase + k) * 0.8, k * 2.6))
            p.capsula(prev, q, 1.2, 1.0, V, tonos=(0, 1, 2))
            prev = q
        return [(p, 'contorno', 1)]

    def post(self, lz, c, pose):
        ch = pose.extra.get('chispas')
        if ch is not None:
            cab = c.get('cabeza')
            cen = c['torso'].punto('pecho')
            motas(lz, (cen[0], cen[1] - 4), self.paleta['luz'], ch, tono=(0, 2))


def lerp(a, b, t):
    return a + (b - a) * t


PERSONAJE = Momia()
registrar_fondo('momia', 'nivel-07-cdmx2', 'torre', 300)

BASE = Pose(tronco=8, cabeza=6, hombro_c=8, codo_c=16, hombro_l=-2, codo_l=14,
            muslo_c=6, rodilla_c=8, pie_c=0, muslo_l=-6, rodilla_l=6, pie_l=0, mano_c='abierta', mano_l='abierta')


def animaciones():
    B = BASE
    A = animaciones_humanas(B, paso=0.8, lean_correr=16)
    sin = lambda i, n, f=0.0: math.sin(i / n * 2 * math.pi + f)  # noqa: E731
    # Reposo: respira con estertor, la cabeza se ladea despacio, el brazo cercano cuelga flojo.
    A['reposo'] = Anim([B.con(hunde=[0, 0.6, 1, 0.6][i], cabeza=6 + 3 * sin(i, 4), hombro_c=8 + 2 * sin(i, 4, 1),
                              cara='parpadeo' if i == 3 else 'normal', extra={'fase': i})
                        for i in range(4)], 3, True)
    # Caminar: arrastra los pies; el brazo cercano rígido al frente, el lejano cuelga; la cabeza cabecea.
    cam = []
    for i in range(8):
        a = CAMINAR[i]
        b = CAMINAR[(i + 4) % 8]
        s = sin(i, 8, 0.35)
        cam.append(B.con(tronco=12, cabeza=10 + 4 * s, muslo_c=a[0] * 0.7, rodilla_c=a[1] * 0.8, pie_c=a[2] * 0.6,
                         muslo_l=b[0] * 0.7, rodilla_l=b[1] * 0.8, pie_l=b[2] * 0.6,
                         hombro_c=64 + 6 * s, codo_c=12, hombro_l=-6 - 10 * s, codo_l=18,
                         hunde=0.6 if i % 4 in (1, 2) else 0, extra={'fase': i, 'viento': 0.3}))
    A['caminar'] = Anim(cam, 7, True)
    # Correr: se abalanza con los dos brazos estirados.
    A['correr'] = Anim([p.con(hombro_c=80 + 6 * sin(i, 8), codo_c=8, hombro_l=70 - 6 * sin(i, 8), codo_l=10,
                              mano_c='garra', mano_l='garra', cabeza=-2, extra={'fase': i, 'viento': 1.2})
                        for i, p in enumerate(A['correr'].poses)], 12, True)
    # Golpe (preparar el agarre): se echa atrás con los brazos en alto.
    g0 = B.con(tronco=-10, cabeza=-8, hombro_c=150, codo_c=40, hombro_l=135, codo_l=40, muslo_c=16, rodilla_c=14,
               muslo_l=-14, rodilla_l=10, mano_c='garra', mano_l='garra', cara='grito', extra={'fase': 1})
    g1 = g0.con(tronco=-14, hombro_c=160, hombro_l=148, hunde=1, extra={'fase': 2})
    A['golpe'] = Anim([g0, g1], 6, False)
    # Ataque (agarre): se lanza con los dos brazos al frente y cierra las manos.
    k1 = B.con(tronco=22, cabeza=4, hombro_c=88, codo_c=0, hombro_l=80, codo_l=4, muslo_c=30, rodilla_c=26,
               muslo_l=-22, rodilla_l=8, pie_l=-10, mano_c='garra', mano_l='garra', cara='grito', extra={'fase': 3})
    k2 = k1.con(hombro_c=80, codo_c=14, hombro_l=72, codo_l=16, mano_c='puno', mano_l='puno', cara='normal',
                extra={'fase': 4})
    A['ataque'] = Anim([g1, k1, k1.con(extra={'fase': 5}), k2], 10, False)
    A['disparar'] = Anim([k1, k2], 8, False)
    # Lanzar (envolver): latigazo con una tira de venda que sale de la mano.
    A['lanzar'] = Anim([
        B.con(tronco=-6, hombro_c=170, codo_c=60, hombro_l=40, codo_l=30, muslo_c=18, muslo_l=-14, cara='grito',
              extra={'fase': 0}),
        B.con(tronco=12, hombro_c=110, codo_c=10, hombro_l=-20, codo_l=30, muslo_c=26, rodilla_c=16, muslo_l=-20,
              cara='grito', extra={'tira': 12, 'fase': 1}),
        B.con(tronco=16, hombro_c=90, codo_c=0, hombro_l=-30, codo_l=30, muslo_c=26, rodilla_c=16, muslo_l=-20,
              extra={'tira': 20, 'fase': 2}),
        B.con(tronco=14, hombro_c=84, codo_c=4, hombro_l=-30, codo_l=30, muslo_c=24, rodilla_c=16, muslo_l=-20,
              extra={'tira': 22, 'fase': 3})], 9, False)
    # Invocar (grito): echa la cabeza atrás y abre los brazos.
    inv = B.con(tronco=-8, cabeza=-20, hombro_c=120, codo_c=30, hombro_l=100, codo_l=30, mano_c='garra',
                mano_l='garra', cara='grito', muslo_c=14, rodilla_c=10, muslo_l=-12)
    A['invocar'] = Anim([inv.con(hunde=i % 2, hombro_c=120 + 6 * (i % 2), extra={'fase': i}) for i in range(4)], 6, True)
    A['conjuro'] = A['invocar']
    # Purificar: cae de rodillas, baja la cabeza; el ojo se apaga y lo envuelve luz cálida.
    pu = B.con(tronco=20, cabeza=20, muslo_c=22, rodilla_c=110, pie_c=-60, muslo_l=4, rodilla_l=104, pie_l=-70,
               hombro_c=20, codo_c=30, hombro_l=10, codo_l=30)
    A['purificar'] = Anim([pu.con(extra={'chispas': 0}), pu.con(cabeza=24, cara='concentrado', extra={'chispas': 1}),
                           pu.con(cabeza=28, cara='calma', extra={'chispas': 2}),
                           pu.con(cabeza=30, tronco=28, cara='calma', extra={'chispas': 3})], 4, False)
    # Morir: el de la biblioteca (se dobla y se desploma) con la cara apagada al final.
    m = A['morir'].poses
    A['morir'] = Anim(m[:-1] + [m[-1].con(cara='calma')], 7, False)
    return A
