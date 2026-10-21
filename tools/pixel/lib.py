"""
Pixel art por código para ECOS — biblioteca común.

Idea general
------------
Cada personaje se dibuja PÍXEL A PÍXEL a escala 1:1 (nada se reduce ni se reescala). El dibujo se arma con:

  * **Materiales**: cada uno es una rampa de tonos (oscuro → claro) + un color de contorno (nunca negro puro).
    Un píxel guarda (material, tono); el color sale al final. Así el sombreado, el "lado lejano más oscuro"
    y los contornos se calculan por material, igual que en los fondos del juego.
  * **Partes**: cada parte (brazo, pierna, torso, cabeza…) se pinta en una capa propia y luego se pega en el
    lienzo en orden de profundidad. Al pegarla se le dibuja una línea interior de su color de contorno donde
    tapa a otra parte (así el brazo cercano se lee sobre el torso) y las partes lejanas se oscurecen un tono.
  * **Mapas a mano** (cabezas, torsos, manos, zapatos, accesorios): cuadrículas de texto con una leyenda de
    caracteres → (material, tono). Se estampan con una transformación afín (cizalla para inclinarse, rotación
    para caer), muestreando hacia atrás con vecino más cercano, así los grupos de píxeles se conservan.
  * **Miembros procedurales**: cápsulas que se adelgazan, sombreadas con la luz ARRIBA-IZQUIERDA en el espacio
    del mundo (si el brazo gira, la sombra sigue del lado correcto), con bandas (puños con franjas, rodilleras…).
  * **Rig 2D por poses** (`Pose`, `fk_*`): ángulos por articulación; cada animación es una lista de poses.
  * Al final: contorno exterior de 1 px del color de contorno de cada material, limpieza de píxeles sueltos,
    alineado de pies al pivote y empaquetado en el formato de kit que lee `src/systems/CharacterKits.ts`.

Convenciones de ángulos (grados, coordenadas de pantalla con y hacia ABAJO):
  * `dir_ang(a)` = (sin a, cos a): 0 = hacia abajo, +90 = hacia adelante (derecha), −90 = hacia atrás, 180 = arriba.
  * Rotación/cizalla positivas = la parte de ARRIBA se va hacia adelante (sentido horario en pantalla).
Los personajes miran a la DERECHA; el juego los espeja.
"""
from __future__ import annotations

import math
import os
from dataclasses import dataclass, field, replace
from typing import Callable, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFont

Punto = Tuple[float, float]

# Luz: viene de ARRIBA a la IZQUIERDA (vector que apunta HACIA la luz, normalizado).
LUZ = (-0.62, -0.78)


# =============================================================================================
#  Colores y materiales
# =============================================================================================

def hex2rgb(h: str) -> Tuple[int, int, int]:
    h = h.lstrip('#')
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


@dataclass
class Material:
    """Rampa de tonos de oscuro (0) a claro (n−1) + color de contorno (tono −1)."""
    nombre: str
    rampa: List[str]
    contorno: Optional[str] = None

    def color(self, tono: int) -> Tuple[int, int, int]:
        if tono < 0:
            return hex2rgb(self.contorno or self.rampa[0])
        return hex2rgb(self.rampa[max(0, min(len(self.rampa) - 1, tono))])

    @property
    def n(self) -> int:
        return len(self.rampa)


class Paleta:
    """Conjunto de materiales de un personaje (índice estable por nombre)."""

    def __init__(self, materiales: Sequence[Material]):
        self.mats: List[Material] = list(materiales)
        self.idx: Dict[str, int] = {m.nombre: i for i, m in enumerate(self.mats)}

    def __getitem__(self, nombre: str) -> int:
        return self.idx[nombre]

    def mat(self, i: int) -> Material:
        return self.mats[i]

    def colores(self) -> List[Tuple[int, int, int]]:
        s = []
        for m in self.mats:
            for c in m.rampa + ([m.contorno] if m.contorno else []):
                rgb = hex2rgb(c)
                if rgb not in s:
                    s.append(rgb)
        return s


# =============================================================================================
#  Geometría
# =============================================================================================

def dir_ang(a: float) -> Punto:
    """Dirección de un hueso con ángulo `a` (0 = abajo, +90 = adelante)."""
    r = math.radians(a)
    return math.sin(r), math.cos(r)


def mas(p: Punto, v: Punto, k: float = 1.0) -> Punto:
    return p[0] + v[0] * k, p[1] + v[1] * k


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def mat_rot(grados: float) -> np.ndarray:
    """Rotación en pantalla; positivo = horario (lo de arriba va hacia adelante)."""
    r = math.radians(grados)
    c, s = math.cos(r), math.sin(r)
    return np.array([[c, -s], [s, c]], float)


def mat_cizalla(grados: float) -> np.ndarray:
    """Cizalla horizontal: las filas de arriba (y local negativa) se corren hacia adelante. Conserva las filas."""
    t = math.tan(math.radians(grados))
    return np.array([[1.0, -t], [0.0, 1.0]], float)


def mat_espejo() -> np.ndarray:
    return np.array([[-1.0, 0.0], [0.0, 1.0]], float)


def mat_escala(sx: float, sy: float) -> np.ndarray:
    return np.array([[sx, 0.0], [0.0, sy]], float)


I2 = np.eye(2)


def inclinar(grados: float, umbral: float = 22.0) -> np.ndarray:
    """Inclinación de una parte dibujada a mano: cizalla si es leve (no rompe los grupos de píxeles),
    rotación si es grande (caídas, rodadas). Múltiplos de 90° rotan sin pérdida."""
    if abs(grados) < 0.5:
        return I2
    if abs(grados) <= umbral:
        return mat_cizalla(grados)
    return mat_rot(grados)


# =============================================================================================
#  Capas y lienzo
# =============================================================================================

VACIO = -1


class Capa:
    """Buffer de (material, tono) + máscaras auxiliares. Coordenadas enteras; (0,0) arriba-izquierda."""

    def __init__(self, w: int, h: int, ox: int = 0, oy: int = 0):
        self.w, self.h = w, h
        # Origen del mundo dentro de la capa: el punto (0,0) del personaje (pivote en el suelo).
        self.ox, self.oy = ox, oy
        self.mat = np.full((h, w), VACIO, np.int16)
        self.ton = np.zeros((h, w), np.int8)
        self.fijo = np.zeros((h, w), bool)   # detalles protegidos de la limpieza (ojos, brillos…)
        self.fx = np.zeros((h, w), bool)     # efectos (destellos): sin contorno

    # ----- básicos ---------------------------------------------------------------------------
    def vacia_como(self) -> 'Capa':
        return Capa(self.w, self.h, self.ox, self.oy)

    def a_px(self, p: Punto) -> Tuple[int, int]:
        """Mundo (float) → píxel de la capa."""
        return int(math.floor(p[0] + self.ox)), int(math.floor(p[1] + self.oy))

    def dentro(self, x: int, y: int) -> bool:
        return 0 <= x < self.w and 0 <= y < self.h

    def pon(self, x: int, y: int, mat: int, ton: int, fijo: bool = False, fx: bool = False):
        if self.dentro(x, y):
            self.mat[y, x] = mat
            self.ton[y, x] = ton
            if fijo:
                self.fijo[y, x] = True
            if fx:
                self.fx[y, x] = True

    def pon_m(self, p: Punto, mat: int, ton: int, **kw):
        """Pinta el píxel que contiene el punto del mundo `p`."""
        x, y = self.a_px(p)
        self.pon(x, y, mat, ton, **kw)

    def mascara(self) -> np.ndarray:
        return self.mat != VACIO

    # ----- primitivas en coordenadas del MUNDO -------------------------------------------------
    def linea(self, a: Punto, b: Punto, mat: int, ton: int, **kw):
        """Línea de Bresenham entre dos puntos del mundo (1 px, sin dobles)."""
        x0, y0 = self.a_px(a)
        x1, y1 = self.a_px(b)
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.pon(x0, y0, mat, ton, **kw)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def elipse(self, c: Punto, rx: float, ry: float, mat: int, tonos: Sequence[int] = (1, 2, 3),
               sombra: float = -0.25, brillo: float = 0.5, tramado: bool = True):
        """Elipse rellena con sombreado esférico (luz arriba-izquierda)."""
        cx, cy = c[0] + self.ox, c[1] + self.oy
        x0, x1 = int(math.floor(cx - rx - 1)), int(math.ceil(cx + rx + 1))
        y0, y1 = int(math.floor(cy - ry - 1)), int(math.ceil(cy + ry + 1))
        for y in range(max(0, y0), min(self.h, y1 + 1)):
            for x in range(max(0, x0), min(self.w, x1 + 1)):
                u, v = (x + 0.5 - cx) / max(rx, 0.01), (y + 0.5 - cy) / max(ry, 0.01)
                d = u * u + v * v
                if d > 1.0:
                    continue
                lit = (u * LUZ[0] + v * LUZ[1])
                self.mat[y, x] = mat
                self.ton[y, x] = tono_por_luz(lit, tonos, sombra, brillo, x, y, tramado)

    def poligono(self, pts: Sequence[Punto], mat: int, ton: int = 1, sombreado: Optional[Sequence[int]] = None,
                 ks: int = 2, kl: int = 1):
        """Polígono relleno (prueba del centro del píxel). Con `sombreado` = (sombra, base, luz) se sombrea por
        cercanía al borde según la luz."""
        P = [(p[0] + self.ox, p[1] + self.oy) for p in pts]
        xs, ys = [p[0] for p in P], [p[1] for p in P]
        m = np.zeros((self.h, self.w), bool)
        for y in range(max(0, int(min(ys)) - 1), min(self.h, int(max(ys)) + 2)):
            cyp = y + 0.5
            nodes = []
            j = len(P) - 1
            for i in range(len(P)):
                (xi, yi), (xj, yj) = P[i], P[j]
                if (yi < cyp <= yj) or (yj < cyp <= yi):
                    nodes.append(xi + (cyp - yi) / (yj - yi) * (xj - xi))
                j = i
            nodes.sort()
            for k in range(0, len(nodes) - 1, 2):
                a, b = nodes[k], nodes[k + 1]
                for x in range(max(0, int(math.ceil(a - 0.5))), min(self.w, int(math.floor(b - 0.5)) + 1)):
                    m[y, x] = True
        self.rellenar_mascara(m, mat, ton, sombreado, ks, kl)
        return m

    def rellenar_mascara(self, m: np.ndarray, mat: int, ton: int = 1, sombreado: Optional[Sequence[int]] = None,
                         ks: int = 2, kl: int = 1):
        self.mat[m] = mat
        if sombreado is None:
            self.ton[m] = ton
        else:
            self.ton[m] = tonos_por_borde(m, sombreado, ks, kl)[m]

    def capsula(self, a: Punto, b: Punto, ra: float, rb: float, mat: int, tonos: Sequence[int] = (1, 2, 3),
                sombra: float = -0.2, brillo: float = 0.55, tramado: bool = True,
                bandas: Sequence[Tuple[float, float, int, Sequence[int]]] = (),
                pliegues: Sequence[Tuple[float, int]] = (), redondo_b: bool = True):
        """Miembro: segmento a→b con radio que pasa de ra a rb. Sombreado cilíndrico en el espacio del mundo.
        `bandas`: [(t0, t1, material, tonos)] reemplazan el material en ese tramo (puños, franjas…).
        `pliegues`: [(t, tono)] marcan una línea de pliegue del lado de la sombra en el tramo t."""
        ax, ay = a[0] + self.ox, a[1] + self.oy
        bx, by = b[0] + self.ox, b[1] + self.oy
        vx, vy = bx - ax, by - ay
        L2 = vx * vx + vy * vy or 1e-6
        L = math.sqrt(L2)
        R = max(ra, rb)
        x0, x1 = int(math.floor(min(ax, bx) - R - 1)), int(math.ceil(max(ax, bx) + R + 1))
        y0, y1 = int(math.floor(min(ay, by) - R - 1)), int(math.ceil(max(ay, by) + R + 1))
        nx, ny = -vy / L, vx / L
        for y in range(max(0, y0), min(self.h, y1 + 1)):
            for x in range(max(0, x0), min(self.w, x1 + 1)):
                px, py = x + 0.5 - ax, y + 0.5 - ay
                traw = (px * vx + py * vy) / L2
                t = min(1.0, max(0.0, traw))
                if not redondo_b and traw > 1.0:
                    continue
                cx, cy = vx * t, vy * t
                r = ra + (rb - ra) * t
                dx, dy = px - cx, py - cy
                d = math.hypot(dx, dy)
                if d > r + 0.05:
                    continue
                # luz: componente perpendicular al hueso (cilindro)
                side = (dx * nx + dy * ny) / max(r, 0.5)
                lit = side * (nx * LUZ[0] + ny * LUZ[1])
                if traw < 0 or traw > 1:   # tapas redondeadas: usa la dirección real
                    lit = (dx * LUZ[0] + dy * LUZ[1]) / max(r, 0.5)
                m, ts = mat, tonos
                for (t0, t1, bm, bt) in bandas:
                    if t0 <= traw <= t1:
                        m, ts = bm, bt
                self.mat[y, x] = m
                tono = tono_por_luz(lit, ts, sombra, brillo, x, y, tramado)
                for (tp, tt) in pliegues:
                    if abs(traw - tp) * L < 0.5 and lit < 0.3:
                        tono = tt
                self.ton[y, x] = tono

    # ----- mapas dibujados a mano ------------------------------------------------------------
    def estampa(self, mapa: 'Mapa', ancla_mundo: Punto, M: np.ndarray = I2, ancla: str = 'o',
                oscuro: int = 0, reemplazos: Optional[Dict[str, Tuple[str, int]]] = None,
                solo_vacio: bool = False) -> 'Estampado':
        """Estampa un mapa con su ancla `ancla` en `ancla_mundo`, transformado por M (local → mundo).
        Devuelve un `Estampado` para consultar dónde quedaron sus otras anclas."""
        ax, ay = mapa.anclas[ancla]
        # ancla redondeada al centro de píxel: evita medio píxel de deriva
        wx = math.floor(ancla_mundo[0] + self.ox) + 0.5
        wy = math.floor(ancla_mundo[1] + self.oy) + 0.5
        Minv = np.linalg.inv(M)
        H, W = len(mapa.filas), mapa.ancho
        # caja del mapa transformado
        esquinas = [(-0.5, -0.5), (W + 0.5, -0.5), (-0.5, H + 0.5), (W + 0.5, H + 0.5)]
        wpts = [M @ np.array([cx - (ax + 0.5), cy - (ay + 0.5)]) for cx, cy in esquinas]
        xs = [p[0] + wx for p in wpts]
        ys = [p[1] + wy for p in wpts]
        ley = mapa.leyenda if not reemplazos else {**mapa.leyenda, **reemplazos}
        for y in range(max(0, int(math.floor(min(ys))) - 1), min(self.h, int(math.ceil(max(ys))) + 2)):
            for x in range(max(0, int(math.floor(min(xs))) - 1), min(self.w, int(math.ceil(max(xs))) + 2)):
                lx, ly = Minv @ np.array([x + 0.5 - wx, y + 0.5 - wy])
                i, j = int(math.floor(lx + ax + 0.5 + 1e-6)), int(math.floor(ly + ay + 0.5 + 1e-6))
                if not (0 <= j < H and 0 <= i < W):
                    continue
                ch = mapa.filas[j][i]
                if ch in ('.', ' ') or ch not in ley:
                    continue
                if solo_vacio and self.mat[y, x] != VACIO:
                    continue
                mname, tono = ley[ch][0], ley[ch][1]
                flags = ley[ch][2] if len(ley[ch]) > 2 else ''
                mi = mapa.paleta[mname]
                if tono >= 0 and oscuro:
                    tono = max(0, tono - oscuro)
                self.mat[y, x] = mi
                self.ton[y, x] = tono
                if 'f' in flags:
                    self.fijo[y, x] = True
                if 'x' in flags:
                    self.fx[y, x] = True
        return previo(mapa, ancla_mundo, M, ancla)

    # ----- tonos -------------------------------------------------------------------------------
    def oscurecer(self, k: int = 1, solo_mat: Optional[Iterable[int]] = None):
        m = self.mascara() & (self.ton >= 0)
        if solo_mat is not None:
            m &= np.isin(self.mat, list(solo_mat))
        self.ton[m] = np.maximum(0, self.ton[m] - k)

    def aclarar(self, k: int = 1, paleta: Optional[Paleta] = None):
        m = self.mascara() & (self.ton >= 0)
        for y, x in zip(*np.nonzero(m)):
            tope = paleta.mat(int(self.mat[y, x])).n - 1 if paleta else 99
            self.ton[y, x] = min(tope, self.ton[y, x] + k)


def tono_por_luz(lit: float, tonos: Sequence[int], sombra: float, brillo: float, x: int, y: int,
                 tramado: bool) -> int:
    """Elige el tono según la luz (−1 = de espaldas a la luz, +1 = de frente). Con tramado se mezcla la franja
    de transición con un damero (como los fondos)."""
    s, b = tonos[0], tonos[1]
    l = tonos[2] if len(tonos) > 2 else tonos[1]
    if lit < sombra:
        return s
    if tramado and lit < sombra + 0.16 and (x + y) % 2 == 0:
        return s
    if lit > brillo:
        return l
    return b


def vecinos4(m: np.ndarray) -> np.ndarray:
    """Píxeles que tocan (arriba/abajo/izq/der) a la máscara."""
    d = np.zeros_like(m)
    d[1:, :] |= m[:-1, :]
    d[:-1, :] |= m[1:, :]
    d[:, 1:] |= m[:, :-1]
    d[:, :-1] |= m[:, 1:]
    return d


def desplazar(m: np.ndarray, dx: int, dy: int, relleno=False) -> np.ndarray:
    """m desplazada (dx, dy): out[y, x] = m[y − dy, x − dx]."""
    out = np.full_like(m, relleno)
    h, w = m.shape
    ys = slice(max(0, dy), min(h, h + dy))
    yd = slice(max(0, -dy), min(h, h - dy))
    xs = slice(max(0, dx), min(w, w + dx))
    xd = slice(max(0, -dx), min(w, w - dx))
    out[ys, xs] = m[yd, xd]
    return out


def tonos_por_borde(m: np.ndarray, tonos: Sequence[int], ks: int = 2, kl: int = 1) -> np.ndarray:
    """Sombreado de una forma por cercanía al borde: sombra cerca del borde de abajo-derecha (a `ks` px),
    luz en el borde de arriba-izquierda (a `kl` px). Base en el resto."""
    s, b = tonos[0], tonos[1]
    l = tonos[2] if len(tonos) > 2 else b
    out = np.full(m.shape, b, np.int8)
    sh = np.zeros_like(m)
    for k in range(1, ks + 1):
        # el píxel k pasos abajo-derecha (o abajo) queda fuera → está en sombra
        sh |= ~desplazar(m, -k, -k) | ~desplazar(m, 0, -k)
    li = np.zeros_like(m)
    for k in range(1, kl + 1):
        li |= ~desplazar(m, k, k) | ~desplazar(m, 0, k)
    out[li] = l
    out[sh] = s
    return out


@dataclass
class Mapa:
    """Dibujo a mano en texto. `leyenda`: carácter → (material, tono[, banderas]); banderas: 'f' = detalle fijo
    (no lo toca la limpieza), 'x' = efecto (sin contorno). Anclas: nombre → (x, y) en celdas del mapa."""
    filas: List[str]
    leyenda: Dict[str, tuple]
    paleta: Paleta
    anclas: Dict[str, Tuple[int, int]] = field(default_factory=dict)

    def __post_init__(self):
        self.filas = [f.rstrip('\n') for f in self.filas]
        self.ancho = max(len(f) for f in self.filas)
        self.filas = [f.ljust(self.ancho, '.') for f in self.filas]
        # Anclas marcadas con caracteres especiales no se usan: van explícitas.
        self.anclas.setdefault('o', (self.ancho // 2, len(self.filas) - 1))

    @staticmethod
    def de_texto(texto: str, leyenda, paleta, anclas=None) -> 'Mapa':
        filas = [l for l in texto.strip('\n').split('\n')]
        # quita la sangría común
        ind = min((len(l) - len(l.lstrip(' ')) for l in filas if l.strip()), default=0)
        filas = [l[ind:] for l in filas]
        return Mapa(filas, leyenda, paleta, dict(anclas or {}))


@dataclass
class Estampado:
    mapa: Mapa
    ancla_mundo: Punto
    M: np.ndarray
    ancla: str

    def punto(self, nombre: str, dx: float = 0, dy: float = 0) -> Punto:
        """Posición en el mundo de otra ancla del mapa (con desplazamiento local opcional)."""
        ax, ay = self.mapa.anclas[self.ancla]
        bx, by = self.mapa.anclas[nombre]
        v = self.M @ np.array([bx + dx - ax, by + dy - ay])
        return self.ancla_mundo[0] + 0.5 + v[0], self.ancla_mundo[1] + 0.5 + v[1]


def previo(mapa: Mapa, ancla_mundo: Punto, M: np.ndarray = I2, ancla: str = 'o') -> Estampado:
    """Dónde quedaría un mapa estampado (para leer sus anclas antes de dibujarlo). Mismo redondeo que estampa()."""
    return Estampado(mapa, (math.floor(ancla_mundo[0]), math.floor(ancla_mundo[1])), M, ancla)


class Lienzo(Capa):
    """Capa final de un cuadro: se le pegan las partes en orden de profundidad."""

    def __init__(self, w: int, h: int, ox: int, oy: int, paleta: Paleta):
        super().__init__(w, h, ox, oy)
        self.paleta = paleta

    def parte(self) -> Capa:
        return self.vacia_como()

    def pegar(self, p: Capa, linea: Optional[str] = 'contorno', oscuro: int = 0, solo_lados: str = '',
              proyecta: int = 0):
        """Pega una parte encima. `linea`:
          'contorno' → los píxeles de lo que ya estaba y tocan a la parte toman el color de contorno de la parte
                       (línea interior que separa, p. ej., el brazo del torso);
          'sombra'   → esos píxeles bajan un tono (separación suave);
          None       → sin línea.
        `oscuro`: baja k tonos a toda la parte (miembros del lado lejano)."""
        if oscuro:
            p.oscurecer(oscuro)
        m = p.mascara()
        if linea:
            solida = m & ~p.fx
            ring = vecinos4(solida) & ~m & self.mascara() & ~self.fx
            if 'abajo' in solo_lados:   # solo la línea por debajo/derecha (sombra proyectada)
                ring &= desplazar(solida, 1, 1) | desplazar(solida, 0, 1)
            if linea == 'contorno':
                # material de la parte vecino a cada píxel del anillo
                vecino = np.full(m.shape, VACIO, np.int16)
                for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                    sm = desplazar(p.mat, dx, dy, VACIO)
                    sel = ring & (vecino == VACIO) & (sm != VACIO) & ~desplazar(p.fx, dx, dy)
                    vecino[sel] = sm[sel]
                sel = ring & (vecino != VACIO) & ~self.fijo
                self.mat[sel] = vecino[sel]
                self.ton[sel] = -1
            elif linea == 'sombra':
                sel = ring & (self.ton >= 0) & ~self.fijo
                self.ton[sel] = np.maximum(0, self.ton[sel] - 1)
        if proyecta:
            # sombra proyectada: la parte tapa la luz (arriba-izquierda) → oscurece lo de abajo-derecha
            solida = m & ~p.fx
            S = np.zeros_like(m)
            for k in range(1, proyecta + 1):
                S |= desplazar(solida, k, k) | desplazar(solida, k, 0) | desplazar(solida, 0, k)
            sel = S & ~m & self.mascara() & (self.ton > 0) & ~self.fijo & ~self.fx
            self.ton[sel] -= 1
        self.mat[m] = p.mat[m]
        self.ton[m] = p.ton[m]
        self.fijo[m] = p.fijo[m]
        self.fx[m] = p.fx[m]

    def contorno_exterior(self):
        """Contorno de 1 px por fuera de la silueta, del color de contorno del material vecino (no negro).
        Los efectos (fx) no generan contorno."""
        solido = self.mascara() & ~self.fx
        ring = vecinos4(solido) & ~self.mascara()
        vecino = np.full(solido.shape, VACIO, np.int16)
        # prioridad: abajo, izquierda, derecha, arriba (el contorno de abajo lo da la parte que pisa)
        for dx, dy in ((0, -1), (1, 0), (-1, 0), (0, 1)):
            sm = desplazar(np.where(solido, self.mat, VACIO).astype(np.int16), dx, dy, VACIO)
            sel = ring & (vecino == VACIO) & (sm != VACIO)
            vecino[sel] = sm[sel]
        self.mat[ring] = vecino[ring]
        self.ton[ring] = -1

    def limpiar(self):
        """Quita píxeles sueltos: un píxel cuyo tono no comparte con ninguno de sus 4 vecinos del mismo material,
        y cuyos vecinos coinciden entre sí, se iguala a ellos (salvo detalles fijos y contornos)."""
        H, W = self.mat.shape
        cambios = []
        for y in range(1, H - 1):
            for x in range(1, W - 1):
                if self.mat[y, x] == VACIO or self.fijo[y, x] or self.fx[y, x] or self.ton[y, x] < 0:
                    continue
                vs = [(self.mat[y + dy, x + dx], self.ton[y + dy, x + dx]) for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0))]
                yo = (self.mat[y, x], self.ton[y, x])
                if yo in vs:
                    continue
                if all(v == vs[0] for v in vs) and vs[0][0] != VACIO and vs[0][1] >= 0:
                    cambios.append((y, x, vs[0]))
        for y, x, (m, t) in cambios:
            self.mat[y, x], self.ton[y, x] = m, t

    def rgba(self) -> np.ndarray:
        out = np.zeros((self.h, self.w, 4), np.uint8)
        cache: Dict[Tuple[int, int], Tuple[int, int, int]] = {}
        ys, xs = np.nonzero(self.mascara())
        for y, x in zip(ys, xs):
            k = (int(self.mat[y, x]), int(self.ton[y, x]))
            if k not in cache:
                cache[k] = self.paleta.mat(k[0]).color(k[1])
            out[y, x, :3] = cache[k]
            out[y, x, 3] = 255
        return out


# =============================================================================================
#  Rig 2D por poses
# =============================================================================================

@dataclass
class Pose:
    """Pose de un humanoide de perfil (mirando a la derecha). Ángulos en grados.
    tronco: inclinación del torso (+ adelante). cabeza: inclinación extra de la cabeza.
    hombro_*: ángulo del brazo respecto al torso (0 = colgando, + adelante); codo_*: flexión (+ dobla hacia
    adelante). muslo_*: ángulo absoluto del muslo (+ adelante); rodilla_*: flexión (≥ 0, la pierna va hacia
    atrás); pie_*: ángulo absoluto del pie (0 = plano, + punta arriba).
    _c = lado cercano (hacia la cámara), _l = lado lejano."""
    tronco: float = 0
    cabeza: float = 0
    hombro_c: float = 0
    codo_c: float = 10
    hombro_l: float = 0
    codo_l: float = 10
    muslo_c: float = 0
    rodilla_c: float = 0
    pie_c: float = 0
    muslo_l: float = 0
    rodilla_l: float = 0
    pie_l: float = 0
    # desplazamientos del cuerpo (px). Con suelo=True la cadera se ajusta sola para que el pie más bajo pise.
    dx: float = 0
    dy: float = 0
    suelo: bool = True
    # el torso (con brazos y cabeza) baja `hunde` px respecto a la cadera: respiración, golpes
    hunde: float = 0
    # rotación de TODO el cuerpo alrededor de la cadera (caídas, rodadas). Múltiplos de 90 son exactos.
    giro: float = 0
    # aspecto
    cara: str = 'normal'
    mano_c: str = 'puno'
    mano_l: str = 'puno'
    brazo_l_delante: bool = False
    extra: Dict[str, object] = field(default_factory=dict)

    def con(self, **kw) -> 'Pose':
        """Copia con cambios (los `extra` se fusionan)."""
        ex = dict(self.extra)
        ex.update(kw.pop('extra', {}) or {})
        return replace(self, extra=ex, **kw)


ANGULARES = ['tronco', 'cabeza', 'hombro_c', 'codo_c', 'hombro_l', 'codo_l', 'muslo_c', 'rodilla_c', 'pie_c',
             'muslo_l', 'rodilla_l', 'pie_l', 'dx', 'dy', 'giro', 'hunde']


def mezclar(a: Pose, b: Pose, t: float) -> Pose:
    """Interpola dos poses (ángulos y desplazamientos); el aspecto se toma de la más cercana."""
    base = a if t < 0.5 else b
    kw = {k: lerp(getattr(a, k), getattr(b, k), t) for k in ANGULARES}
    return replace(base, **kw)


def fk_pierna(cadera: Punto, muslo: float, rodilla: float, pie: float, L_muslo: float, L_pierna: float,
              L_pie: float, alto_tobillo: float) -> Dict[str, Punto]:
    rod = mas(cadera, dir_ang(muslo), L_muslo)
    tob = mas(rod, dir_ang(muslo - rodilla), L_pierna)
    r = math.radians(pie)
    fwd = (math.cos(r), -math.sin(r))       # hacia la punta
    down = (math.sin(r), math.cos(r))       # hacia la suela
    talon = mas(mas(tob, down, alto_tobillo), fwd, -2.5)
    punta = mas(mas(tob, down, alto_tobillo), fwd, L_pie - 2.5)
    return {'cadera': cadera, 'rodilla': rod, 'tobillo': tob, 'talon': talon, 'punta': punta}


def fk_brazo(hombro: Punto, ang: float, codo: float, L_brazo: float, L_ante: float) -> Dict[str, Punto]:
    c = mas(hombro, dir_ang(ang), L_brazo)
    m = mas(c, dir_ang(ang + codo), L_ante)
    return {'hombro': hombro, 'codo': c, 'muneca': m, 'ang_brazo': ang, 'ang_ante': ang + codo}


# =============================================================================================
#  Cuadros, hojas de kit y revisión
# =============================================================================================

@dataclass
class Anim:
    poses: List[Pose]
    fps: float
    loop: bool


def alinear_pies(img: np.ndarray, pivote_y: int, fx_mask: Optional[np.ndarray] = None) -> np.ndarray:
    """Corre el cuadro en vertical para que su fila más baja con píxeles sólidos quede en pivote_y."""
    a = img[..., 3] > 0
    if fx_mask is not None:
        a &= ~fx_mask
    ys = np.nonzero(a.any(axis=1))[0]
    if not len(ys):
        return img
    d = pivote_y - ys.max()
    out = np.zeros_like(img)
    h = img.shape[0]
    if d >= 0:
        out[d:] = img[:h - d]
    else:
        out[:h + d] = img[-d:]
    return out


def contar_colores(imgs: Iterable[np.ndarray]) -> int:
    s = set()
    for im in imgs:
        a = im[..., 3] > 0
        for c in np.unique(im[a][:, :3].reshape(-1, 3), axis=0):
            s.add(tuple(int(v) for v in c))
    return len(s)


def empaquetar(pid: str, cuadros: Dict[str, List[np.ndarray]], anims: Dict[str, Anim], fw: int, fh: int,
               pivote: Tuple[int, int], tipo: str, alto: int, columnas: int = 8, extra: Optional[dict] = None):
    """Arma la hoja (PNG) y el JSON del kit. Los cuadros idénticos se comparten."""
    unicos: List[np.ndarray] = []
    nombres: List[Tuple[str, str]] = []
    claves: Dict[bytes, int] = {}
    animaciones = {}
    for motion, lista in cuadros.items():
        idxs = []
        for n, im in enumerate(lista):
            k = im.tobytes()
            if k not in claves:
                claves[k] = len(unicos)
                unicos.append(im)
                vista = 'lado_der' if (motion == 'reposo' and n == 0) else f'{motion}_{n + 1}'
                nombres.append((f'{pid}_{motion}_{n + 1}', vista))
            idxs.append(claves[k])
        a = anims[motion]
        animaciones[motion] = {'frames': idxs, 'fps': a.fps, 'loop': a.loop}
    n = len(unicos)
    cols = min(columnas, n)
    rows = (n + cols - 1) // cols
    sheet = np.zeros((rows * fh, cols * fw, 4), np.uint8)
    frames = []
    for i, im in enumerate(unicos):
        x, y = (i % cols) * fw, (i // cols) * fh
        sheet[y:y + fh, x:x + fw] = im
        frames.append({'name': nombres[i][0], 'vista': nombres[i][1], 'x': x, 'y': y, 'w': fw, 'h': fh})
    js = {
        'personaje': pid,
        'tipo': tipo,
        'frameWidth': fw,
        'frameHeight': fh,
        'pivot': {'x': pivote[0], 'y': pivote[1]},
        'frames': frames,
        'escala': 1,
        'animaciones': animaciones,
        'cuadrosPorVariante': n,
        'generadoPor': 'tools/pixel/generar.py',
        'alto': alto,
    }
    if extra:
        js.update(extra)
    return sheet, js


def empaquetar_variantes(pid: str, por_var: Dict[str, Dict[str, List[np.ndarray]]], anims: Dict[str, Anim],
                         fw: int, fh: int, pivote: Tuple[int, int], tipo: str, alto: int, columnas: int = 8,
                         extra: Optional[dict] = None):
    """Hoja con VARIAS versiones del mismo personaje (formato de src/systems/CharacterKits.ts):
    `por_var` = {variante: {motion: [cuadros]}} con las variantes en orden (la primera es la principal).
    La variante k ocupa los cuadros k·n … k·n+n−1 con el MISMO orden interno, y `animaciones` usa índices
    DENTRO de la variante (iguales para todas). Dos cuadros se comparten solo si son idénticos en TODAS."""
    vs = list(por_var)
    base = por_var[vs[0]]
    claves: Dict[bytes, int] = {}
    orden: List[Tuple[str, int]] = []          # (motion, n) del primer uso de cada cuadro único
    animaciones = {}
    for motion, lista in base.items():
        idxs = []
        for n in range(len(lista)):
            k = b''.join(por_var[v][motion][n].tobytes() for v in vs)
            if k not in claves:
                claves[k] = len(orden)
                orden.append((motion, n))
            idxs.append(claves[k])
        a = anims[motion]
        animaciones[motion] = {'frames': idxs, 'fps': a.fps, 'loop': a.loop}
    npv = len(orden)
    total = npv * len(vs)
    cols = min(columnas, total)
    rows = (total + cols - 1) // cols
    sheet = np.zeros((rows * fh, cols * fw, 4), np.uint8)
    frames = []
    for vi, v in enumerate(vs):
        for i, (motion, k) in enumerate(orden):
            j = vi * npv + i
            x, y = (j % cols) * fw, (j // cols) * fh
            sheet[y:y + fh, x:x + fw] = por_var[v][motion][k]
            vista = 'lado_der' if (motion == 'reposo' and k == 0) else f'{motion}_{k + 1}'
            frames.append({'name': f'{pid}_{v}_{motion}_{k + 1}', 'vista': vista, 'x': x, 'y': y, 'w': fw, 'h': fh})
    js = {
        'personaje': pid,
        'tipo': tipo,
        'frameWidth': fw,
        'frameHeight': fh,
        'pivot': {'x': pivote[0], 'y': pivote[1]},
        'frames': frames,
        'escala': 1,
        'animaciones': animaciones,
        'cuadrosPorVariante': npv,
        'generadoPor': 'tools/pixel/generar.py',
        'alto': alto,
        'variants': vs,
    }
    if extra:
        js.update(extra)
    return sheet, js


def _fuente(tam: int = 12):
    for f in ('C:/Windows/Fonts/consola.ttf', 'C:/Windows/Fonts/arial.ttf'):
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, tam)
            except Exception:
                pass
    return ImageFont.load_default()


def hoja_revision(pid: str, cuadros: Dict[str, List[np.ndarray]], anims: Dict[str, Anim], escala: int = 4,
                  pivote: Optional[Tuple[int, int]] = None) -> Image.Image:
    """Todas las animaciones en filas (con nombre, cuadros, fps), ampliadas ×escala sobre gris oscuro con la
    línea del suelo marcada."""
    fh, fw = next(iter(cuadros.values()))[0].shape[:2]
    maxn = max(len(v) for v in cuadros.values())
    lab = 120
    W = lab + maxn * (fw * escala + 6) + 10
    H = len(cuadros) * (fh * escala + 8) + 10
    img = Image.new('RGBA', (W, H), (46, 44, 52, 255))
    d = ImageDraw.Draw(img)
    f = _fuente(14)
    y = 6
    for motion, lista in cuadros.items():
        a = anims[motion]
        d.text((8, y + 8), motion, fill=(235, 225, 200, 255), font=f)
        d.text((8, y + 28), f'{len(lista)} cuadros', fill=(160, 155, 150, 255), font=_fuente(11))
        d.text((8, y + 44), f'{a.fps:g} fps {"bucle" if a.loop else "1 vez"}', fill=(160, 155, 150, 255), font=_fuente(11))
        x = lab
        for im in lista:
            cel = Image.new('RGBA', (fw, fh), (62, 60, 70, 255))
            cel.alpha_composite(Image.fromarray(im))
            cel = cel.resize((fw * escala, fh * escala), Image.NEAREST)
            img.paste(cel, (x, y))
            if pivote:
                gy = y + (pivote[1] + 1) * escala
                d.line([(x, gy), (x + fw * escala - 1, gy)], fill=(90, 140, 120, 255))
            x += fw * escala + 6
        y += fh * escala + 8
    return img


def sobre_fondo(fondo: Image.Image, figuras: Sequence[Tuple[np.ndarray, int, int]], escala: int = 3,
                recorte: Optional[Tuple[int, int, int, int]] = None) -> Image.Image:
    """Compone cuadros sobre un fondo del juego a 1:1 (x, y = posición del pivote del cuadro: esquina sup. izq.)
    y devuelve el recorte ampliado ×escala (vecino más cercano)."""
    base = fondo.convert('RGBA').copy()
    for im, x, y in figuras:
        base.alpha_composite(Image.fromarray(im), (x, y))
    if recorte:
        base = base.crop(recorte)
    return base.resize((base.width * escala, base.height * escala), Image.NEAREST)
