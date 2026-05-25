export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false, justDown: false };
    this.justPressed = new Set();
    this.blocked = false;

    window.addEventListener('keydown', (e) => {
      if (this.blocked && !['Escape'].includes(e.key)) return;
      if (['Tab', ' '].includes(e.key)) e.preventDefault();
      if (!this.keys.has(e.key)) this.justPressed.add(e.key);
      this.keys.add(e.key);
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key);
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouse.x = (e.clientX - rect.left) * scaleX;
      this.mouse.y = (e.clientY - rect.top) * scaleY;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.mouse.justDown = true;
      }
    });

    window.addEventListener('mouseup', () => {
      this.mouse.down = false;
    });
  }

  isDown(key) {
    return this.keys.has(key);
  }

  wasPressed(key) {
    return this.justPressed.has(key);
  }

  getMovement() {
    let x = 0;
    let y = 0;
    if (this.isDown('w') || this.isDown('W') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('s') || this.isDown('S') || this.isDown('ArrowDown')) y += 1;
    if (this.isDown('a') || this.isDown('A') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('d') || this.isDown('D') || this.isDown('ArrowRight')) x += 1;
    if (x !== 0 || y !== 0) {
      const len = Math.hypot(x, y);
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  endFrame() {
    this.justPressed.clear();
    this.mouse.justDown = false;
  }

  setBlocked(v) {
    this.blocked = v;
  }
}
