"""
Genera los kits de personajes dibujados por código (pixel art 1:1).

  C:\\Python\\python.exe -I tools/pixel/generar.py [ids…] [--sin-kit] [--solo motion,motion]

  ids        personajes a generar (por defecto: todos los de tools/pixel/personajes/)
  --sin-kit  no escribe en public/ (solo hojas de revisión, para iterar)
  --solo     limita las animaciones (iterar más rápido)

Salidas:
  public/assets/sprites/personajes/<id>/<id>_spritesheet.png + .json   (formato de src/systems/CharacterKits.ts)
  arte-fuente/pixel/revision/<id>.png          todas las animaciones ×4, una fila por animación
  arte-fuente/pixel/revision/<id>_fondo.png    el personaje sobre un fondo del juego a 1:1 y ×3
Antes de sobrescribir un kit que no generó este script, lo respalda en arte-fuente/kits-codex/<id>/
(si el respaldo ya existe, no lo pisa).

Contrato de un módulo tools/pixel/personajes/<id>.py
  PERSONAJE          rig con .cuadro(pose), .fw, .fh, .pivote, .tipo, .alto
  animaciones()      {motion: Anim}
  FONDO              (opcional) (nivel, sección, y del suelo) para la hoja <id>_fondo.png (FONDOS manda)
  VARIANTES_KIT      (opcional) versiones del personaje en la misma hoja ('variants' + 'cuadrosPorVariante').
                     La primera es la que dibuja PERSONAJE.cuadro(pose) tal cual; las demás se piden a
  cuadro_variante(v, pose) -> cuadro
  revision_variantes(pid, por_var, anims, pivote, carpeta)   (opcional) hojas de revisión extra por variante
Los tres lotes con variantes (_espectros, _humanoides, _criaturas) exponen `kit_variantes(...)`, que devuelve
(VARIANTES_KIT, cuadro_variante, revision_variantes) para su tipo de rig.
"""
from __future__ import annotations

import importlib
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
ROOT = os.path.dirname(os.path.dirname(AQUI))

from lib import contar_colores, empaquetar, empaquetar_variantes, hoja_revision, sobre_fondo, _fuente  # noqa: E402

KITS = os.path.join(ROOT, 'public', 'assets', 'sprites', 'personajes')
REV = os.path.join(ROOT, 'arte-fuente', 'pixel', 'revision')
RESPALDO = os.path.join(ROOT, 'arte-fuente', 'kits-codex')
GEN = 'tools/pixel/generar.py'

# Fondo de comparación por personaje: (nivel, sección, y del suelo donde pararlo)
FONDOS = {
    'protagonista': ('nivel-01-xalapa', 'calles', 300),
    'madre': ('nivel-10-guadalajara', 'catedral_eclipse', 300),
    'chaneque_mayor': ('nivel-01-xalapa', 'jefe', 310),
}


def fondo(nivel: str, seccion: str, x0: int = 0) -> Image.Image:
    base = Image.new('RGBA', (640, 360), (0, 0, 0, 255))
    for i in range(6):
        f = os.path.join(ROOT, 'public', 'assets', 'escenarios', nivel, 'fondos', f'fondo_{seccion}_capa{i}.png')
        if os.path.exists(f):
            capa = Image.open(f).convert('RGBA')
            base.alpha_composite(capa.crop((x0, 0, x0 + 640, 360)))
    return base


def respaldar(pid: str):
    d = os.path.join(KITS, pid)
    j = os.path.join(d, f'{pid}_spritesheet.json')
    if not os.path.isdir(d) or not os.listdir(d):
        return
    try:
        with open(j, encoding='utf-8') as f:
            if json.load(f).get('generadoPor') == GEN:
                return  # ya es nuestro
    except Exception:
        pass
    dst = os.path.join(RESPALDO, pid)
    if os.path.exists(dst):
        print(f'  respaldo ya existe: {os.path.relpath(dst, ROOT)} (no se pisa)')
        return
    shutil.copytree(d, dst)
    print(f'  respaldo del kit anterior → {os.path.relpath(dst, ROOT)}')


def generar(pid: str, escribir_kit: bool = True, solo=None):
    mod = importlib.import_module(f'personajes.{pid}')
    P = mod.PERSONAJE
    anims = mod.animaciones()
    if solo:
        anims = {k: v for k, v in anims.items() if k in solo}
    cuadros = {}
    for motion, a in anims.items():
        cuadros[motion] = [P.cuadro(pose) for pose in a.poses]
    variantes = list(getattr(mod, 'VARIANTES_KIT', None) or ())
    if variantes:
        por_var = {variantes[0]: cuadros}
        for v in variantes[1:]:
            por_var[v] = {m: [mod.cuadro_variante(v, pose) for pose in anims[m].poses] for m in cuadros}
        sheet, js = empaquetar_variantes(pid, por_var, anims, P.fw, P.fh, P.pivote, P.tipo, P.alto)
        for v in variantes:
            nc = contar_colores([im for lista in por_var[v].values() for im in lista])
            print(f'  variante {v}: {nc} colores' + ('  AVISO más de 32' if nc > 32 else ''))
        rev_var = getattr(mod, 'revision_variantes', None)
        if rev_var:
            os.makedirs(REV, exist_ok=True)
            rev_var(pid, por_var, anims, P.pivote, REV)
    else:
        sheet, js = empaquetar(pid, cuadros, anims, P.fw, P.fh, P.pivote, P.tipo, P.alto)
    ncol = contar_colores([sheet])
    total = sum(len(v) for v in cuadros.values())
    print(f'{pid}: {len(anims)} animaciones, {total} cuadros ({len(js["frames"])} únicos), {ncol} colores'
          + ('  AVISO más de 32' if ncol > 32 else ''))
    os.makedirs(REV, exist_ok=True)
    hoja_revision(pid, cuadros, anims, 4, P.pivote).save(os.path.join(REV, f'{pid}.png'))
    # sobre fondo
    niv, sec, gy = FONDOS.get(pid) or getattr(mod, 'FONDO', None) or ('nivel-01-xalapa', 'calles', 300)
    bg = fondo(niv, sec)
    muestras = []
    orden = [m for m in ('reposo', 'caminar', 'correr', 'disparar', 'conjuro', 'ataque', 'golpe', 'invocar') if m in cuadros]
    x = 60
    for m in orden[:5]:
        im = cuadros[m][min(1, len(cuadros[m]) - 1)]
        muestras.append((im, x - P.pivote[0], gy - P.pivote[1]))
        x += P.fw - 6
    ancho = min(640, x + 40)
    comp1 = sobre_fondo(bg, muestras, 1, (0, max(0, gy - 200), ancho, min(360, gy + 30)))
    comp3 = sobre_fondo(bg, muestras, 3, (20, gy - P.fh - 10, min(640, 20 + 300), gy + 14))
    W = max(comp1.width, comp3.width)
    out = Image.new('RGBA', (W, comp1.height + comp3.height + 8), (30, 30, 36, 255))
    out.paste(comp1, (0, 0))
    out.paste(comp3, (0, comp1.height + 8))
    out.save(os.path.join(REV, f'{pid}_fondo.png'))
    if escribir_kit:
        respaldar(pid)
        d = os.path.join(KITS, pid)
        os.makedirs(d, exist_ok=True)
        Image.fromarray(sheet).save(os.path.join(d, f'{pid}_spritesheet.png'), optimize=True)
        with open(os.path.join(d, f'{pid}_spritesheet.json'), 'w', encoding='utf-8', newline='\n') as f:
            json.dump(js, f, ensure_ascii=False, indent=1)
        print(f'  kit → {os.path.relpath(d, ROOT)}')
    return cuadros, anims


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    escribir = '--sin-kit' not in argv
    solo = None
    if '--solo' in argv:
        solo = set(argv[argv.index('--solo') + 1].split(','))
    ids = [a for i, a in enumerate(argv) if not a.startswith('--') and (i == 0 or argv[i - 1] != '--solo')]
    if not ids:
        ids = sorted(f[:-3] for f in os.listdir(os.path.join(AQUI, 'personajes'))
                     if f.endswith('.py') and not f.startswith('_'))
    for pid in ids:
        generar(pid, escribir, solo)


if __name__ == '__main__':
    main(sys.argv[1:])
