import { chooseCrossing, HERD_WAIT_HOURS, type CrossingRoute } from '../core/crossing';
import { DAY_HOURS } from '../core/data/locations';
import type { LocationId } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt, hours } from '../engine/i18n';
import { hush } from '../engine/voice';
import { applyDayGrade, calmMotion } from '../render/lighting';
import { drawPlate } from './common';
import { goLocation, goMap } from './flow';

const FRAME = { x: 0, y: 0, w: STAGE_W, h: STAGE_H };
const FOOTFALLS = [0.65, 1.32, 2.04, 2.83];
const CHOICES_AT = 3.75;
const HERD = [
  { start: 1.5, seconds: 2.17, height: 148, farSide: 0 },
  { start: 2.62, seconds: 2.84, height: 105, farSide: 31 },
  { start: 3.35, seconds: 3.1, height: 88, farSide: 48 },
] as const;
const GAIT = ['_p', '_a', '_b', ''] as const;

export class CrossingScene implements Scene {
  private readonly card = el('section', { class: 'crossing-card' });
  private readonly still = calmMotion();
  private time = 0;
  private footfall = 0;
  private leaving = false;

  constructor(private readonly app: App, private readonly planned: LocationId) {}

  enter(): void {
    hush();
    audio.setAmbience('day');
    audio.setMusic('none');
    const { crossing: s, location } = S();
    const wait = el('button', { class: 'btn btn-primary', data: { route: 'wait' }, onClick: () => this.choose('wait') }, [
      s.wait, el('small', { text: fmt(s.waitNote, { place: location[this.planned].name, h: hours(HERD_WAIT_HOURS) }) }),
    ]);
    const bypass = el('button', { class: 'btn', data: { route: 'garage' }, onClick: () => this.choose('garage') }, [
      s.detour, el('small', { text: s.detourNote }),
    ]);
    this.card.append(
      el('h1', { text: s.title }),
      el('p', { text: s.herd }),
      el('div', { class: 'crossing-routes' }, [wait, bypass]),
      el('button', { class: 'crossing-back', text: s.back, onClick: () => this.back() }),
    );
    this.card.hidden = true;
    this.app.ui.append(this.card);
    if (this.still) this.reveal();
  }

  update(dt: number): void {
    if (this.leaving) return;
    this.time += dt;
    const beat = FOOTFALLS[this.footfall];
    if (beat !== undefined && this.time >= beat) {
      audio.play('thud', 0.21 + this.footfall * 0.11, 0.64);
      this.footfall++;
    }
    if (this.time >= CHOICES_AT && this.card.hidden) this.reveal();
  }

  private reveal(): void {
    this.card.hidden = false;
    this.card.querySelector('button')?.focus();
  }

  private choose(route: CrossingRoute): void {
    if (this.leaving) return;
    const state = this.app.state;
    const trip = state && chooseCrossing(state, this.planned, route);
    if (!trip) {
      this.back();
      return;
    }
    this.leaving = true;
    this.app.state = trip.state;
    this.app.save();
    goLocation(this.app, trip.id, trip.meeting);
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    goMap(this.app);
  }

  onKeyDown(code: string, event: KeyboardEvent): void {
    if (code === 'Escape') this.back();
    if (code === 'Space' && this.card.hidden) {
      event.preventDefault();
      this.reveal();
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    drawPlate(ctx, 'plate_crossing');
    this.drawHerd(ctx);
    if (!this.still) this.drawCoffee(ctx);
    const daylight = this.app.state?.hoursLeft ?? DAY_HOURS;
    applyDayGrade(ctx, FRAME, 1 - daylight / DAY_HOURS);
  }

  private drawHerd(ctx: CanvasRenderingContext2D): void {
    for (const [index, deer] of HERD.entries()) {
      const age = this.time - deer.start;
      const advance = this.still ? 0.21 + (2 - index) * 0.21 : age / deer.seconds;
      if (advance <= 0 || advance >= 1) continue;
      const pose = this.still ? '' : GAIT[Math.floor(age * 7) % GAIT.length];
      const art = sprite(`en_deer_front${pose}`) ?? sprite('en_deer_front');
      if (!art) continue;
      const x = 45 + advance * 1210;
      const y = 492 - advance * 32 - deer.farSide;
      const h = deer.height;
      const w = h * art.w / art.h;
      const lift = this.still ? 0 : Math.max(0, Math.sin(age * 13)) * (index === 0 ? 11 : 6);
      ctx.save();
      ctx.globalAlpha = Math.min(1, advance * 9, (1 - advance) * 9);
      ctx.fillStyle = '#291e1960';
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.44, h * 0.085, -0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(x, y - lift);
      ctx.filter = 'brightness(0.86) saturate(0.81)';
      ctx.drawImage(art.img, -w / 2, -h, w, h);
      ctx.restore();
    }
  }

  private drawCoffee(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#ffe0a9';
    for (const foot of FOOTFALLS) {
      const age = this.time - foot;
      if (age < 0 || age >= 0.52) continue;
      const power = age / 0.52;
      ctx.globalAlpha = (1 - power) * 0.8;
      ctx.beginPath();
      ctx.ellipse(198, 579, 7 + power * 49, 2 + power * 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
