// A passing altered state for the whole picture: the colours drift around the wheel and the image
// breathes, the way some games show their character drunk. Each puff adds to it; it wears off by itself.
// It runs on its own clock, so it carries across scenes and always ends.

const MAX_LEVEL = 3;
/** Seconds for one puff's worth of haze to wear off. */
const WEAR_OFF_SECONDS = 14;
/** Seconds for a new puff to come on, so the picture never jumps. */
const ONSET_SECONDS = 2.5;

class Haze {
  private target = 0;
  private level = 0;
  private time = 0;
  private last = 0;
  private running = false;

  /** 0 when sober, up to MAX_LEVEL. */
  get strength(): number {
    return this.level;
  }

  puff(): void {
    this.target = Math.min(MAX_LEVEL, this.target + 1);
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((now) => this.tick(now));
  }

  /** Lets what is left wear off at once, at the speed it came on, instead of lingering. */
  settle(): void {
    this.target = 0;
  }

  private tick(now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.target = Math.max(0, this.target - dt / WEAR_OFF_SECONDS);
    const step = dt / ONSET_SECONDS;
    this.level = this.level < this.target ? Math.min(this.target, this.level + step) : Math.max(this.target, this.level - step);
    this.apply();
    if (this.level > 0 || this.target > 0) requestAnimationFrame((next) => this.tick(next));
    else this.running = false;
  }

  private apply(): void {
    const stage = document.getElementById('stage');
    const canvas = document.getElementById('game');
    if (!stage || !canvas) return;
    const l = this.level;
    if (l <= 0) {
      stage.style.filter = '';
      canvas.style.transform = '';
      return;
    }
    const t = this.time;
    // Two slow, unrelated swings: the hue wanders instead of cycling.
    const hue = (Math.sin(t * 0.45) * 55 + Math.sin(t * 0.19 + 1.3) * 45) * l;
    stage.style.filter = `hue-rotate(${hue.toFixed(1)}deg) saturate(${(1 + 0.3 * l).toFixed(2)}) contrast(${(1 + 0.03 * l).toFixed(2)})`;
    // The sway is skipped for players who asked their system for less motion; the colours remain.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const scale = 1 + 0.012 * l + 0.006 * l * Math.sin(t * 0.8);
    const turn = Math.sin(t * 0.55) * 0.35 * l;
    const skew = Math.sin(t * 0.37 + 0.7) * 0.25 * l;
    canvas.style.transform = `scale(${scale.toFixed(4)}) rotate(${turn.toFixed(3)}deg) skewX(${skew.toFixed(3)}deg)`;
  }
}

export const haze = new Haze();
