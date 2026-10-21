"""
Utilidades del lote "espectros" (espiritu, momia, muneca, vampiro). No es un personaje: `generar.py` ignora los
módulos que empiezan con '_'.

Qué agrega sobre la biblioteca (sin tocarla):

  * `RigEspectro(Humanoide)`: el mismo rig del piloto con un `cuadro()` que además permite
      - **variantes** (`pose.extra['variante']`): cada variante tiene su paleta (mismos nombres y orden de
        materiales → los índices de los mapas valen para todas) y el personaje puede cambiar formas;
      - **velo**: el material llamado 'velo' es tela/humo etéreo; tras el contorno se trama al 50 % (alpha 0/255)
        y pierde su contorno, así los jirones se ven translúcidos sin semitransparencia;
      - **disolver** (`pose.extra['disuelve']` 0…1): se deshace en un tramado Bayer de abajo hacia arriba (o al
        revés con `disuelve_dir`), para desvanecerse o volverse niebla sin violencia gráfica;
      - **ancla fija** (`ancla_fija = True`): para lo que flota, el cuadro NO se alinea al píxel más bajo (los
        pies colgando harían saltar el cuerpo) sino a la altura que tiene la pose base;
      - `post(lz, c, pose)`: último retoque sobre el lienzo ya contorneado.
  * `kit_variantes(personaje, variantes)`: lo que `generar.py` necesita para empaquetar TODAS las variantes en
    una hoja (`VARIANTES_KIT`, `cuadro_variante`, `revision_variantes`; ver su docstring). La revisión extra es
    una hoja por variante (`revision/<id>_<variante>.png`, salvo la primera) y la comparativa
    `revision/<id>_variantes.png`. El fondo de comparación lo declara cada personaje con `FONDO = (...)`.
"""
from __future__ import annotations

import math
import os
import sys
from typing import Dict, List, Optional, Sequence

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib import (VACIO, Anim, Lienzo, Mapa, Paleta, Pose, contar_colores, hoja_revision, mas)  # noqa: E402
from humanoide import Humanoide  # noqa: E402

BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], float) / 16.0 + 1 / 32


def torso_vacio(paleta: Paleta, anclas: Dict[str, tuple]) -> Mapa:
    """Mapa de torso sin píxeles: solo anclas (para torsos dibujados por código, como el Chaneque Mayor)."""
    return Mapa(['.'], {}, paleta, dict(anclas))


def eje(a, b):
    """Vector unitario de a→b y su perpendicular 'hacia adelante' (derecha cuando a→b apunta arriba)."""
    d = (b[0] - a[0], b[1] - a[1])
    L = math.hypot(*d) or 1.0
    u = (d[0] / L, d[1] / L)
    return u, (-u[1], u[0])


class RigEspectro(Humanoide):
    paletas: Dict[str, Paleta] = {}
    variantes: Sequence[str] = ()
    ancla_fija = False
    _base_dy: Dict[str, int]

    # ---------------------------------------------------------------------------------------
    def var(self, pose: Pose) -> str:
        v = pose.extra.get('variante')
        return str(v) if v is not None else (self.variantes[0] if self.variantes else '')

    def pose_base(self) -> Pose:
        return Pose()

    def cuadro(self, pose: Pose, depurar: bool = False, _medir: bool = False):
        v = self.var(pose)
        if self.paletas:
            self.paleta = self.paletas.get(v, next(iter(self.paletas.values())))
        W, H = self.fw * 2, self.fh * 2
        ox, oy = W // 2, int(H * 0.72)
        lz = Lienzo(W, H, ox, oy, self.paleta)
        c = self.ctx(pose)
        c['variante'] = v
        for nombre in self.orden(pose):
            fn = getattr(self, 'parte_' + nombre, None)
            if fn is None:
                continue
            for item in (fn(lz, c, pose) or []):
                capa, linea, oscuro = item[:3]
                lz.pegar(capa, linea=linea, oscuro=oscuro, proyecta=item[3] if len(item) > 3 else 0)
        self.retoques(lz, c, pose)
        lz.contorno_exterior()
        lz.limpiar()
        # --- alineado (antes de tramar o disolver: si no, el cuerpo saltaría) ---
        solido = lz.mascara() & ~lz.fx
        ys = np.nonzero(solido.any(axis=1))[0]
        yb = int(ys.max()) if len(ys) else oy
        if _medir:
            return yb - oy
        if self.ancla_fija and pose.extra.get('suelta') is None:
            if not hasattr(self, '_base_dy'):
                self._base_dy = {}
            if v not in self._base_dy:
                self._base_dy[v] = self.cuadro(self.pose_base().con(extra={'variante': v}), _medir=True)
            yb = oy + self._base_dy[v]
        alzar = int(pose.extra.get('alzar', 0))
        # --- velo: tramado 50 % y sin contorno propio ---
        self.tramar_velo(lz, pose)
        self.post(lz, c, pose)
        d = float(pose.extra.get('disuelve', 0) or 0)
        if d > 0:
            self.disolver(lz, d, pose.extra.get('disuelve_dir', 'arriba'), yb)
        img = lz.rgba()
        y0 = yb - self.pivote[1] + alzar
        x0 = ox - self.pivote[0]
        out = np.zeros((self.fh, self.fw, 4), np.uint8)
        sy0, sy1 = max(0, y0), min(H, y0 + self.fh)
        sx0, sx1 = max(0, x0), min(W, x0 + self.fw)
        out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = img[sy0:sy1, sx0:sx1]
        perdido = int((img[..., 3] > 0).sum()) - int((out[..., 3] > 0).sum())
        if perdido > 0:
            print(f'  AVISO {self.id}[{v}]: {perdido} px quedan fuera del cuadro ({pose.cara}, giro={pose.giro})')
        return out

    # ---------------------------------------------------------------------------------------
    def tramar_velo(self, lz: Lienzo, pose: Pose):
        if 'velo' not in self.paleta.idx:
            return
        vi = self.paleta['velo']
        m = lz.mat == vi
        if not m.any():
            return
        H, W = m.shape
        yy, xx = np.mgrid[0:H, 0:W]
        fase = int(pose.extra.get('fase_velo', 0))
        quitar = m & (((xx + yy + fase) % 2 == 0) | (lz.ton < 0))
        lz.mat[quitar] = VACIO
        lz.fijo[quitar] = False
        lz.fx[quitar] = False

    def disolver(self, lz: Lienzo, k: float, direccion: str, yb: int):
        """Deshace la figura en un tramado ordenado. k = 0 nada, 1 todo. 'arriba' = empieza por los pies."""
        m = lz.mascara()
        ys = np.nonzero(m.any(axis=1))[0]
        if not len(ys):
            return
        top, bot = ys.min(), max(ys.max(), yb)
        H, W = m.shape
        yy, xx = np.mgrid[0:H, 0:W]
        alto = max(1, bot - top)
        if direccion == 'arriba':
            g = (yy - top) / alto           # 1 en los pies
        elif direccion == 'abajo':
            g = (bot - yy) / alto
        else:
            g = np.full(m.shape, 0.5)
        umbral = BAYER4[yy % 4, xx % 4]
        # a k=0.5 se va la mitad de abajo casi entera y la de arriba apenas
        valor = k * 1.6 + (g - 0.5) * 1.2 - 0.3
        quitar = m & (umbral < valor)
        lz.mat[quitar] = VACIO
        lz.fijo[quitar] = False
        lz.fx[quitar] = False

    def post(self, lz: Lienzo, c, pose: Pose):
        pass


# =============================================================================================
#  Chispas / motas de luz (efectos sin contorno, posiciones fijas por cuadro)
# =============================================================================================

def motas(lz: Lienzo, centro, mat: int, k: int, pts=((-14, -10), (12, -18), (16, 2), (-16, 10), (6, -26),
                                                     (-8, -22), (18, -8), (-18, -2)), tono=(1, 3), sube=2):
    for j, (dx, dy) in enumerate(pts):
        if (j + k) % 2:
            continue
        x, y = lz.a_px((centro[0] + dx, centro[1] + dy - k * sube))
        if not (1 <= x < lz.w - 1 and 1 <= y < lz.h - 1):
            continue
        lz.pon(x, y, mat, tono[1], fx=True)
        if (j + k) % 4 == 0:
            for ex, ey in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                if lz.mat[y + ey, x + ex] < 0:
                    lz.pon(x + ex, y + ey, mat, tono[0], fx=True)


# =============================================================================================
#  Variantes en el kit (las empaqueta generar.py)
# =============================================================================================

def kit_variantes(P: RigEspectro, variantes: Sequence[str]):
    """(VARIANTES_KIT, cuadro_variante, revision_variantes) para `generar.py`: la variante va en
    `pose.extra['variante']`; sin ella, `P.cuadro` dibuja la primera."""
    vs = list(variantes)

    def cuadro_variante(v: str, pose: Pose):
        return P.cuadro(pose.con(extra={'variante': v}))

    def revision_variantes(pid, por_var, anims: Dict[str, Anim], pivote, rev: str):
        for v in vs[1:]:
            hoja_revision(pid, por_var[v], anims, 4, pivote).save(os.path.join(rev, f'{pid}_{v}.png'))
        comparativa(por_var, vs, P.fw, P.fh).save(os.path.join(rev, f'{pid}_variantes.png'))

    return vs, cuadro_variante, revision_variantes


def comparativa(por_var, vs, fw, fh, escala=3):
    """Todas las variantes lado a lado en reposo, caminar y ataque (×3), para compararlas de un vistazo."""
    motions = [m for m in ('reposo', 'caminar', 'correr', 'ataque', 'aturdido', 'morir') if m in por_var[vs[0]]]
    W = len(motions) * fw * escala
    H = len(vs) * fh * escala
    img = Image.new('RGBA', (W, H), (52, 50, 60, 255))
    for r, v in enumerate(vs):
        for col, m in enumerate(motions):
            lista = por_var[v][m]
            im = lista[min(len(lista) - 1, 1 if m != 'morir' else len(lista) - 1)]
            cel = Image.new('RGBA', (fw, fh), (52 + 8 * (col % 2), 50 + 8 * (col % 2), 60 + 8 * (col % 2), 255))
            cel.alpha_composite(Image.fromarray(im))
            img.paste(cel.resize((fw * escala, fh * escala), Image.NEAREST), (col * fw * escala, r * fh * escala))
    return img
