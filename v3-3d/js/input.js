/** 统一输入：按键边缘检测、暂停、灵敏度 */
export class GameInput {
  constructor(canvas, onPauseToggle) {
    this.canvas = canvas;
    this.onPauseToggle = onPauseToggle;
    this.keys = new Set();
    this.keysJust = new Set();
    this.mouseLocked = false;
    this.paused = false;
    this.enabled = false;

    this.sensX = parseFloat(localStorage.getItem('ws3-sensX') || '0.0022');
    this.sensY = parseFloat(localStorage.getItem('ws3-sensY') || '0.002');

    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    canvas.addEventListener('mousemove', (e) => {
      if (!this.mouseLocked || !this.enabled || this.paused) return;
      this.yawDelta = (this.yawDelta || 0) - e.movementX * this.sensX;
      this.pitchDelta = (this.pitchDelta || 0) - e.movementY * this.sensY;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.enabled) return;
      if (!this.mouseLocked) {
        if (!this.paused) canvas.requestPointerLock();
        return;
      }
      if (!this.paused) this.clickAttack = true;
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = document.pointerLockElement === canvas;
    });
  }

  _onKeyDown(e) {
    if (!this.keys.has(e.code)) this.keysJust.add(e.code);
    this.keys.add(e.code);

    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();

    if (e.code === 'Escape' && this.enabled) {
      e.preventDefault();
      this.onPauseToggle?.();
    }
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.keys.clear();
      this.keysJust.clear();
    }
  }

  setPaused(v) {
    this.paused = v;
    if (v) {
      this.keys.clear();
      if (this.mouseLocked) document.exitPointerLock();
    }
  }

  endFrame() {
    this.keysJust.clear();
    this.clickAttack = false;
    this.yawDelta = 0;
    this.pitchDelta = 0;
  }

  isDown(code) {
    return this.keys.has(code);
  }

  justPressed(code) {
    return this.keysJust.has(code);
  }

  wantsInteract() {
    return this.justPressed('KeyE') || this.justPressed('KeyF');
  }

  wantsSprint() {
    return (
      (this.isDown('ShiftLeft') || this.isDown('ShiftRight')) &&
      (this.isDown('KeyW') || this.isDown('KeyA') || this.isDown('KeyS') || this.isDown('KeyD'))
    );
  }

  getMoveVector(out) {
    out.set(0, 0, 0);
    if (this.isDown('KeyW')) out.z -= 1;
    if (this.isDown('KeyS')) out.z += 1;
    if (this.isDown('KeyA')) out.x -= 1;
    if (this.isDown('KeyD')) out.x += 1;
    if (out.lengthSq() > 0) out.normalize();
    return out.lengthSq() > 0;
  }

  saveSensitivity() {
    localStorage.setItem('ws3-sensX', String(this.sensX));
    localStorage.setItem('ws3-sensY', String(this.sensY));
  }
}
