// A short beat in the old break between the refuge and the village, and back with the boot full.

import { HOUSE_MAX_HP } from '../core/data/devices';
import { packTrail, wreckSector } from '../core/epics';
import { departurePlan, drivewayImpacts, type DrivewayImpact } from '../core/driveway';
import type { DepartureRoute } from '../core/car-path';
import { DAY_HOURS } from '../core/data/locations';
import type { Cost, GameState } from '../core/types';
import { STAGE_H, STAGE_W, type App, type Scene } from '../engine/app';
import { assetUrl, sprite } from '../engine/assets';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { S, fmt } from '../engine/i18n';
import { say } from '../engine/voice';
import { carDepartureShot, carManeuver, departingCar } from '../render/car-departure';
import { approachView, heroApproachShot, sampleApproach, type ApproachShot } from '../render/hero-approach';
import { applyDayGrade, calmMotion } from '../render/lighting';
import { smoothstep } from '../render/noise';
import { CAT_BONNET_AT, CAT_LANDS_AT, CAT_SETTLES_AT, catWakeTime, sampleYardCat } from '../render/yard-cat';
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
const STILL_VIEW: View = { ...STAGE, rot: 0, zoom: 1.65, cx: 13.5, cy: 13.2 };
const STILL_BOARD = .98;
const STILL_SEATED = 1.61;
const STILL_ROAD = 2.10;
const EXIT_VIEW: View = { ...BOARDING_VIEW, zoom: 1.7, cx: 17.2, cy: 12.9 };
const GRAVEL_PUFFS = [0.45, 0.7, 0.96, 1.26, 1.62, 2] as const;
const GRAVEL_DUST_LIFE = 0.5;

function gravelDust(elapsed: number, forward: number, route: DepartureRoute): Particle[] {
  const dust: Particle[] = [];
  for (const delay of GRAVEL_PUFFS) {
    const age = elapsed - forward - delay;
    if (age <= 0 || age >= GRAVEL_DUST_LIFE) continue;
    const { position, yaw } = carManeuver(forward + delay, route);
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
  /** App clock when the return starter follows the door slam at the location. */
  readonly ignitionAt?: number;
  /** What is in the boot, when driving home. */
  readonly loot?: Cost;
  readonly mopedDisplaced?: Cost;
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
  private catWake: number | null = null;
  private stills = false;
  private boardingStart = 0;
  private roadStart = 0;
  private summary!: HTMLElement;
  private engineStarted = false;
  private plate: string;
  private readonly impacts: Map<number, DrivewayImpact>;
  private readonly plan: ReturnType<typeof departurePlan> | null;
  private readonly outings: number;
  private readonly firstBreak: DrivewayImpact | undefined;
  private reactionEnds = 0;
  private crushPending = false;

  constructor(
    private readonly app: App,
    private readonly options: TravelOptions,
  ) {
    this.plate = options.plate;
    const departure = options.departure;
    this.outings = departure ? Object.values(departure.locations).reduce((n, loc) => n + loc.visits, 0) : 0;
    this.plan = departure ? departurePlan(departure.yard, this.outings) : null;
    const hits = departure && this.plan ? drivewayImpacts(departure.yard, this.plan.route) : [];
    this.impacts = new Map(hits.map(hit => [hit.before.id, hit]));
    this.firstBreak = hits.find(hit => hit.after.broken);
  }

  enter(): void {
    const { title, sub, loot, lost, mopedDisplaced, note, departure } = this.options;
    if (departure) {
      if (this.plan?.warning) void audio.prepareSample(this.plan.warning);
      if (this.firstBreak) void audio.prepareSample('vo_car_crush');
      // Every confirmed outing already increments a persisted visit count.
      const outings = this.outings;
      const variants = [...OUTBOUND_PLATES, this.options.plate];
      const plate = variants[outings % variants.length];
      if (plate && sprite(plate)) this.plate = plate;
      const armless = oneArmed(departure);
      this.shot = carDepartureShot(armless, this.plan?.route, !!this.plan?.warning);
      if (this.shot) {
        this.stills = calmMotion();
        this.approach = heroApproachShot(this.stills ? 0 : outings, armless, departure.yard.houseHp / HOUSE_MAX_HP);
        if (this.approach && sprite('yard_cat')) this.catWake = catWakeTime(this.approach);
        if (this.stills && !this.approach) this.shot = null;
      }
      if (this.shot) {
        this.boardingStart = this.stills ? STILL_BOARD : this.approach?.duration ?? 0;
        this.roadStart = this.stills ? STILL_ROAD : this.boardingStart + this.shot.duration;
        if (this.stills) prepareWorld(STILL_VIEW);
        else if (this.approach) prepareWorld(approachView(this.approach, 0, BOARDING_VIEW), BOARDING_VIEW, EXIT_VIEW);
        else prepareWorld(BOARDING_VIEW, EXIT_VIEW);
      } else {
        audio.play('car_latch');
        this.startEngine();
      }
      if (!this.approach) this.departureLine(departure);
      if (this.firstBreak && !this.shot) this.reactToBreak();
    }
    if (!this.shot) audio.setAmbience('car', ROAD_AUDIO_FADE_IN);
    const some = (cost: Cost | undefined): cost is Cost => cost !== undefined && Object.values(cost).some((n) => (n ?? 0) > 0);
    const s = S();
    const bikeArt = mopedDisplaced && assetUrl('epic_moped_art');
    const bike = bikeArt ? el('img') : null;
    if (bike && bikeArt) {
      bike.src = bikeArt;
      bike.alt = '';
    }
    const broken = [...this.impacts.values()].filter(hit => hit.after.broken).length;
    const summary = el('div', { class: 'center-col hit', onClick: () => this.finish() }, [
      el('h1', { text: title }),
      sub ? el('p', { text: sub }) : null,
      this.impacts.size ? el('p', { text: fmt(s.day.drivewayReport, { broken, horns: this.impacts.size - broken }) }) : null,
      mopedDisplaced ? el('p', { class: 'moped-delivery' }, [
        bike,
        s.encounter.arrival.mopedOnBoard,
      ]) : null,
      some(loot) ? el('p', {}, [`${s.loc.trunk} : `, costLine(loot, undefined, '+')]) : loot && !mopedDisplaced ? el('p', { text: s.encounter.arrival.empty }) : null,
      some(mopedDisplaced) ? el('p', { class: 'lost' }, [s.encounter.arrival.mopedLeft + ' · ', costLine(mopedDisplaced, undefined, '−')]) : null,
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

  private departureLine(departure: GameState): void {
    if (this.plan?.warning) this.reactionEnds = this.time + say(this.plan.warning, { interrupt: true });
    else if (!this.firstBreak) tripLine('car', departure);
  }

  private reactToBreak(): void {
    if (this.time < this.reactionEnds) {
      this.crushPending = true;
      return;
    }
    this.crushPending = false;
    this.reactionEnds = this.time + say('vo_car_crush', { interrupt: true });
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    if (this.options.departure) {
      audio.fadeOut('yard_cat', .08);
      audio.fadeOut('moped_door', .12);
      audio.fadeOut('car_latch', 0.18);
    }
    if (this.plate === RADIO_PLATE) audio.fadeOut('radio_squelch', 0.15);
    // A skipped ignition has no engine to wind down. Other road scenes may already be driving.
    if (this.engineStarted || (!this.options.departure && this.options.ignitionAt === undefined)) {
      audio.fadeOut(this.options.departure ? 'engine_depart' : 'engine', 0.5);
      audio.play('engine_stop');
    }
    this.options.next();
  }

  update(dt: number): void {
    if (this.done) return;
    const previous = this.time;
    this.time += dt;
    if (this.crushPending && this.time >= this.reactionEnds) this.reactToBreak();
    if (!this.engineStarted && this.options.ignitionAt !== undefined && this.app.time >= this.options.ignitionAt) {
      audio.play('engine');
      this.engineStarted = true;
    }
    const shot = this.shot;
    const approach = this.approach;
    const { boardingStart, roadStart } = this;
    const crossed = (at: number): boolean => previous < at && this.time >= at;
    if (approach) {
      const doorIntact = approach.start !== 'window' && (this.options.departure?.yard.barricades[approach.start].hp ?? 0) > 0;
      for (const cue of approach.cues) {
        const audible = cue.sound === 'moped_door' ? doorIntact : !this.stills;
        if (audible && crossed(cue.at)) audio.play(cue.sound, .6, cue.sound === 'step_gravel' ? 1 + .06 * Math.sin(cue.at * 11) : 1);
      }
      if (!this.stills && this.catWake !== null) {
        if (crossed(this.catWake + .07)) audio.play('yard_cat', .85);
        if (crossed(this.catWake + CAT_BONNET_AT)) audio.play('cat_bonnet', .65);
        if (crossed(this.catWake + CAT_LANDS_AT)) audio.play('step_gravel', .30, 1.32);
      }
      if (this.options.departure && crossed(boardingStart)) this.departureLine(this.options.departure);
    }
    if (shot) {
      if (crossed(this.stills ? STILL_SEATED : boardingStart + shot.latchAt)) audio.play('car_latch');
      if (crossed(this.stills ? STILL_SEATED + .12 : boardingStart + shot.ignitionAt)) this.startEngine();
      if (crossed(this.stills ? STILL_ROAD : boardingStart + shot.forwardAt)) audio.setAmbience('car', 1);
      if (!this.stills) {
        for (const hit of this.impacts.values()) {
          if (crossed(boardingStart + shot.rollAt + hit.at)) {
            if (hit.after.broken) audio.play('broken', .8);
            else audio.play('horn', .42);
            if (hit === this.firstBreak) this.reactToBreak();
          }
        }
      }
      if (crossed(roadStart)) {
        this.summary.hidden = false;
        if (this.stills && this.firstBreak) this.reactToBreak();
      }
      if (this.time >= roadStart && previous < roadStart + ROAD_FADE_IN) {
        this.summary.style.opacity = String(smoothstep(0, ROAD_FADE_IN, this.time - roadStart));
      }
    }
    if (this.plate === RADIO_PLATE && !calmMotion()) {
      if (crossed(roadStart + RADIO_STOPS[0])) audio.play('radio_squelch', 0.24, 1.22);
      if (crossed(roadStart + RADIO_STOPS[1])) audio.play('radio_squelch', 0.16, 1.3);
    }
    const duration = this.options.mopedDisplaced ? 6 : this.stills || !shot ? HOLD_SECONDS : roadStart + OUTBOUND_ROAD_SECONDS;
    if (this.time >= Math.max(duration, this.reactionEnds)) this.finish();
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { departure } = this.options;
    const shot = this.shot;
    const approach = this.approach;
    if (departure && shot && this.time < this.roadStart) {
      const boardingTime = this.stills
        ? (this.time < STILL_SEATED ? shot.poseEnds[1]! : shot.latchAt)
        : this.time - this.boardingStart;
      const onFoot = approach && this.time < this.boardingStart ? approach : null;
      const heroTime = this.stills && onFoot ? (this.time < .2 ? 0 : onFoot.intro * .85) : this.time;
      const hero = onFoot && sampleApproach(onFoot, heroTime);
      const view = this.stills ? STILL_VIEW : onFoot
        ? approachView(onFoot, heroTime, BOARDING_VIEW)
        : departureView(smoothstep(shot.rollAt - .12, Math.max(shot.rollAt + 1.28, shot.forwardAt) + .45, boardingTime));
      const { yard } = departure;
      const houseHpRatio = yard.houseHp / HOUSE_MAX_HP;
      const dusk = 1 - departure.hoursLeft / DAY_HOURS;
      const catTime = this.stills ? (onFoot ? -1 : CAT_SETTLES_AT) : this.time - (this.catWake ?? 0);
      const cat = this.catWake === null ? undefined : sampleYardCat(catTime);
      const particles = gravelDust(boardingTime - shot.rollAt, shot.forwardAt - shot.rollAt, shot.route);
      if (!this.stills && approach) {
        for (const cue of approach.cues) {
          const age = this.time - cue.at;
          if (cue.position && cue.sound === 'step_gravel' && age >= 0 && age < .24) {
            particles.push({ kind: 'dust', ...cue.position, age, life: .24, radius: .25 });
          }
        }
        const age = catTime - CAT_LANDS_AT;
        if (cat && age >= 0 && age < .23) {
          const landing = sampleYardCat(CAT_LANDS_AT);
          particles.push({ kind: 'dust', x: landing.x, y: landing.y, age, life: .23, radius: .22 });
        }
      }
      const devices = yard.devices.map(device => {
        const hit = this.impacts.get(device.id);
        if (!hit || this.stills) return dayDeviceVisual(device);
        const age = boardingTime - shot.rollAt - hit.at;
        if (age < 0) return dayDeviceVisual(device);
        if (age < .4) particles.push({
          kind: hit.after.broken ? 'burst' : 'dust',
          x: device.x + .5, y: device.y + .5, age, life: .4, radius: .62,
        });
        const visual = dayDeviceVisual(hit.after);
        if (!hit.after.broken && age < .32) {
          const t = 1 - (1 - age / .32) ** 2;
          return { ...visual, x: device.x + (visual.x - device.x) * t, y: device.y + (visual.y - device.y) * t,
            placementLift: 9 * Math.sin(Math.PI * t) };
        }
        return visual;
      });
      drawWorld(ctx, view, {
        time: this.app.time,
        night: false,
        mopedWreck: this.app.state ? wreckSector(this.app.state) : undefined,
        packTrail: this.app.state ? packTrail(this.app.state) : undefined,
        houseHpRatio,
        carPresent: true,
        secondsSinceCarRoll: this.stills ? -1 : boardingTime - shot.rollAt,
        departureRoute: shot.route,
        homesteadLife: { day: departure.day, hornAge: this.stills || boardingTime < shot.ignitionAt ? -1 : boardingTime - shot.ignitionAt },
        ...(cat && { yardCat: cat }),
        ...(hero ? { approachingHero: hero } : { departingCar: departingCar(shot, boardingTime, dusk) }),
        ...(hero && hero.shot.start !== 'window' && hero.opening > 0 && { houseDoor: { sector: hero.shot.start, open: hero.opening } }),
        devices,
        barricades: yard.barricades,
        decals: yard.decals,
        enemies: [],
        particles,
      });
      applyDaylight(ctx, view, dusk, houseLights(view.rot, yard.barricades, houseHpRatio), this.app.time);
      paintFade(ctx, smoothstep(this.roadStart - DEPARTURE_FADE_OUT, this.roadStart, this.time));
      return;
    }
    const roadTime = this.time - this.roadStart;
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
