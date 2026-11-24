// The morning in the orchard, after the night a camera went dark.
//
// A played cut-scene: the player walks, holds, taps and mashes; this module decides what that does.
// It is a pure reducer over a small state — `tick` for time and held keys, `press` for key presses —
// so every branch can be walked in tests, and the scene only draws it and makes it heard.

import { ONE_HAND } from './data/desk';
import { DAY_HOURS } from './data/locations';
import type { OneHand } from './night';
import type { GameState, OrchardFate, SectorId } from './types';

export const ORCHARD = {
  /** The night a camera stops sending, the wave during which it happens and how far into it. */
  night: 2,
  wave: 2,
  outageDelay: 6,
  sector: 'verger' as SectorId,

  /** From the back door to the foot of the pole. */
  walkInSeconds: 3,
  /** The last steps to the rabbit; letting go steps back. */
  approachSeconds: 1.9,
  /** Time watching the rabbit from the pole before the idea of clapping occurs. */
  clapWaitSeconds: 3.5,
  /** How fast a step is taken back when a held move is let go, against walking pace. */
  retreat: 1.7,
  /** It stops chewing, it turns round. Nothing can be done yet. */
  revealSeconds: 1.6,
  /** Seconds to get an arm up once it jumps. */
  guardSeconds: 0.9,
  /** Tugs to tear it off the arm. */
  tugs: 7,
  /** Between two places of the orchard. */
  walkSeconds: 1.7,
  tieSeconds: 2.2,
  sawStrokes: 14,
  spliceSeconds: 2.4,
  /** From the bite to the shoulder with nothing done about it. */
  infectionSeconds: 38,
  /** What a tourniquet leaves of that pace. */
  tiedPace: 0.35,
  /** An arm taken off with nothing tied above it. */
  bleedSeconds: 6,

  /** Daylight lost on the day itself, lying in the grass. */
  faintHours: 3,
  /** Daylight lost every morning afterwards: a dressing takes two hands, and there is one. */
  dressingHours: 1.5,
} as const;

// ───────────────────────────── What it costs the campaign ─────────────────────────────

export interface CameraOutage {
  readonly sector: SectorId;
  readonly wave: number;
  readonly delay: number;
}

/** The camera that will go dark tonight, if this is the night and it has not happened yet. */
export const outageFor = (state: Pick<GameState, 'day' | 'orchard'>): CameraOutage | null =>
  state.day === ORCHARD.night && state.orchard === 'quiet' ? { sector: ORCHARD.sector, wave: ORCHARD.wave, delay: ORCHARD.outageDelay } : null;

/** A camera is dark and nobody has been to look: the day does not start before that. */
export const awaitsOrchard = (state: Pick<GameState, 'phase' | 'orchard'>): boolean => state.phase === 'morning' && state.orchard === 'cut';

export const hasLeftArm = (state: Pick<GameState, 'orchard'>): boolean => state.orchard !== 'maimed';

/** Hours of daylight a day starts with. */
export const daylight = (state: Pick<GameState, 'orchard'>): number => (hasLeftArm(state) ? DAY_HOURS : DAY_HOURS - ORCHARD.dressingHours);

/** How the night's desk is worked: with one hand, once the orchard has taken the other. Null is two hands. */
export const deskFor = (state: Pick<GameState, 'orchard'>): OneHand | null => (hasLeftArm(state) ? null : ONE_HAND);

// ───────────────────────────── The scene ─────────────────────────────

/** Left to right: the old apple tree, the camera pole, the fence. */
export const PLACES = ['tree', 'pole', 'fence'] as const;
export type Place = (typeof PLACES)[number];

export type Beat =
  /** Out of the back door: walk in. */
  | 'arrive'
  /** A white rabbit is chewing the cable. Go closer, or clap. The rest of the orchard can be looked at. */
  | 'watch'
  /** It turns round. */
  | 'reveal'
  /** It jumps: an arm up, now. */
  | 'guard'
  /** It hangs on the left arm, and the arm is going dark. */
  | 'clamped'
  /** Free again, and counting: the rope, the saw. */
  | 'loose'
  /** On one knee, the saw on the arm. */
  | 'sawing'
  /** The arm is off and nothing was tied above it. */
  | 'bleeding'
  /** The rabbit is gone; the cable is still in two pieces. */
  | 'mend'
  | 'over';

export type Ending = 'spared' | 'maimed' | OrchardFate;
export const isFate = (ending: Ending): ending is OrchardFate => ending === 'throat' || ending === 'turned' || ending === 'bled';

/** What was done, in order, for the recap at the end. */
export type Step = 'clapped' | 'approached' | 'guarded' | 'late' | 'torn' | 'rope' | 'tied' | 'saw' | 'cut' | 'mended';

export type Side = 'left' | 'right';

export interface Orchard {
  readonly beat: Beat;
  readonly place: Place;
  /** Seconds spent in the current beat. */
  readonly clock: number;
  /** Where a walk in progress leads, and how far along it is (0..1). `arrive` uses `walk` alone. */
  readonly heading: Place | null;
  readonly walk: number;
  /** 0..1 of whatever is being held: the approach, the knot, the splice. */
  readonly hold: number;
  /** Quiet time at the pole. Null until the forward key used to walk in has been released. */
  readonly clapWait: number | null;
  /** 0 at the bite, 1 at the shoulder. */
  readonly infection: number;
  readonly tugs: number;
  readonly rope: boolean;
  readonly tied: boolean;
  readonly saw: boolean;
  readonly strokes: number;
  readonly lastStroke: Side | null;
  readonly ending: Ending | null;
  readonly trail: readonly Step[];
}

export const startOrchard = (): Orchard => ({
  beat: 'arrive',
  place: 'pole',
  clock: 0,
  heading: null,
  walk: 0,
  hold: 0,
  clapWait: null,
  infection: 0,
  tugs: 0,
  rope: false,
  tied: false,
  saw: false,
  strokes: 0,
  lastStroke: null,
  ending: null,
  trail: [],
});

export interface Held {
  readonly forward: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly act: boolean;
}
export const NOTHING_HELD: Held = { forward: false, left: false, right: false, act: false };

/** `clap` is both hands at once; the scene decides what that is on a keyboard. */
export type Press = 'act' | 'left' | 'right' | 'up' | 'down' | 'clap';

/** What just happened, for whoever draws and plays it. */
export type Cue =
  | { readonly type: 'arrived'; readonly place: Place }
  | { readonly type: 'looked'; readonly at: 'saw' | 'rope' }
  | { readonly type: 'clapped' }
  | { readonly type: 'turned' }
  | { readonly type: 'lunge' }
  | { readonly type: 'guarded' }
  | { readonly type: 'tug'; readonly left: number }
  | { readonly type: 'torn' }
  | { readonly type: 'took'; readonly what: 'saw' | 'rope' }
  | { readonly type: 'tied' }
  | { readonly type: 'knelt' }
  | { readonly type: 'stood' }
  | { readonly type: 'stroke'; readonly side: Side; readonly left: number }
  | { readonly type: 'severed'; readonly tied: boolean }
  | { readonly type: 'spliced' }
  | { readonly type: 'ended'; readonly ending: Ending };

export interface Turn {
  readonly orchard: Orchard;
  readonly cues: readonly Cue[];
}

const same = (orchard: Orchard): Turn => ({ orchard, cues: [] });
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const end = (orchard: Orchard, ending: Ending, cues: readonly Cue[] = []): Turn => ({
  orchard: { ...orchard, beat: 'over', ending, heading: null, walk: 0, hold: 0 },
  cues: [...cues, { type: 'ended', ending }],
});

const neighbour = (place: Place, direction: -1 | 1): Place | null => PLACES[PLACES.indexOf(place) + direction] ?? null;

/** Whether the bite is still doing its work: from the teeth going in until the arm is off. */
const spreading = (orchard: Orchard): boolean => orchard.beat === 'clamped' || orchard.beat === 'loose' || orchard.beat === 'sawing';

/** What the infection gains per second right now. */
export const infectionPace = (orchard: Orchard): number => (spreading(orchard) ? (orchard.tied ? ORCHARD.tiedPace : 1) / ORCHARD.infectionSeconds : 0);

/** Whether the player is busy with the rope: hands taken, feet still. */
const knotting = (orchard: Orchard, held: Held): boolean => orchard.beat === 'loose' && held.act && orchard.rope && !orchard.tied && orchard.heading === null;

/** Walking between two places while a direction is held; letting go, or turning back, undoes the steps taken. */
function stride(orchard: Orchard, held: Held, dt: number): Turn {
  const wanted: -1 | 0 | 1 = held.left === held.right ? 0 : held.left ? -1 : 1;
  let { heading, walk } = orchard;
  if (heading === null) {
    if (wanted === 0) return same(orchard);
    heading = neighbour(orchard.place, wanted);
    if (heading === null) return same(orchard);
    walk = 0;
  }
  const toward = Math.sign(PLACES.indexOf(heading) - PLACES.indexOf(orchard.place));
  walk += (wanted === toward ? dt : -dt * ORCHARD.retreat) / ORCHARD.walkSeconds;
  if (walk >= 1) return { orchard: { ...orchard, place: heading, heading: null, walk: 0 }, cues: [{ type: 'arrived', place: heading }] };
  if (walk <= 0) return same({ ...orchard, heading: null, walk: 0 });
  return same({ ...orchard, heading, walk });
}

/** Something held fills up; let go, it runs back down. */
const fill = (value: number, holding: boolean, seconds: number, dt: number): number => clamp01(value + (holding ? dt : -dt * ORCHARD.retreat) / seconds);

function watchRabbit(o: Orchard, held: Held, dt: number): number | null {
  const ready = ORCHARD.clapWaitSeconds;
  if (o.clapWait === ready) return ready;
  if (o.place !== 'pole' || o.heading !== null || held.left !== held.right) return 0;
  if (held.forward) return o.clapWait === null ? null : 0;
  if (o.hold > 0) {
    // A few frames of the walk-in key spilling across the cut do not count as a second approach.
    return o.clapWait !== null || o.hold * ORCHARD.approachSeconds >= .16 ? ready : null;
  }
  return Math.min(ready, (o.clapWait ?? 0) + dt);
}

const canClap = (o: Orchard): boolean => o.beat === 'watch' && o.clapWait === ORCHARD.clapWaitSeconds
  && o.place === 'pole' && o.walk < .3 && o.hold < 1;

/** Time passing, with whatever is held down. */
export function tick(orchard: Orchard, dt: number, held: Held = NOTHING_HELD): Turn {
  if (orchard.beat === 'over' || dt <= 0) return same(orchard);
  let next: Orchard = { ...orchard, clock: orchard.clock + dt, infection: clamp01(orchard.infection + infectionPace(orchard) * dt) };
  // Past the shoulder there is nothing left to cut off.
  if (spreading(next) && next.infection >= 1) return end(next, 'turned');

  switch (next.beat) {
    case 'arrive': {
      if (!held.forward) return same(next);
      const walk = next.walk + dt / ORCHARD.walkInSeconds;
      if (walk < 1) return same({ ...next, walk });
      return { orchard: { ...next, beat: 'watch', clock: 0, walk: 0 }, cues: [{ type: 'arrived', place: 'pole' }] };
    }
    case 'watch': {
      next = { ...next, clapWait: watchRabbit(next, held, dt) };
      // Going closer is done facing it, from the pole, and not while wandering off.
      const approaching = next.place === 'pole' && next.heading === null && held.forward;
      if (approaching || next.hold > 0) {
        const hold = fill(next.hold, approaching, ORCHARD.approachSeconds, dt);
        if (hold < 1) return same({ ...next, hold });
        return { orchard: { ...next, beat: 'reveal', clock: 0, hold: 1, trail: [...next.trail, 'approached'] }, cues: [{ type: 'turned' }] };
      }
      return stride(next, held, dt);
    }
    case 'reveal':
      if (next.clock < ORCHARD.revealSeconds) return same(next);
      return { orchard: { ...next, beat: 'guard', clock: 0 }, cues: [{ type: 'lunge' }] };
    case 'guard':
      if (next.clock < ORCHARD.guardSeconds) return same(next);
      return end({ ...next, trail: [...next.trail, 'late'] }, 'throat');
    case 'clamped':
      return same(next);
    case 'loose': {
      if (knotting(next, held) || next.hold > 0) {
        const hold = next.tied ? 0 : fill(next.hold, knotting(next, held), ORCHARD.tieSeconds, dt);
        if (hold < 1) return same({ ...next, hold });
        return { orchard: { ...next, hold: 0, tied: true, trail: [...next.trail, 'tied'] }, cues: [{ type: 'tied' }] };
      }
      return stride(next, held, dt);
    }
    case 'sawing':
    case 'over':
      return same(next);
    case 'bleeding':
      if (next.clock < ORCHARD.bleedSeconds) return same(next);
      return end(next, 'bled');
    case 'mend': {
      const splicing = next.place === 'pole' && next.heading === null && held.act;
      if (splicing || next.hold > 0) {
        const hold = fill(next.hold, splicing, ORCHARD.spliceSeconds, dt);
        if (hold < 1) return same({ ...next, hold });
        return end({ ...next, trail: [...next.trail, 'mended'] }, 'spared', [{ type: 'spliced' }]);
      }
      return stride(next, held, dt);
    }
  }
}

/** Standing somewhere, feet still. */
const standingAt = (orchard: Orchard, place: Place): boolean => orchard.place === place && orchard.heading === null;

/** A key going down. Anything that does not apply right now is simply ignored. */
export function press(orchard: Orchard, key: Press): Turn {
  switch (orchard.beat) {
    case 'watch':
    case 'mend': {
      if (key === 'clap' && canClap(orchard)) {
        // Both hands: it is gone before the echo. What is left is a cable in two pieces.
        return { orchard: { ...orchard, beat: 'mend', clock: 0, heading: null, walk: 0, hold: 0, trail: [...orchard.trail, 'clapped'] }, cues: [{ type: 'clapped' }] };
      }
      if (key !== 'act') return same(orchard);
      if (standingAt(orchard, 'tree')) return { orchard, cues: [{ type: 'looked', at: 'saw' }] };
      if (standingAt(orchard, 'fence')) return { orchard, cues: [{ type: 'looked', at: 'rope' }] };
      return same(orchard);
    }
    case 'guard':
      if (key !== 'act') return same(orchard);
      return { orchard: { ...orchard, beat: 'clamped', clock: 0, hold: 0, trail: [...orchard.trail, 'guarded'] }, cues: [{ type: 'guarded' }] };
    case 'clamped': {
      if (key !== 'act') return same(orchard);
      const tugs = orchard.tugs + 1;
      if (tugs < ORCHARD.tugs) return { orchard: { ...orchard, tugs }, cues: [{ type: 'tug', left: ORCHARD.tugs - tugs }] };
      return { orchard: { ...orchard, tugs, beat: 'loose', clock: 0, trail: [...orchard.trail, 'torn'] }, cues: [{ type: 'torn' }] };
    }
    case 'loose': {
      if (key === 'act') {
        if (standingAt(orchard, 'fence') && !orchard.rope) return { orchard: { ...orchard, rope: true, trail: [...orchard.trail, 'rope'] }, cues: [{ type: 'took', what: 'rope' }] };
        if (standingAt(orchard, 'tree') && !orchard.saw) return { orchard: { ...orchard, saw: true, trail: [...orchard.trail, 'saw'] }, cues: [{ type: 'took', what: 'saw' }] };
        return same(orchard);
      }
      // Kneeling takes both feet and a free hand: not mid-stride, not mid-knot.
      if (key === 'down' && orchard.saw && orchard.heading === null && orchard.hold === 0) {
        return { orchard: { ...orchard, beat: 'sawing', clock: 0 }, cues: [{ type: 'knelt' }] };
      }
      return same(orchard);
    }
    case 'sawing': {
      // Before the first stroke there is still time to think better of it.
      if (key === 'up' && orchard.strokes === 0) return { orchard: { ...orchard, beat: 'loose', clock: 0 }, cues: [{ type: 'stood' }] };
      if (key !== 'left' && key !== 'right') return same(orchard);
      // A saw goes one way, then the other.
      if (key === orchard.lastStroke) return same(orchard);
      const strokes = orchard.strokes + 1;
      const stroke: Cue = { type: 'stroke', side: key, left: ORCHARD.sawStrokes - strokes };
      if (strokes < ORCHARD.sawStrokes) return { orchard: { ...orchard, strokes, lastStroke: key }, cues: [stroke] };
      const severed: Orchard = { ...orchard, strokes, lastStroke: key, trail: [...orchard.trail, 'cut'] };
      const cues: Cue[] = [stroke, { type: 'severed', tied: orchard.tied }];
      // The infection went with the arm. Whether the rest follows depends on the rope.
      return orchard.tied ? end(severed, 'maimed', cues) : { orchard: { ...severed, beat: 'bleeding', clock: 0 }, cues };
    }
    default:
      return same(orchard);
  }
}

// ───────────────────────────── What the screen offers ─────────────────────────────

export type PromptId =
  | 'walk_in'
  | 'approach'
  | 'clap'
  | 'go_left'
  | 'go_right'
  | 'look_saw'
  | 'look_rope'
  | 'guard'
  | 'tug'
  | 'take_rope'
  | 'tie'
  | 'take_saw'
  | 'kneel'
  | 'stand'
  | 'saw'
  | 'splice';

export interface Prompt {
  readonly id: PromptId;
  /** Where the neighbouring place is, for the two walking prompts. */
  readonly to?: Place;
  /** 0..1 for prompts that fill up or run out. */
  readonly progress?: number;
}

/** Everything that can be done right now, in the order it should be read. */
export function promptsOf(orchard: Orchard): Prompt[] {
  const prompts: Prompt[] = [];
  const still = orchard.heading === null;
  const ways = (): void => {
    const left = neighbour(orchard.place, -1);
    const right = neighbour(orchard.place, 1);
    const toward = orchard.heading === null ? 0 : Math.sign(PLACES.indexOf(orchard.heading) - PLACES.indexOf(orchard.place));
    if (left && toward <= 0) prompts.push({ id: 'go_left', to: left, progress: toward < 0 ? orchard.walk : 0 });
    if (right && toward >= 0) prompts.push({ id: 'go_right', to: right, progress: toward > 0 ? orchard.walk : 0 });
  };
  switch (orchard.beat) {
    case 'arrive':
      prompts.push({ id: 'walk_in', progress: orchard.walk });
      break;
    case 'watch':
      if (orchard.place === 'pole' && still) {
        prompts.push({ id: 'approach', progress: orchard.hold });
        if (canClap(orchard)) prompts.push({ id: 'clap' });
      }
      if (still && orchard.place === 'tree') prompts.push({ id: 'look_saw' });
      if (still && orchard.place === 'fence') prompts.push({ id: 'look_rope' });
      if (orchard.hold === 0) ways();
      break;
    case 'guard':
      prompts.push({ id: 'guard', progress: 1 - orchard.clock / ORCHARD.guardSeconds });
      break;
    case 'clamped':
      prompts.push({ id: 'tug', progress: orchard.tugs / ORCHARD.tugs });
      break;
    case 'loose':
      if (still && orchard.place === 'fence' && !orchard.rope) prompts.push({ id: 'take_rope' });
      if (still && orchard.place === 'tree' && !orchard.saw) prompts.push({ id: 'take_saw' });
      if (still && orchard.rope && !orchard.tied) prompts.push({ id: 'tie', progress: orchard.hold });
      if (still && orchard.saw && orchard.hold === 0) prompts.push({ id: 'kneel' });
      if (orchard.hold === 0) ways();
      break;
    case 'sawing':
      prompts.push({ id: 'saw', progress: orchard.strokes / ORCHARD.sawStrokes });
      if (orchard.strokes === 0) prompts.push({ id: 'stand' });
      break;
    case 'mend':
      if (still && orchard.place === 'pole') prompts.push({ id: 'splice', progress: orchard.hold });
      if (still && orchard.place === 'tree') prompts.push({ id: 'look_saw' });
      if (still && orchard.place === 'fence') prompts.push({ id: 'look_rope' });
      if (orchard.hold === 0) ways();
      break;
    case 'reveal':
    case 'bleeding':
    case 'over':
      break;
  }
  return prompts;
}
