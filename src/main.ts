import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config/game';
import { installInputGuards } from './config/controls';
import { installAudio } from './systems/Audio';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { LevelScene } from './scenes/LevelScene';
import { HudScene } from './scenes/HudScene';
import { SpellScene } from './scenes/SpellScene';
import { DiarioScene } from './scenes/DiarioScene';
import { PauseScene } from './scenes/PauseScene';
import { AltarScene } from './scenes/AltarScene';
import { DialogueScene } from './scenes/DialogueScene';
import { EndingScene } from './scenes/EndingScene';

// Dueño: integración. Orden de escenas: las superpuestas (Hud, Spell, Dialogue, Altar, Diario, Pause) van después de Level.
const parent = document.getElementById('game')!;

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#07060d',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { keyboard: true, mouse: { preventDefaultWheel: true } },
  disableContextMenu: true,
  scene: [
    BootScene,
    TitleScene,
    LevelScene,
    HudScene,
    SpellScene,
    DialogueScene,
    AltarScene,
    DiarioScene,
    PauseScene,
    EndingScene,
  ],
});

installInputGuards(parent);
installAudio(game);

// Acceso desde la consola para depurar.
(window as unknown as { game: Phaser.Game }).game = game;
