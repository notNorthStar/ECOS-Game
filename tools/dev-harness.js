// Ayudas de prueba para la consola del navegador (solo desarrollo, no entra al build):
//   await import('/tools/dev-harness.js')
// Simula teclas con keyCode (Phaser lo necesita) y lee el estado del juego.
const g = window;
g.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
g.lvl = () => g.game.scene.getScene('Level');
const kc = (code) =>
  code.startsWith('Key') ? code.charCodeAt(3) : code.startsWith('Digit') ? 48 + +code[5]
    : ({ Space: 32, Enter: 13, Escape: 27, Tab: 9, ShiftLeft: 16, AltLeft: 18 }[code] || 0);
const mk = (type, code) => {
  const key = code === 'Space' ? ' ' : code.replace('Key', '').replace('Digit', '').toLowerCase();
  const e = new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => kc(code) });
  Object.defineProperty(e, 'which', { get: () => kc(code) });
  return e;
};
g.down = (c) => window.dispatchEvent(mk('keydown', c));
g.up = (c) => window.dispatchEvent(mk('keyup', c));
g.press = async (c, ms = 60) => { g.down(c); await g.sleep(ms); g.up(c); await g.sleep(40); };
g.hold = async (c, ms) => { g.down(c); await g.sleep(ms); g.up(c); await g.sleep(30); };
g.st = () => {
  const s = g.lvl(); const p = s.world && s.world.player; const GS = g.ecos.GameState;
  return JSON.stringify({
    sec: GS.section, x: p && Math.round(p.x), y: p && Math.round(p.y), hp: GS.hp, ecos: GS.ecos,
    laser: GS.hasLaser, spells: GS.learnedSpells, locked: p && p.controlsLocked,
    scenes: g.game.scene.getScenes(true).map((s) => s.sys.settings.key),
    flags: Object.keys(GS.flags).join(','), en: s.world ? s.world.enemies.length : -1,
  });
};
g.walkTo = async (tx, ty, tries = 120) => {
  for (let i = 0; i < tries; i++) {
    const p = g.lvl().world.player; const dx = tx - p.x, dy = ty - p.y;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 6) return true;
    if (Math.abs(dx) >= 8) g.down(dx > 0 ? 'KeyD' : 'KeyA');
    if (Math.abs(dy) >= 6) g.down(dy > 0 ? 'KeyS' : 'KeyW');
    await g.sleep(90);
    ['KeyD', 'KeyA', 'KeyW', 'KeyS'].forEach(g.up);
  }
  return false;
};
g.skipDlg = async (n = 40) => {
  await g.sleep(300);
  for (let i = 0; i < n; i++) {
    if (!g.game.scene.isActive('Dialogue')) { await g.sleep(400); if (!g.game.scene.isActive('Dialogue')) break; }
    await g.press('KeyE'); await g.sleep(120);
  }
};
export {};
