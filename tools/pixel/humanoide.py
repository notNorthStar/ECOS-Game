"""
Esqueleto 2D de perfil para personajes con cuerpo humanoide (protagonista, madre, chaneques…).

Un personaje concreto hereda de `Humanoide` y define:
  * medidas (largo de muslo, pierna, pie, brazo, antebrazo) y cuadro (`fw`, `fh`, `pivote`);
  * `paleta` (materiales);
  * `torso_mapa(pose)` y `cabeza_mapa(pose)`: dibujos a mano con anclas
        torso: 'o' = cadera (articulación), 'cuello', 'hombro_c', 'hombro_l' (+ las que quiera: 'bolsa', 'gema'…)
        cabeza: 'cuello' = donde se apoya sobre el torso;
  * `pierna(capa, pts, lado, pose)` y `brazo(capa, pts, lado, pose)`: cómo se pintan los miembros;
  * opcional: `parte_<nombre>(ctx, pose)` para capas extra (bolsa, arma, efectos) y `orden(pose)`.

`cuadro(pose)` calcula la cinemática directa, pinta cada parte en su capa, las pega en orden de profundidad
(las del lado lejano un tono más oscuras), pone el contorno exterior, limpia y alinea los pies al pivote.
"""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

import numpy as np

from lib import (Capa, Estampado, Lienzo, Mapa, Paleta, Pose, alinear_pies, fk_brazo, fk_pierna, inclinar,
                 mat_rot, previo)


class Humanoide:
    id = 'humanoide'
    tipo = 'humanoide'
    fw, fh = 80, 80
    pivote = (40, 78)
    alto = 72
    # medidas del esqueleto (px)
    L_muslo, L_pierna, L_pie, alto_tobillo = 16, 15, 9, 3
    L_brazo, L_ante = 12, 11
    # separación horizontal de las caderas (cercana, lejana)
    sep_cadera = (1.0, -1.0)
    # inclinación del torso hasta la que se usa cizalla (conserva los grupos de píxeles); más allá, rotación.
    # Un torso dibujado por código (sin mapa) puede poner 0: siempre rota.
    torso_cizalla_max = 22.0
    paleta: Paleta

    # ---------------------------------------------------------------------------------------
    def cadera_alto(self) -> float:
        return self.L_muslo + self.L_pierna + self.alto_tobillo

    def ctx(self, pose: Pose) -> Dict[str, object]:
        """Cinemática directa: todos los puntos del esqueleto en coordenadas del mundo (pivote = (0,0))."""
        cad = (pose.dx, -self.cadera_alto() + pose.dy)
        R = mat_rot(pose.giro)

        def T(p):
            v = R @ np.array([p[0] - cad[0], p[1] - cad[1]])
            return cad[0] + v[0], cad[1] + v[1]

        c: Dict[str, object] = {'cadera': cad, 'R': R, 'T': T}
        for lado, sep in (('c', self.sep_cadera[0]), ('l', self.sep_cadera[1])):
            # se calcula sin el giro del cuerpo y luego se rota todo alrededor de la cadera
            pts = fk_pierna((cad[0] + sep, cad[1]), getattr(pose, 'muslo_' + lado),
                            getattr(pose, 'rodilla_' + lado), getattr(pose, 'pie_' + lado),
                            self.L_muslo, self.L_pierna, self.L_pie, self.alto_tobillo)
            pts = {k: T(v) for k, v in pts.items()}
            # ángulos en el mundo (dir_ang: + = antihorario; el giro es horario)
            pts['ang_muslo'] = getattr(pose, 'muslo_' + lado) - pose.giro
            pts['ang_pierna'] = getattr(pose, 'muslo_' + lado) - getattr(pose, 'rodilla_' + lado) - pose.giro
            pts['ang_pie'] = getattr(pose, 'pie_' + lado) - pose.giro
            c['pierna_' + lado] = pts
        Mt = R @ inclinar(pose.tronco, umbral=self.torso_cizalla_max)
        cad_t = T((cad[0], cad[1] + pose.hunde)) if pose.hunde else cad
        c['cadera_torso'] = cad_t
        tor = previo(self.torso_mapa(pose), cad_t, Mt, 'o')
        c['M_torso'] = Mt
        c['torso'] = tor
        c['cuello'] = tor.punto('cuello')
        for lado in ('c', 'l'):
            h = tor.punto('hombro_' + lado)
            # el brazo es relativo al torso: si el torso se inclina (horario), el brazo lo acompaña
            ang = getattr(pose, 'hombro_' + lado) - pose.tronco - pose.giro
            c['brazo_' + lado] = fk_brazo(h, ang, getattr(pose, 'codo_' + lado), self.L_brazo, self.L_ante)
        c['M_cabeza'] = R @ inclinar(pose.cabeza, umbral=14)
        return c

    # ---------------------------------------------------------------------------------------
    def orden(self, pose: Pose) -> List[str]:
        o = ['brazo_l', 'pierna_l', 'pierna_c', 'torso', 'cabeza', 'brazo_c']
        if pose.brazo_l_delante:
            o.remove('brazo_l')
            o.insert(o.index('brazo_c'), 'brazo_l')
        return o

    # Partes por defecto ------------------------------------------------------------------------
    def parte_pierna_l(self, lz, c, pose):
        p = lz.parte()
        self.pierna(p, c['pierna_l'], 'l', pose)
        return [(p, 'contorno', 1)]

    def parte_pierna_c(self, lz, c, pose):
        p = lz.parte()
        self.pierna(p, c['pierna_c'], 'c', pose)
        return [(p, 'contorno', 0, 1)]

    def parte_brazo_l(self, lz, c, pose):
        p = lz.parte()
        self.brazo(p, c['brazo_l'], 'l', pose)
        return [(p, 'contorno', 0 if pose.brazo_l_delante else 1)]

    def parte_brazo_c(self, lz, c, pose):
        p = lz.parte()
        self.brazo(p, c['brazo_c'], 'c', pose)
        return [(p, 'contorno', 0, 2)]

    def parte_torso(self, lz, c, pose):
        p = lz.parte()
        p.estampa(c['torso'].mapa, c['cadera_torso'], c['M_torso'], 'o')
        self.detalles_torso(p, c, pose)
        return [(p, 'contorno', 0)]

    def parte_cabeza(self, lz, c, pose):
        p = lz.parte()
        m = self.cabeza_mapa(pose)
        est = p.estampa(m, c['cuello'], c['M_cabeza'], 'cuello')
        c['cabeza'] = est
        return [(p, 'contorno', 0, 1)]

    def detalles_torso(self, p: Capa, c, pose):
        pass

    # A implementar por el personaje ------------------------------------------------------------
    def torso_mapa(self, pose: Pose) -> Mapa:
        raise NotImplementedError

    def cabeza_mapa(self, pose: Pose) -> Mapa:
        raise NotImplementedError

    def pierna(self, capa: Capa, pts, lado: str, pose: Pose):
        raise NotImplementedError

    def brazo(self, capa: Capa, pts, lado: str, pose: Pose):
        raise NotImplementedError

    # ---------------------------------------------------------------------------------------
    def cuadro(self, pose: Pose, depurar: bool = False) -> np.ndarray:
        """Dibuja un cuadro (RGBA fw×fh) con los pies en el pivote."""
        W, H = self.fw * 2, self.fh * 2
        ox, oy = W // 2, int(H * 0.72)
        lz = Lienzo(W, H, ox, oy, self.paleta)
        c = self.ctx(pose)
        for nombre in self.orden(pose):
            fn = getattr(self, 'parte_' + nombre, None)
            if fn is None:
                continue
            res = fn(lz, c, pose)
            # cada capa: (capa, línea, oscurecer[, sombra proyectada en px])
            for item in (res or []):
                capa, linea, oscuro = item[:3]
                lz.pegar(capa, linea=linea, oscuro=oscuro, proyecta=item[3] if len(item) > 3 else 0)
        self.retoques(lz, c, pose)
        lz.contorno_exterior()
        lz.limpiar()
        img = lz.rgba()
        fx = lz.fx.copy()
        # alinear: fila más baja sólida → pivote (o 'alzar' px por encima)
        alzar = int(pose.extra.get('alzar', 0))
        solido = (img[..., 3] > 0) & ~fx
        ys = np.nonzero(solido.any(axis=1))[0]
        yb = ys.max() if len(ys) else oy
        y0 = yb - self.pivote[1] + alzar
        x0 = ox - self.pivote[0]
        out = np.zeros((self.fh, self.fw, 4), np.uint8)
        sy0, sy1 = max(0, y0), min(H, y0 + self.fh)
        sx0, sx1 = max(0, x0), min(W, x0 + self.fw)
        out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = img[sy0:sy1, sx0:sx1]
        perdido = int((img[..., 3] > 0).sum()) - int((out[..., 3] > 0).sum())
        if perdido > 0:
            print(f'  AVISO {self.id}: {perdido} px quedan fuera del cuadro ({pose.cara}, giro={pose.giro})')
        return out

    def retoques(self, lz: Lienzo, c, pose: Pose):
        """Último paso antes del contorno (efectos, brillos)."""
        pass
