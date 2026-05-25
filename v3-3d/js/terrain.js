/** 与地形网格一致的高度采样（避免每帧 Raycaster） */
export function terrainHeight(x, z) {
  return (Math.sin(x * 0.08) + Math.cos(z * 0.07)) * 1.2;
}

export class HeightField {
  constructor(size, segments) {
    this.size = size;
    this.segments = segments;
    this.cell = size / segments;
    this.half = size / 2;
    this.heights = new Float32Array((segments + 1) * (segments + 1));

    for (let iz = 0; iz <= segments; iz++) {
      for (let ix = 0; ix <= segments; ix++) {
        const x = ix * this.cell - this.half;
        const z = iz * this.cell - this.half;
        this.heights[iz * (segments + 1) + ix] = terrainHeight(x, z);
      }
    }
  }

  sample(x, z) {
    const lx = x + this.half;
    const lz = z + this.half;
    if (lx < 0 || lz < 0 || lx >= this.size || lz >= this.size) {
      return terrainHeight(x, z);
    }

    const gx = lx / this.cell;
    const gz = lz / this.cell;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const s = this.segments + 1;

    const h00 = this.heights[iz * s + ix];
    const h10 = this.heights[iz * s + Math.min(ix + 1, this.segments)];
    const h01 = this.heights[Math.min(iz + 1, this.segments) * s + ix];
    const h11 = this.heights[Math.min(iz + 1, this.segments) * s + Math.min(ix + 1, this.segments)];

    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fz) + h1 * fz;
  }
}
