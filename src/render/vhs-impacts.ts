/** Short, screen-space bursts at the painted target and its projected road contact. */
export type VhsImpactKind = 'runner' | 'brute' | 'mail' | 'cart' | 'miss';
type Material = 'blood' | 'fabric' | 'paper' | 'metal' | 'gravel';
const colors: Record<Material, readonly [string, string, string]> = {
  blood: ['#331b20', '#843a37', '#cf7760'],
  fabric: ['#272538', '#626554', '#b1b28a'],
  paper: ['#574739', '#c4a56e', '#ffdf9b'],
  metal: ['#343640', '#83959a', '#ffdfa0'],
  gravel: ['#3c3441', '#85756e', '#c0a394'],
};

function fragment() {
  return { active: false, material: 'gravel' as Material, x: 0, y: 0, floor: 0,
    vx: 0, vy: 0, gravity: 0, size: 0, twist: 0, age: 0, life: 0, settled: false, still: false };
}

export class VhsImpacts {
  private readonly bits = Array.from({ length: 160 }, fragment);
  private cursor = 0;
  private seed = 11973;

  clear() {
    for (const p of this.bits) p.active = false;
  }

  private noise() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  trigger(kind: VhsImpactKind, x: number, hitY: number, groundY: number, depth: number, reducedMotion: boolean, lethal = true) {
    const scale = .4 + .95 * Math.max(0, Math.min(1, depth));
    const count = reducedMotion ? 5 : kind === 'brute' && lethal ? 18 : kind === 'miss' || !lethal ? 7 : 12;
    for (let i = 0; i < count; i++) {
      const p = this.bits[this.cursor]!;
      this.cursor = (this.cursor + 1) % this.bits.length;
      const side = (i % 2 ? -1 : 1) * (.17 + this.noise() * .83);
      const material: Material = kind === 'miss' ? 'gravel' : kind === 'cart' ? 'metal'
        : kind === 'mail' && i % 3 !== 2 ? 'paper' : kind === 'brute' && i % 3 !== 1 ? 'fabric' : 'blood';
      p.active = true;
      p.material = material;
      p.still = reducedMotion;
      p.settled = false;
      p.age = 0;
      p.size = Math.max(1.1, (1.8 + this.noise() * 3.2) * scale);
      p.twist = this.noise() * Math.PI * 2;
      p.floor = groundY + (this.noise() - .36) * 8 * scale;
      p.x = x + side * (reducedMotion ? 8 : 3) * scale;
      p.y = hitY - this.noise() * (reducedMotion ? 9 : 4) * scale;
      p.vx = side * (25 + this.noise() * (material === 'metal' ? 152 : 91)) * scale;
      p.vy = -(20 + this.noise() * (kind === 'miss' ? 48 : 95)) * scale;
      p.gravity = (material === 'paper' ? 270 : 465) * scale;
      p.life = reducedMotion ? .28 : (material === 'paper' ? 1.6 : 1.14) + this.noise() * .22;
    }
  }

  update(dt: number) {
    for (const p of this.bits) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) { p.active = false; continue; }
      if (p.still || p.settled) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt + .5 * p.gravity * dt * dt;
      p.vy += p.gravity * dt;
      if (p.material === 'paper') p.x += Math.sin(p.age * 11 + p.twist) * 18 * dt;
      if (p.y >= p.floor && p.vy > 0) {
        p.y = p.floor;
        p.settled = true;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.bits) {
      if (!p.active) continue;
      const x = Math.round(p.x), y = Math.round(p.y);
      const s = Math.ceil(p.size), ink = colors[p.material];
      ctx.globalAlpha = Math.min(1, (p.life - p.age) / (p.still ? .12 : .28));
      ctx.fillStyle = ink[0];
      if (p.settled) {
        // The road foreshortens a stain or a scrap, but its contour survives the fall.
        const stain = p.material === 'blood';
        const width = s * (stain ? 1.42 : .86);
        ctx.globalAlpha *= stain ? .76 : .90;
        ctx.beginPath();
        ctx.ellipse(x, y, width, Math.max(.6, s * .34), .16 * Math.sin(p.twist), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ink[1];
        ctx.beginPath();
        ctx.ellipse(x + .6, y - .5, width * .68, Math.max(.5, s * .22), -.12, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.material === 'metal') {
        // A stepped streak with a hot leading chip reads against both dark road and armor.
        const dx = p.vx > 0 ? 1 : -1, dy = p.vy > 0 ? 1 : -1;
        ctx.fillRect(x - dx * s, y - dy * s, s + 1, s);
        ctx.fillStyle = ink[1];
        ctx.fillRect(x - dx * 2, y - dy, s, 2);
        ctx.fillStyle = ink[2];
        ctx.fillRect(x, y, s, 2);
      } else if (p.material === 'paper') {
        const flutter = p.still ? 0 : p.age * 13;
        const height = Math.max(2, Math.round(s * (1 + Math.sin(flutter + p.twist))));
        ctx.fillRect(x - 1, y, 2 * s + 1, height + 1);
        ctx.fillStyle = ink[2];
        ctx.fillRect(x, y, 2 * s, height);
        ctx.fillStyle = ink[1];
        ctx.fillRect(x + s, y, s, 1);
      } else {
        ctx.fillRect(x - 1, y, s + 2, s);
        ctx.fillStyle = ink[1];
        ctx.fillRect(x, y - 1, s, s);
        ctx.fillStyle = ink[2];
        ctx.fillRect(x, y - 1, Math.max(1, s - 2), 1);
      }
    }
    ctx.restore();
  }
}
