import {
  catchesIgnition, finishCrossbowStop, ignitionNeedle, IGNITION_SECONDS, IGNITION_WINDOW, ROAD_BOLTS,
} from '../core/crossbow-road';
import { units } from '../core/encounters';
import { STAGE_H, STAGE_W, type App, type Pointer, type Scene } from '../engine/app';
import { sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, hours } from '../engine/i18n';
import { costLine, drawPlate } from './common';
import { goHomeStretch, goTitle } from './flow';
import { PauseMenu } from './pause';

type Beat = 'intro' | 'ignition' | 'reveal' | 'aim' | 'impact' | 'outro';
type Shot = 'hit' | 'miss' | 'late';
type Point = { x: number; y: number };

// Left hedge, right ditch, then the middle of the road. Positions are in stage pixels.
const APPROACH = [
  { from: 469, to: 369, foot: 543, sprite: 'en_shambler_front' },
  { from: 768, to: 918, foot: 549, sprite: 'en_runner_front' },
  { from: 627, to: 635, foot: 541, sprite: 'en_shambler_front' },
] as const;
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class CrossbowRoadScene implements Scene {
  private readonly hud = el('div', { class: 'road-hud' });
  private readonly card = el('section', { class: 'road-card' });
  private readonly overlay = el('div');
  private readonly pauseMenu = new PauseMenu(this.overlay, this.card);
  private readonly keys = new Set<string>();
  private readonly reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private beat: Beat = 'intro';
  private time = 0;
  private elapsed = 0;
  private assist = false;
  private paused = false;
  private leaving = false;
  private stalled = false;
  private hits = 0;
  private index = 0;
  private shot: Shot | null = null;
  private aim: Point | null = null;
  private target: { point: Point; height: number; foot: number } | null = null;
  private meter: HTMLElement | null = null;

  constructor(private readonly app: App, private readonly sub: string) {}

  enter(): void {
    const s = S().crossbowRoad;
    this.card.tabIndex = -1;
    this.hud.append(this.card, el('button', { class: 'road-pause', text: s.pause, onClick: () => this.togglePause() }));
    this.app.ui.append(this.hud, this.overlay);
    audio.fadeOut('engine', 0.3);
    audio.play('engine_stop');
    audio.setAmbience('night');
    audio.setMusic('none');
    this.card.replaceChildren(
      el('p', { class: 'road-kicker', text: s.kicker }),
      el('h1', { text: s.title }),
      el('p', { text: s.intro }),
      el('p', { class: 'road-note', text: s.controls }),
      el('div', { class: 'road-actions' }, [
        el('button', { class: 'btn btn-primary', text: s.start, onClick: () => this.start(false) }),
        el('button', { class: 'btn', text: s.assist, onClick: () => this.start(true) }),
      ]),
    );
    this.focus();
  }

  private focus(): void {
    (this.card.querySelector('button') ?? this.card).focus();
  }

  private enterBeat(beat: Beat, ...children: HTMLElement[]): void {
    this.beat = beat;
    this.time = 0;
    this.meter = null;
    this.card.dataset.beat = beat;
    this.card.replaceChildren(...children);
    this.focus();
  }

  private start(assist: boolean): void {
    if (this.beat !== 'intro' || this.paused) return;
    this.assist = assist;
    const s = S().crossbowRoad;
    const meter = el('div', { class: 'road-ignition' }, [
      el('span', { class: 'road-window', style: {
        left: `${IGNITION_WINDOW.from * 100}%`,
        width: `${(IGNITION_WINDOW.to - IGNITION_WINDOW.from) * 100}%`,
      } }),
      el('i'),
    ]);
    meter.setAttribute('aria-hidden', 'true');
    this.enterBeat('ignition',
      el('h2', { text: s.ignition }),
      el('p', { text: assist ? s.assistedIgnition : s.catch }),
      meter,
      el('button', { class: 'btn btn-primary', text: s.turn, onClick: () => this.ignite() }),
    );
    this.meter = meter;
    this.updateMeter(this.assist ? 0.775 : 0);
    audio.play('engine', 0.44, 0.82);
  }

  private ignite(): void {
    if (this.beat !== 'ignition' || this.paused) return;
    this.stalled = !this.assist && !catchesIgnition(this.time);
    const s = S().crossbowRoad;
    audio.fadeOut('engine', 0.22);
    audio.play(this.stalled ? 'engine_stop' : 'ready');
    audio.play('groan', 0.6);
    this.enterBeat('reveal', el('h2', { text: this.stalled ? s.stall : s.started }), el('p', { text: s.approach }));
  }

  private get aimSeconds(): number {
    return this.stalled ? 3.8 : 4.8;
  }

  private beginAim(): void {
    const s = S().crossbowRoad;
    this.shot = null;
    this.aim ??= { x: STAGE_W / 2, y: 405 };
    const meter = el('div', { class: 'road-time' }, [el('i')]);
    meter.setAttribute('aria-hidden', 'true');
    this.enterBeat('aim',
      el('h2', { text: fmt(s.bolts, { n: ROAD_BOLTS - this.index }) }),
      el('p', { text: s.aim }),
      meter,
    );
    this.meter = meter;
    this.updateMeter(1);
    this.placeTarget();
    audio.play('ready', 0.43);
  }

  private placeTarget(): void {
    const lane = APPROACH[this.index]!;
    const advance = this.assist ? 0.47 : clamp(this.time / this.aimSeconds, 0, 1);
    const sway = this.assist ? 0 : Math.sin(advance * 13 + this.index * 2) * 17;
    const height = lerp(106, 245, advance);
    const foot = lerp(420, lane.foot, advance);
    this.target = { point: { x: lerp(lane.from, lane.to, advance) + sway, y: foot - height * 0.71 }, height, foot };
  }

  private fire(point: Point): void {
    if (this.beat !== 'aim' || this.paused || !this.target) return;
    const { point: target, height } = this.target;
    const hit = Math.hypot(point.x - target.x, point.y - target.y) <= height * 0.21;
    this.aim = point;
    this.resolveShot(hit ? 'hit' : 'miss');
  }

  private resolveShot(shot: Shot): void {
    const s = S().crossbowRoad;
    this.shot = shot;
    if (shot !== 'late') audio.play('rabbit_bolt', 0.8, 0.78);
    if (shot === 'hit') {
      this.hits++;
      audio.play('hit', 0.7);
    } else {
      audio.play('groan', 0.85);
      audio.play('thud', 0.43);
    }
    this.enterBeat('impact', el('h2', { text: s[shot] }));
  }

  private showResult(): void {
    const state = this.app.state;
    const result = state && finishCrossbowStop(state, this.stalled, this.hits);
    if (!result) {
      console.warn('[road] could not settle the crossbow stop');
      this.leaving = true;
      goTitle(this.app);
      return;
    }
    this.app.state = result.state;
    this.app.save();
    audio.play('engine');
    audio.setAmbience('car');

    const s = S().crossbowRoad;
    const resultLine = el('p', { class: 'road-note' }, [
      fmt(s.tally, { n: this.hits, total: ROAD_BOLTS }),
      units(result.lost) ? el('span', {}, [' · ', s.lost, ' ', costLine(result.lost, undefined, '−')]) : null,
      result.hours > 0 ? ` · ${fmt(s.delay, { h: hours(result.hours) })}` : null,
    ]);
    this.enterBeat('outro',
      el('h2', { text: this.hits === ROAD_BOLTS ? s.clear : s.escape }),
      resultLine,
      el('button', { class: 'btn btn-primary', text: s.home, onClick: () => this.leave() }),
    );
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    goHomeStretch(this.app, this.sub);
  }

  private updateMeter(fraction: number): void {
    this.meter?.style.setProperty('--road-progress', String(clamp(fraction, 0, 1)));
  }

  update(dt: number): void {
    if (this.paused || this.leaving) return;
    this.elapsed += dt;
    this.time += dt;
    switch (this.beat) {
      case 'ignition':
        if (this.assist) break;
        this.updateMeter(ignitionNeedle(this.time));
        if (this.time >= IGNITION_SECONDS) this.ignite();
        break;
      case 'reveal':
        if (this.time >= 1.15) this.beginAim();
        break;
      case 'aim': {
        this.placeTarget();
        const movement = 520 * dt;
        if (this.aim && this.keys.size) {
          this.aim.x = clamp(this.aim.x + movement * (Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft'))), 110, 1170);
          this.aim.y = clamp(this.aim.y + movement * (Number(this.keys.has('ArrowDown')) - Number(this.keys.has('ArrowUp'))), 130, 550);
        }
        if (!this.assist) {
          this.updateMeter(1 - this.time / this.aimSeconds);
          if (this.time >= this.aimSeconds) this.resolveShot('late');
        }
        break;
      }
      case 'impact':
        if (this.time < 0.72) break;
        this.index++;
        if (this.index < ROAD_BOLTS) this.beginAim();
        else this.showResult();
        break;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const closing = this.beat === 'outro';
    const strike = this.beat === 'impact';
    const motion = this.reduced ? 0 : Math.min(this.elapsed, 3) * 0.007 + (closing ? Math.min(this.time, 2) * 0.042 : 0);
    drawPlate(ctx, 'plate_crossbow_road', { zoom: 1 + motion });

    if (this.beat === 'reveal' || this.beat === 'aim' || strike) this.drawInfected(ctx);
    if (!this.reduced) this.drawRain(ctx);
    if (this.beat === 'aim' && this.target) {
      this.drawReticle(ctx, this.target.point, this.target.height * 0.21, '#ffdb85');
      if (this.aim) this.drawReticle(ctx, this.aim, 9, '#eaf6ed');
    }
    if (strike && this.shot !== 'late' && this.aim && !this.reduced && this.time < 0.16) this.drawBolt(ctx, this.aim);
    if (strike && this.shot === 'hit' && this.target && this.time < 0.18) {
      this.drawReticle(ctx, this.target.point, 21 + this.time * 32, '#fef4d2');
    }
  }

  private drawBolt(ctx: CanvasRenderingContext2D, point: Point): void {
    const travel = Math.min(1, this.time / 0.11);
    const trail = Math.max(0, travel - 0.31);
    ctx.save();
    ctx.lineWidth = lerp(5, 1, travel);
    ctx.strokeStyle = '#ffe1a2';
    ctx.globalAlpha = 1 - this.time / 0.16;
    ctx.beginPath();
    ctx.moveTo(lerp(784, point.x, trail), lerp(640, point.y, trail));
    ctx.lineTo(lerp(784, point.x, travel), lerp(640, point.y, travel));
    ctx.stroke();
    ctx.restore();
  }

  private drawInfected(ctx: CanvasRenderingContext2D): void {
    const target = this.target ?? { point: { x: 490, y: 331 }, height: 84, foot: 394 };
    const lane = APPROACH[this.index]!;
    const fallen = this.beat === 'impact' && this.shot === 'hit';
    const pose = this.reduced ? '' : ['_a', '', '_b', ''][Math.floor(this.elapsed * 7) % 4];
    const art = sprite(lane.sprite + (fallen ? '_x' : pose)) ?? sprite(lane.sprite);
    if (!art) return;
    const scale = target.height / art.h;
    const width = art.w * scale;
    ctx.save();
    ctx.translate(target.point.x, target.foot);
    if (fallen && !this.reduced) ctx.rotate(Math.min(1, this.time * 2.9) * (this.index === 1 ? 1 : -1));
    const shadow = ctx.createRadialGradient(0, 0, 2, 0, 0, width * 0.57);
    shadow.addColorStop(0, '#070707bf');
    shadow.addColorStop(1, '#07070700');
    ctx.save();
    ctx.scale(1, 0.18);
    ctx.fillStyle = shadow;
    ctx.fillRect(-width, -width, width * 2, width * 2);
    ctx.restore();
    ctx.filter = 'brightness(0.78) saturate(0.78)';
    ctx.drawImage(art.img, -width * (art.footX ?? 0.5), -target.height, width, target.height);
    ctx.restore();
  }

  private drawRain(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = '#b0c4d52e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 38; i++) {
      const x = 52 + (i * 181 + this.elapsed * 47) % 1170;
      const y = 78 + (i * 107 + this.elapsed * (167 + i % 4 * 37)) % 454;
      ctx.moveTo(x, y);
      ctx.lineTo(x - 5, y + 20);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawReticle(ctx: CanvasRenderingContext2D, point: Point, radius: number, color: string): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  onPointerDown(pointer: Pointer, event: PointerEvent): void {
    if (event.button !== 0 || this.paused || this.beat !== 'aim') return;
    this.aim = { x: pointer.x, y: pointer.y };
    this.fire(this.aim);
  }

  onPointerMove(pointer: Pointer): void {
    if (pointer.overCanvas && this.beat === 'aim' && !this.paused) this.aim = { x: pointer.x, y: pointer.y };
  }

  onKeyDown(code: string, event: KeyboardEvent): void {
    if (code === 'Escape') {
      this.togglePause();
      return;
    }
    if (this.paused) return;
    if (this.beat === 'ignition' && code === 'Space') {
      event.preventDefault();
      this.ignite();
    } else if (this.beat === 'aim' && KEYS.includes(code)) {
      event.preventDefault();
      this.keys.add(code);
    } else if (this.beat === 'aim' && code === 'Space' && this.aim) {
      event.preventDefault();
      this.fire(this.aim);
    }
  }

  onKeyUp(code: string): void {
    this.keys.delete(code);
  }

  onBlur(): void {
    this.keys.clear();
    if (!this.paused && this.beat !== 'intro' && this.beat !== 'outro') this.togglePause(true);
  }

  private togglePause(auto = false): void {
    if (this.leaving) return;
    this.paused = !this.paused;
    this.keys.clear();
    if (this.paused) {
      this.pauseMenu.open(() => this.togglePause(), () => goTitle(this.app), auto);
    } else {
      this.pauseMenu.close();
    }
  }
}
