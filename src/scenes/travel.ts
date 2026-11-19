// A short beat in the old break between the refuge and the village, and back with the boot full.

import { HOUSE_MAX_HP } from '../core/data/devices';
import { DAY_HOURS } from '../core/data/locations';
import type { Cost, GameState } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S } from '../engine/i18n';
import { carDepartureShot, carManeuver, departingCar } from '../render/car-departure';
import { approachView, heroApproachShot, sampleApproach, type ApproachShot } from '../render/hero-approach';
import { applyDayGrade, calmMotion } from '../render/lighting';
import { smoothstep } from '../render/noise';
import { applyDaylight, dayDeviceVisual, drawWorld, houseLights, prepareWorld, type Particle, type View } from '../render/world';
import { costLine, drawPlate, oneArmed, platePoint, tripLine } from './common';

const HOLD_SECONDS = 3.2;
const OUTBOUND_ROAD_SECONDS = 1.95;
const DEPARTURE_FADE_OUT = 0.28;
const ROAD_FADE_IN = 0.3;
/** The road noise comes up slowly, under the engine that was just started. */
const ROAD_AUDIO_FADE_IN = 2.2;
const RADIO_PLATE = 'plate_drive_radio';
const OUTBOUND_PLATES = ['plate_drive_road', 'plate_drive_cabin', RADIO_PLATE] as const;
const RADIO_STOPS = [0.58, 1.32] as const;
const STAGE = { x: 0, y: 0, w: STAGE_W, h: STAGE_H };

function paintFade(ctx: CanvasRenderingContext2D, opacity: number): void {
  if (opacity <= 0) return;
  ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
}

function drawRadioNeedle(ctx: CanvasRenderingContext2D, seconds: number): void {
  // Two passes along the painted dial, with a brief stop at the first frequency.
  const tuning = 0.32 + 0.14 * smoothstep(0.22, RADIO_STOPS[0], seconds) + 0.2 * smoothstep(0.83, RADIO_STOPS[1], seconds);
  const top = platePoint(RADIO_PLATE, tuning, 422 / 941);
  const bottom = platePoint(RADIO_PLATE, tuning, 481 / 941);
  const height = bottom.y - top.y;
  ctx.fillStyle = 'rgba(255, 133, 60, 0.24)';
  ctx.fillRect(top.x - 4, top.y, 8, height);
  ctx.fillStyle = '#ffd18b';
  ctx.fillRect(top.x - 1.25, top.y, 2.5, height);
}

// Start on the door, then widen toward the gravel road beside the barn.
const BOARDING_VIEW: View = { ...STAGE, rot: 0, zoom: 2.5, cx: 16.6, cy: 13.1 };
const EXIT_VIEW: View = { ...BOARDING_VIEW, zoom: 1.7, cx: 17.2, cy: 12.9 };
const GRAVEL_PUFFS = [0.45, 0.7, 0.96, 1.26, 1.62, 2] as const;
const GRAVEL_DUST_LIFE = 0.5;

function gravelDust(elapsed: number, forward: number): Particle[] {
  const dust: Particle[] = [];
  for (const delay of GRAVEL_PUFFS) {
    const age = elapsed - forward - delay;
    if (age <= 0 || age >= GRAVEL_DUST_LIFE) continue;
    const { position, yaw } = carManeuver(forward + delay);
    dust.push({
      kind: 'dust',
      x: position.x + Math.sin(yaw) * 0.95,
      y: position.y - Math.cos(yaw) * 0.95,
      age,
      life: GRAVEL_DUST_LIFE,
      radius: 0.62,
    });
  }
  return dust;
}

function departureView(progress: number): View {
  return {
    ...BOARDING_VIEW,
    zoom: BOARDING_VIEW.zoom + (EXIT_VIEW.zoom - BOARDING_VIEW.zoom) * progress,
    cx: BOARDING_VIEW.cx + (EXIT_VIEW.cx - BOARDING_VIEW.cx) * progress,
    cy: BOARDING_VIEW.cy + (EXIT_VIEW.cy - BOARDING_VIEW.cy) * progress,
  };
}

// These paintings are lit for daytime. The dusk return and roadblock plates have their own light.
const DAYLIGHT_PLATES = new Set(['plate_village', 'plate_town', 'plate_trunk', ...OUTBOUND_PLATES]);

export interface TravelOptions {
  readonly plate: string;
  readonly title: string;
  readonly sub: string;
  /** Refuge state before the drive uses any daylight. */
  readonly departure?: GameState;
  /** What is in the boot, when driving home. */
  readonly loot?: Cost;
  /** What the outing handed over or had taken on the way. */
  readonly lost?: Cost;
  /** A last line under the load: what it still allows before dark. */
  readonly note?: string;
  readonly next: () => void;
}

export class TravelScene implements Scene {
  private time = 0;
  private done = false;
  private shot: ReturnType<typeof carDepartureShot> = null;
  private approach: ApproachShot | null = null;
  private summary!: HTMLElement;
  private engineStarted = false;
  private plate: string;

  constructor(
    private readonly app: App,
    private readonly options: TravelOptions,
  ) {
    this.plate = options.plate;
  }

  enter(): void {
    const { title, sub, loot, lost, note, departure } = this.options;
    if (departure) {
      // Every confirmed outing already increments a persisted visit count.
      const outings = Object.values(departure.locations).reduce((total, location) => total + location.visits, 0);
      const variants = [...OUTBOUND_PLATES, this.options.plate];
      const plate = variants[outings % variants.length];
      if (plate && sprite(plate)) this.plate = plate;
      const armless = oneArmed(departure);
      this.shot = calmMotion() ? null : carDepartureShot(armless);
      if (this.shot) {
        this.approach = heroApproachShot(outings, armless, departure.yard.houseHp / HOUSE_MAX_HP);
        if (this.approach) prepareWorld(approachView(this.approach, 0, BOARDING_VIEW), BOARDING_VIEW, EXIT_VIEW);
        else prepareWorld(BOARDING_VIEW, EXIT_VIEW);
      } else {
        audio.play('car_latch');
        this.startEngine();
      }
      if (!this.approach) tripLine('car', departure);
    }
    if (!this.shot) audio.setAmbience('car', ROAD_AUDIO_FADE_IN);
    const some = (cost: Cost | undefined): cost is Cost => cost !== undefined && Object.values(cost).some((n) => (n ?? 0) > 0);
    const s = S();
    const summary = el('div', { class: 'center-col hit', onClick: () => this.finish() }, [
      el('h1', { text: title }),
      sub ? el('p', { text: sub }) : null,
      some(loot) ? el('p', {}, [`${s.loc.trunk} : `, costLine(loot, undefined, '+')]) : loot ? el('p', { text: s.encounter.arrival.empty }) : null,
      some(lost) ? el('p', { class: 'lost' }, [`${s.encounter.arrival.lost} : `, costLine(lost, undefined, '−')]) : null,
      note ? el('p', { class: 'muted', text: note }) : null,
    ]);
    this.summary = el('div', { class: 'travel-summary' }, [summary]);
    this.summary.hidden = this.shot !== null;
    this.app.ui.append(this.summary);
    if (departure) this.app.ui.append(el('button', { class: 'btn skip', text: s.map.skipTravel, onClick: () => this.finish() }));
  }

  private startEngine(): void {
    audio.play('engine_depart');
    this.engineStarted = true;
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    if (this.options.departure) audio.fadeOut('car_latch', 0.18);
    if (this.plate === RADIO_PLATE) audio.fadeOut('radio_squelch', 0.15);
    // A skip during boarding takes us straight to the destination before the starter has played.
    if (!this.options.departure || this.engineStarted) {
      audio.fadeOut(this.options.departure ? 'engine_depart' : 'engine', 0.5);
      audio.play('engine_stop');
    }
    this.options.next();
  }

  update(dt: number): void {
    if (this.done) return;
    const previous = this.time;
    this.time += dt;
    const shot = this.shot;
    const approach = this.approach;
    const boardingStart = approach?.duration ?? 0;
    const roadStart = boardingStart + (shot?.duration ?? 0);
    const crossed = (at: number): boolean => previous < at && this.time >= at;
    if (approach) {
      for (const cue of approach.cues) if (crossed(cue.at)) audio.play(cue.sound, 0.6);
      if (this.options.departure && crossed(boardingStart)) tripLine('car', this.options.departure);
    }
    if (shot) {
      if (crossed(boardingStart + shot.latchAt)) audio.play('car_latch');
      if (crossed(boardingStart + shot.ignitionAt)) this.startEngine();
      if (crossed(boardingStart + shot.forwardAt)) audio.setAmbience('car', 1);
      if (crossed(roadStart)) this.summary.hidden = false;
      if (this.time >= roadStart && previous < roadStart + ROAD_FADE_IN) {
        this.summary.style.opacity = String(smoothstep(0, ROAD_FADE_IN, this.time - roadStart));
      }
    }
    if (this.plate === RADIO_PLATE && !calmMotion()) {
      if (crossed(roadStart + RADIO_STOPS[0])) audio.play('radio_squelch', 0.24, 1.22);
      if (crossed(roadStart + RADIO_STOPS[1])) audio.play('radio_squelch', 0.16, 1.3);
    }
    if (this.time >= roadStart + (shot ? OUTBOUND_ROAD_SECONDS : HOLD_SECONDS)) this.finish();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { departure } = this.options;
    const shot = this.shot;
    const approach = this.approach;
    const boardingTime = this.time - (approach?.duration ?? 0);
    if (departure && shot && boardingTime < shot.duration) {
      const onFoot = approach && boardingTime < 0 ? approach : null;
      const view = onFoot
        ? approachView(onFoot, this.time, BOARDING_VIEW)
        : departureView(smoothstep(shot.rollAt - 0.12, shot.forwardAt + 0.45, boardingTime));
      const { yard } = departure;
      const houseHpRatio = yard.houseHp / HOUSE_MAX_HP;
      const dusk = 1 - departure.hoursLeft / DAY_HOURS;
      drawWorld(ctx, view, {
        time: this.app.time,
        night: false,
        houseHpRatio,
        carPresent: true,
        ...(onFoot ? { approachingHero: sampleApproach(onFoot, this.time) } : { departingCar: departingCar(shot, boardingTime, dusk) }),
        devices: yard.devices.map((d) => dayDeviceVisual(d)),
        barricades: yard.barricades,
        decals: yard.decals,
        enemies: [],
        particles: gravelDust(boardingTime - shot.rollAt, shot.forwardAt - shot.rollAt),
      });
      applyDaylight(ctx, view, dusk, houseLights(view.rot, yard.barricades, houseHpRatio), this.app.time);
      paintFade(ctx, smoothstep(shot.duration - DEPARTURE_FADE_OUT, shot.duration, boardingTime));
      return;
    }
    const roadTime = boardingTime - (shot?.duration ?? 0);
    const state = this.app.state;
    const reduced = calmMotion();
    const zoom = this.plate === RADIO_PLATE ? 1 : 1.04 + (reduced ? 0 : roadTime * 0.012);
    drawPlate(ctx, this.plate, { zoom, oneArmed: oneArmed(state) });
    if (state && DAYLIGHT_PLATES.has(this.plate)) {
      applyDayGrade(ctx, STAGE, 1 - state.hoursLeft / DAY_HOURS);
    }
    if (this.plate === RADIO_PLATE) drawRadioNeedle(ctx, reduced ? RADIO_STOPS[1] : roadTime);
    if (shot) paintFade(ctx, 1 - smoothstep(0, ROAD_FADE_IN, roadTime));
  }

  onPointerDown(): void {
    this.finish();
  }

  onKeyDown(code: string): void {
    if (code === 'Space' || code === 'Enter' || code === 'Escape') this.finish();
  }
}
