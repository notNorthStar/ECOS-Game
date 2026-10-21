"""
Manos reutilizables (cualquier personaje con un material 'piel' de 4 tonos).

  * 'puno'     puño (procedural, sigue al antebrazo)
  * 'abierta'  mano extendida en la dirección del antebrazo
  * 'garra'    dedos separados y curvos (criaturas; usa el material 'una' si existe)
  * 'sena_*'   configuraciones de LSM dibujadas a mano, ERGUIDAS (no giran con el antebrazo: así se leen
               aunque el brazo cambie de ángulo). Ancla 'o' = muñeca.
               a: puño con pulgar al lado · b: palma plana, dedos arriba · c: mano en C · d: índice arriba
               l: índice y pulgar en L · y: meñique y pulgar · o: dedos juntos en O · u: índice y medio arriba
"""
from __future__ import annotations

from typing import Dict

from lib import Capa, Mapa, Paleta, dir_ang, mas

LEY = {'s': ('piel', 1), 'k': ('piel', 2), 'l': ('piel', 3), 'd': ('piel', 0, 'f')}

SENAS: Dict[str, str] = {
    'a': """
        .lk.
        lkks
        kkks
        lkks
        .ks.
    """,
    'b': """
        .ll.
        lkkl
        lkks
        lkks
        lkks
        .ks.
    """,
    'c': """
        lkk.
        k..d
        k...
        k..d
        lkks
        .ks.
    """,
    'd': """
        ..l.
        ..k.
        ..k.
        lkks
        kkks
        .ks.
    """,
    'l': """
        .l..
        .k..
        .k..
        .kkl
        .kks
        .ks.
    """,
    'y': """
        l..l
        k..k
        kkkk
        kkks
        .ks.
    """,
    'o': """
        .kk.
        k..k
        k..s
        .kks
        .ks.
    """,
    'u': """
        .ll.
        .kk.
        .kk.
        lkks
        kkks
        .ks.
    """,
}

_cache: Dict[tuple, Mapa] = {}


def mapa_sena(letra: str, paleta: Paleta) -> Mapa:
    k = (letra, id(paleta))
    if k not in _cache:
        txt = SENAS[letra]
        filas = [l.strip() for l in txt.strip('\n').split('\n')]
        _cache[k] = Mapa(filas, LEY, paleta, {'o': (1, len(filas) - 1)})
    return _cache[k]


def dibujar_mano(capa: Capa, paleta: Paleta, b, tipo: str, tam: float = 1.0):
    """Dibuja la mano en la muñeca del brazo `b` (salida de fk_brazo)."""
    pi = paleta['piel']
    d = dir_ang(b['ang_ante'])
    w = b['muneca']
    if tipo.startswith('sena_'):
        capa.estampa(mapa_sena(tipo[5:], paleta), mas(w, (0, 1)), ancla='o')
    elif tipo == 'abierta':
        capa.capsula(w, mas(w, d, 3.6 * tam), 1.7 * tam, 1.3 * tam, pi, tonos=(1, 2, 3))
        # pulgar
        capa.pon_m(mas(mas(w, d, 1.2), (-d[1], d[0]), -1.6), pi, 2)
    elif tipo == 'garra':
        um = paleta['una'] if 'una' in paleta.idx else pi
        capa.elipse(mas(w, d, 1.8 * tam), 2.2 * tam, 2.2 * tam, pi, tonos=(1, 2, 3))
        for off in (-1.6, 0.0, 1.6):
            n = (-d[1], d[0])
            base = mas(mas(w, d, 3.2 * tam), n, off * tam)
            tip = mas(mas(base, d, 2.6 * tam), n, off * 0.6)
            capa.linea(base, tip, pi, 1)
            capa.pon_m(mas(tip, d, 0.8), um, 2)
    else:  # puño
        capa.elipse(mas(w, d, 1.6 * tam), 1.9 * tam, 1.9 * tam, pi, tonos=(1, 2, 3))
