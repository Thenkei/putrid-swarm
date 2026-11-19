// A short beat in the old break between the refuge and the village, and back with the boot full.

import { HOUSE_MAX_HP } from '../core/data/devices';
import { DAY_HOURS } from '../core/data/locations';
import type { Cost, GameState } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S } from '../engine/i18n';
import { carDepartureShot, carManeuver, departingCar } from '../render/car-departure';
import { applyDayGrade, calmMotion } from '../render/lighting';
import { smoothstep } from '../render/noise';
import { applyDaylight, dayDeviceVisual, drawWorld, houseLights, prepareWorld, type Particle, type View } from '../render/world';
import { costLine, drawPlate, oneArmed, tripLine } from './common';

const HOLD_SECONDS = 3.2;
const OUTBOUND_ROAD_SECONDS = 0.9;
/** The road noise comes up slowly, under the engine that was just started. */
const ROAD_FADE_IN = 2.2;
// Start on the door, then widen toward the gravel road beside the barn.
const BOARDING_VIEW: View = { rot: 0, zoom: 2.5, cx: 16.6, cy: 13.1, x: 0, y: 0, w: STAGE_W, h: STAGE_H };
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
const DAYLIGHT_PLATES = new Set(['plate_village', 'plate_town', 'plate_trunk']);
const STAGE = { x: 0, y: 0, w: STAGE_W, h: STAGE_H };

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
  private summary!: HTMLElement;
  private engineStarted = false;

  constructor(
    private readonly app: App,
    private readonly options: TravelOptions,
  ) {}

  enter(): void {
    const { title, sub, loot, lost, note, departure } = this.options;
    if (departure) {
      this.shot = calmMotion() ? null : carDepartureShot(oneArmed(departure));
      if (this.shot) prepareWorld(BOARDING_VIEW, EXIT_VIEW);
      else {
        audio.play('car_latch');
        this.startEngine();
      }
      tripLine('car', departure);
    }
    if (!this.shot) audio.setAmbience('car', ROAD_FADE_IN);
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
    if (shot) {
      const crossed = (at: number): boolean => previous < at && this.time >= at;
      if (crossed(shot.latchAt)) audio.play('car_latch');
      if (crossed(shot.ignitionAt)) this.startEngine();
      if (crossed(shot.forwardAt)) audio.setAmbience('car', 1);
      if (crossed(shot.duration)) this.summary.hidden = false;
    }
    if (this.time >= (shot ? shot.duration + OUTBOUND_ROAD_SECONDS : HOLD_SECONDS)) this.finish();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { departure } = this.options;
    const shot = this.shot;
    if (departure && shot && this.time < shot.duration) {
      const view = departureView(smoothstep(shot.rollAt - 0.12, shot.forwardAt + 0.45, this.time));
      const { yard } = departure;
      const houseHpRatio = yard.houseHp / HOUSE_MAX_HP;
      drawWorld(ctx, view, {
        time: this.app.time,
        night: false,
        houseHpRatio,
        carPresent: true,
        departingCar: departingCar(shot, this.time),
        devices: yard.devices.map((d) => dayDeviceVisual(d)),
        barricades: yard.barricades,
        decals: yard.decals,
        enemies: [],
        particles: gravelDust(this.time - shot.rollAt, shot.forwardAt - shot.rollAt),
      });
      applyDaylight(ctx, view, 1 - departure.hoursLeft / DAY_HOURS, houseLights(view.rot, yard.barricades, houseHpRatio), this.app.time);
      return;
    }
    const roadTime = this.time - (shot?.duration ?? 0);
    const state = this.app.state;
    const zoom = 1.04 + (calmMotion() ? 0 : roadTime * 0.012);
    drawPlate(ctx, this.options.plate, { zoom, oneArmed: oneArmed(state) });
    if (state && DAYLIGHT_PLATES.has(this.options.plate)) {
      applyDayGrade(ctx, STAGE, 1 - state.hoursLeft / DAY_HOURS);
    }
  }

  onPointerDown(): void {
    this.finish();
  }

  onKeyDown(code: string): void {
    if (code === 'Space' || code === 'Enter' || code === 'Escape') this.finish();
  }
}
