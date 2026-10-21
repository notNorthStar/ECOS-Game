"""
Animaciones estándar de un humanoide de perfil (todas las que pide CharacterKits.ts), como listas de poses.

Uso desde el módulo de un personaje:

    from anim_humano import animaciones_humanas
    A = animaciones_humanas(BASE)          # reposo, caminar, correr, subida/salto, caida, aterrizar, esquivar,
                                           # conjuro, invocar, purificar, ataque/golpe, lanzar, interactuar,
                                           # dano, aturdido/agotado, morir
    A['disparar'] = Anim([...], 12, False) # lo propio del personaje

Las caras que se piden ('normal', 'parpadeo', 'concentrado', 'grito', 'dolor', 'apunta') y las manos
('puno', 'abierta', 'sena_*') las resuelve cada personaje; si no tiene una, usa la normal.
"""
from __future__ import annotations

import math
from typing import Dict

from lib import Anim, Pose

# Ciclo de caminar (pierna cercana; la lejana va media vuelta después): (muslo, rodilla, pie)
CAMINAR = [(24, 4, 14), (15, 12, 2), (3, 6, 0), (-9, 4, -4), (-19, 12, -24), (-9, 38, -26), (11, 40, -8), (24, 16, 8)]
# Ciclo de correr
CORRER = [(30, 22, 2), (12, 44, 0), (-12, 22, -10), (-32, 30, -40), (-24, 92, -50), (12, 118, -30), (54, 96, -10), (50, 44, 0)]


def ciclo(keys, i, n=8):
    a = keys[i % n]
    b = keys[(i + n // 2) % n]
    return a, b


def animaciones_humanas(B: Pose, paso: float = 1.0, senas=('sena_a', 'sena_b', 'sena_c', 'sena_d'),
                        lean_correr: float = 13) -> Dict[str, Anim]:
    """Juego completo de animaciones de un humanoide a partir de su pose base `B`.
    paso: amplitud del caminar/correr (1 = adulto; <1 pasos más cortos). senas: manos del conjuro (LSM).
    Cada personaje puede reemplazar o añadir animaciones después (p. ej., `disparar` del protagonista)."""
    A: Dict[str, Anim] = {}
    # Reposo: respira (el torso baja 1 px y los hombros se relajan), parpadeo en el último cuadro.
    A['reposo'] = Anim([B, B.con(hunde=0.6), B.con(hunde=1, hombro_c=5, codo_c=16), B.con(hunde=0.4, cara='parpadeo')],
                       3.5, True)

    cam = []
    for i in range(8):
        (mc, rc, pc), (ml, rl, pl) = ciclo(CAMINAR, i)
        s = -math.sin(i / 8 * 2 * math.pi + 0.35)
        cam.append(B.con(tronco=4, muslo_c=mc * paso, rodilla_c=rc, pie_c=pc, muslo_l=ml * paso, rodilla_l=rl, pie_l=pl,
                         hombro_c=22 * s, codo_c=14 + max(0, 22 * s) * 0.7,
                         hombro_l=-22 * s, codo_l=14 + max(0, -22 * s) * 0.7,
                         hunde=0.5 if i % 4 in (1, 2) else 0, cabeza=0))
    A['caminar'] = Anim(cam, 10, True)

    cor = []
    for i in range(8):
        (mc, rc, pc), (ml, rl, pl) = ciclo(CORRER, i)
        s = -math.sin(i / 8 * 2 * math.pi + 0.5)
        cor.append(B.con(tronco=lean_correr, muslo_c=mc * paso, rodilla_c=rc, pie_c=pc, muslo_l=ml * paso, rodilla_l=rl, pie_l=pl,
                         hombro_c=48 * s, codo_c=78 + 12 * s, hombro_l=-48 * s, codo_l=78 - 12 * s,
                         cabeza=-4, mano_c='puno', extra={'alzar': 2 if i % 4 == 3 else 0}))
    A['correr'] = Anim(cor, 14, True)

    # Salto: impulso (estirado) y subida (piernas recogidas); caída: piernas que buscan el suelo.
    sub1 = B.con(tronco=4, muslo_c=46, rodilla_c=70, pie_c=-20, muslo_l=-10, rodilla_l=16, pie_l=-40,
                 hombro_c=110, codo_c=40, hombro_l=-40, codo_l=30, cabeza=-6)
    sub2 = B.con(tronco=6, muslo_c=60, rodilla_c=96, pie_c=-20, muslo_l=24, rodilla_l=90, pie_l=-30,
                 hombro_c=90, codo_c=60, hombro_l=40, codo_l=60, cabeza=-4)
    A['subida'] = Anim([sub1, sub2], 8, False)
    A['salto'] = A['subida']
    cai1 = B.con(tronco=2, muslo_c=36, rodilla_c=50, pie_c=-10, muslo_l=4, rodilla_l=40, pie_l=-20,
                 hombro_c=120, codo_c=30, hombro_l=-50, codo_l=30, cabeza=4, mano_c='abierta')
    cai2 = B.con(tronco=4, muslo_c=22, rodilla_c=18, pie_c=-14, muslo_l=-8, rodilla_l=24, pie_l=-22,
                 hombro_c=100, codo_c=24, hombro_l=-60, codo_l=24, cabeza=6, mano_c='abierta')
    A['caida'] = Anim([cai1, cai2], 6, False)
    ate1 = B.con(tronco=18, muslo_c=48, rodilla_c=96, pie_c=0, muslo_l=30, rodilla_l=100, pie_l=0,
                 hombro_c=30, codo_c=40, hombro_l=10, codo_l=40, hunde=1, cabeza=10)
    ate2 = B.con(tronco=8, muslo_c=24, rodilla_c=44, pie_c=0, muslo_l=10, rodilla_l=44, pie_l=0,
                 hombro_c=14, codo_c=24, hombro_l=0, codo_l=20)
    A['aterrizar'] = Anim([ate1, ate2], 14, False)

    # Esquivar: rodada (giros de 90° exactos: el dibujo no se deforma).
    bola = B.con(tronco=44, muslo_c=96, rodilla_c=146, pie_c=-40, muslo_l=86, rodilla_l=146, pie_l=-50,
                 hombro_c=40, codo_c=80, hombro_l=30, codo_l=80, cabeza=30, hunde=2)
    A['esquivar'] = Anim([
        B.con(tronco=40, muslo_c=60, rodilla_c=90, pie_c=0, muslo_l=-20, rodilla_l=30, pie_l=-30,
              hombro_c=120, codo_c=20, hombro_l=100, codo_l=20, cabeza=24),
        bola.con(giro=90), bola.con(giro=180), bola.con(giro=270)], 13, False)

    # Conjuro: deletrea en LSM con la mano cercana frente a la cara (el deletreo es a una mano).
    con = B.con(tronco=0, hombro_c=74, codo_c=76, hombro_l=-2, codo_l=30,
                muslo_c=10, rodilla_c=6, muslo_l=-8, rodilla_l=4, cara='concentrado')
    A['conjuro'] = Anim([con.con(mano_c=senas[0], extra={'chispas': 0}),
                         con.con(hombro_c=80, codo_c=70, mano_c=senas[1], extra={'chispas': 1}),
                         con.con(hombro_c=70, codo_c=82, mano_c=senas[2], extra={'chispas': 2}),
                         con.con(hombro_c=78, codo_c=74, mano_c=senas[3], extra={'chispas': 3})], 6, True)

    # Invocar / purificar: brazos al cielo con luz.
    inv = B.con(tronco=-4, hombro_c=142, codo_c=14, hombro_l=130, codo_l=20, cabeza=-10, mano_c='abierta',
                mano_l='abierta', muslo_c=12, muslo_l=-10, cara='concentrado')
    A['invocar'] = Anim([inv.con(extra={'chispas': 0}), inv.con(hombro_c=148, extra={'chispas': 1}),
                         inv.con(hombro_c=146, hunde=1, extra={'chispas': 2}), inv.con(hombro_c=140, extra={'chispas': 3})],
                        6, True)
    pur = B.con(tronco=-2, hombro_c=96, codo_c=6, hombro_l=80, codo_l=10, mano_c='abierta', mano_l='abierta',
                muslo_c=14, muslo_l=-12, cara='concentrado')
    A['purificar'] = Anim([pur.con(extra={'chispas': 0}), pur.con(hombro_c=100, extra={'chispas': 1}),
                           pur.con(hombro_c=94, hunde=1, extra={'chispas': 2})], 6, True)

    # Ataque / golpe: empujón con el hombro y puñetazo.
    atk0 = B.con(tronco=-6, hombro_c=-30, codo_c=100, hombro_l=40, codo_l=60, muslo_c=20, rodilla_c=12,
                 muslo_l=-16, rodilla_l=10, cara='concentrado')
    atk1 = B.con(tronco=14, hombro_c=88, codo_c=0, hombro_l=-30, codo_l=40, muslo_c=30, rodilla_c=24,
                 muslo_l=-24, rodilla_l=8, pie_l=-12, cara='grito')
    atk2 = B.con(tronco=8, hombro_c=60, codo_c=30, hombro_l=-10, codo_l=30, muslo_c=24, rodilla_c=16, muslo_l=-18,
                 rodilla_l=8)
    A['ataque'] = Anim([atk0, atk1, atk2], 10, False)
    A['golpe'] = A['ataque']

    # Lanzar: brazo atrás por encima del hombro y suelta hacia adelante.
    A['lanzar'] = Anim([
        B.con(tronco=-8, hombro_c=170, codo_c=60, hombro_l=50, codo_l=30, muslo_c=20, muslo_l=-14, mano_c='abierta'),
        B.con(tronco=10, hombro_c=100, codo_c=10, hombro_l=-20, codo_l=30, muslo_c=26, rodilla_c=16, muslo_l=-20,
              mano_c='abierta', cara='grito'),
        B.con(tronco=14, hombro_c=40, codo_c=20, hombro_l=-30, codo_l=30, muslo_c=24, rodilla_c=16, muslo_l=-20,
              mano_c='abierta')], 10, False)

    # Interactuar: se inclina y alarga la mano.
    A['interactuar'] = Anim([
        B.con(tronco=10, hombro_c=50, codo_c=30, muslo_c=10, rodilla_c=8, mano_c='abierta'),
        B.con(tronco=14, hombro_c=74, codo_c=10, muslo_c=14, rodilla_c=12, mano_c='abierta', hunde=1)], 5, False)

    # Daño: sacudida hacia atrás (cabeza atrás, cara de dolor).
    A['dano'] = Anim([
        B.con(tronco=-14, cabeza=-10, hombro_c=-30, codo_c=40, hombro_l=-40, codo_l=40, muslo_c=14, rodilla_c=10,
              muslo_l=-10, cara='dolor', hunde=1),
        B.con(tronco=-6, cabeza=-4, hombro_c=-14, codo_c=30, hombro_l=-20, codo_l=30, muslo_c=10, rodilla_c=8,
              cara='dolor')], 8, False)

    # Aturdido / agotado: encorvado, manos en las rodillas, se balancea.
    atu = B.con(tronco=34, cabeza=16, hombro_c=24, codo_c=10, hombro_l=20, codo_l=10, muslo_c=20, rodilla_c=26,
                muslo_l=-2, rodilla_l=24, cara='parpadeo', mano_c='abierta', mano_l='abierta')
    A['aturdido'] = Anim([atu, atu.con(tronco=36, hunde=1), atu.con(tronco=33, cara='dolor'), atu.con(hunde=1)], 4, True)
    A['agotado'] = A['aturdido']

    # Morir: se dobla, cae de rodillas y se desploma (sin violencia gráfica).
    A['morir'] = Anim([
        B.con(tronco=-12, cabeza=-10, hombro_c=-20, codo_c=40, hombro_l=-30, codo_l=40, cara='dolor'),
        B.con(tronco=20, cabeza=16, hombro_c=10, codo_c=30, hombro_l=0, codo_l=30, muslo_c=30, rodilla_c=60,
              muslo_l=10, rodilla_l=60, cara='dolor'),
        B.con(tronco=16, cabeza=20, hombro_c=6, codo_c=20, hombro_l=-6, codo_l=20, muslo_c=20, rodilla_c=110,
              pie_c=-60, muslo_l=10, rodilla_l=110, pie_l=-60, cara='dolor'),
        B.con(tronco=40, cabeza=24, hombro_c=40, codo_c=20, hombro_l=30, codo_l=20, muslo_c=20, rodilla_c=110,
              pie_c=-60, muslo_l=10, rodilla_l=110, pie_l=-60, cara='parpadeo', mano_c='abierta', mano_l='abierta'),
        B.con(giro=90, tronco=0, cabeza=0, hombro_c=10, codo_c=30, hombro_l=-10, codo_l=20, muslo_c=10, rodilla_c=20,
              muslo_l=-6, rodilla_l=30, pie_c=0, pie_l=0, cara='parpadeo'),
    ], 7, False)
    return A
