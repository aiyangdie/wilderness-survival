import { Game } from './game.js';

const canvas = document.getElementById('game-canvas');
const uiRefs = {
  health: document.getElementById('stat-health'),
  hunger: document.getElementById('stat-hunger'),
  thirst: document.getElementById('stat-thirst'),
  stamina: document.getElementById('stat-stamina'),
  day: document.getElementById('stat-day'),
  time: document.getElementById('stat-time'),
  score: document.getElementById('stat-score'),
  hotbar: document.getElementById('hotbar'),
  actionHint: document.getElementById('action-hint'),
  craftList: document.getElementById('craft-list'),
  buildList: document.getElementById('build-list'),
  inventoryGrid: document.getElementById('inventory-grid'),
  toast: document.getElementById('toast'),
  dialogs: {
    craft: document.getElementById('dialog-craft'),
    build: document.getElementById('dialog-build'),
    inventory: document.getElementById('dialog-inventory'),
  },
};

const overlays = {
  start: document.getElementById('overlay-start'),
  dead: document.getElementById('overlay-dead'),
};

const game = new Game(canvas, uiRefs, overlays);

document.getElementById('btn-start').addEventListener('click', () => game.start());
document.getElementById('btn-restart').addEventListener('click', () => game.start());
