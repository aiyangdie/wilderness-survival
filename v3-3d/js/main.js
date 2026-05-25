import { Game3D } from './game.js';
import { preloadCharacter } from './human.js';

const game = new Game3D();

// 页面打开即预加载角色，减少开局等待和卡顿
preloadCharacter().catch(() => {});
