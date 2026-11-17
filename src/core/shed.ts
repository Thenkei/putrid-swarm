// The morning in the shed, after the night one of them got shut in it.
//
// A played cut-scene, like the orchard: the player walks, holds, taps; this module decides what that
// does. The baker chained to the post is somewhere between the man he was and what the virus makes of
// him — `presence`, from 0 (only the virus) to 1 (only the man). Silence, water, a handful of flour or
// the current through the chain push it up; the virus pulls it back down. Questions can only be asked
// while he is there, and every answer costs him: the virus comes back harder each time.
//
// A pure reducer over a small state — `tick` for time and held keys, `press` for key presses — so every
// branch can be walked in tests; the scene only draws it and makes it heard.

import { BOSS, ENEMIES } from './data/enemies';
import { BOSS_NIGHT } from './data/locations';
import { planForNight } from './data/waves';
import type { Cost, EnemyTypeId, GameState, Intel, NightReport, SectorId } from './types';
import { SECTOR_IDS } from './types';

export const SHED = {
  /** He is found the morning after this night. */
  night: 4,

  /** From the shed door to the post. */
  walkInSeconds: 2.6,
  /** Between two places of the shed. */
  walkSeconds: 1.5,
  /** Crouching down within his reach; letting go stands back up. */
  approachSeconds: 1,
  /** How fast a held move is undone when it is let go, against its own pace. */
  retreat: 1.7,

  // ── Where he is, 0..1 ──
  start: 0.1,
  /** Below this, only the virus: within reach, it goes for you. */
  feral: 0.25,
  /** From here up, he is there: he can be asked something. */
  lucid: 0.55,
  /** Above this, what is left of him is being used up. */
  breaking: 0.88,

  /** What the virus takes back every second, when nothing holds him up; more after every answer it let out. */
  pull: 0.03,
  pullPerAnswer: 0.01,
  /** While he talks, on top of the pull. */
  answerDrain: 0.005,
  /** What the virus takes back at once when an answer is over. */
  surge: 0.45,

  /** Sitting still out of his reach, hands empty or nearly. */
  silenceRate: 0.07,
  silenceCeiling: 0.45,
  /** Once he has said who waits for him, saying it back takes him further. */
  silenceNamedCeiling: 0.8,
  /** A bowl of water held to his mouth. */
  waterRate: 0.13,
  waterCeiling: 0.84,
  /** Seconds of drinking in a full bowl. */
  bowlSeconds: 4,
  /** A handful of flour in his hands: the old gesture brings him up at once. */
  flourJump: 0.3,
  flourCeiling: 0.95,
  /** The current through the chain: fast, with no ceiling, and paid for with what is left of him. */
  shockRate: 0.55,
  shockWear: 0.22,
  /** Wear per second spent above `breaking`. */
  breakWear: 0.6,

  /** The first time he is there, he says something nobody asked for. */
  flashSeconds: 4,
  /** Where it leaves him: a little above the threshold, for a first question that is short enough. */
  flashLift: 0.1,
  /** How long each answer takes to get out (the length of the line); the first one is never let out whole (see `firstCuts`). */
  answerSeconds: { stash: 4.9, tonight: 4.3, chief: 5.9 } as Readonly<Record<Intel, number>>,
  /** Where the virus cuts him off, each time he is asked about the first one: at the end of what he gets out. */
  firstCuts: [6.2, 2, 2.7] as readonly number[],

  /** Seconds to step back once he goes for you. */
  lungeSeconds: 0.85,
  unlockSeconds: 1.8,
  /** Holding the way out: the door, and the padlock left as it is. */
  leaveSeconds: 1.3,

  // ── What it costs the campaign ──
  /** The morning is gone whatever happens: the least it takes, the most, and what each second inside adds. */
  baseHours: 0.75,
  maxHours: 4.5,
  hoursPerSecond: 1 / 30,
  /** What is in his van, and the walk down the lane to fetch it. */
  stash: { wood: 6, battery: 2 } as Cost,
  stashHours: 0.5,
  /** A hole behind the shed. */
  digHours: 0.5,
  /** Left chained: every morning after, water and a look at the chain. */
  upkeepHours: 0.25,
  /** Let go: every morning after, a bundle of oven wood at the gate. He still does his round. */
  delivery: { wood: 2 } as Cost,
} as const;

// ───────────────────────────── The campaign ─────────────────────────────

/** The night just won shuts one of them in the shed: someone has to go and see in the morning. */
export const opensShed = (state: GameState, report: NightReport): GameState =>
  report.survived && report.night === SHED.night && state.shed === 'quiet' ? { ...state, shed: 'waiting' } : state;

export const awaitsShed = (state: Pick<GameState, 'phase' | 'shed'>): boolean => state.phase === 'morning' && state.shed === 'waiting';

/** What the shed still does to the start of a day, once it has been played: from the day after it on. */
export function shedDawn(state: Pick<GameState, 'day' | 'shed'>): { hours: number; gift: Cost } {
  if (state.day <= SHED.night + 1) return { hours: 0, gift: {} };
  if (state.shed === 'chained') return { hours: -SHED.upkeepHours, gift: {} };
  if (state.shed === 'freed') return { hours: 0, gift: SHED.delivery };
  return { hours: 0, gift: {} };
}

/** What he said that is still worth something today, if anything. */
export type Briefing = { readonly kind: 'tonight'; readonly sectors: readonly SectorCount[] } | { readonly kind: 'chief'; readonly chief: ChiefNotes };

export interface SectorCount {
  readonly sector: SectorId;
  readonly total: number;
  /** Ordinary infected by kind, most numerous first. */
  readonly kinds: readonly { readonly type: EnemyTypeId; readonly count: number }[];
  /** The neighbour coming that way, and in which wave. */
  readonly boss: { readonly type: EnemyTypeId; readonly wave: number } | null;
}

/** The chief, in the tuning table's own numbers. */
export interface ChiefNotes {
  readonly whistleEvery: number;
  readonly whistleSeconds: number;
  /** +% speed of the queue while the whistle lasts. */
  readonly whistleHaste: number;
  readonly auraRadius: number;
  /** −% damage taken by the queue around him. */
  readonly auraShield: number;
  /** −% damage he takes himself, unless he is lit or netted. */
  readonly selfShield: number;
}

/** Everything a night is made of, door by door: what he knows of the round. */
export function nightBySector(night: number): SectorCount[] {
  const plan = planForNight(night);
  return SECTOR_IDS.map((sector) => {
    const counts = new Map<EnemyTypeId, number>();
    let boss: SectorCount['boss'] = null;
    plan.waves.forEach((wave, i) => {
      for (const group of wave.groups) {
        if (group.sector !== sector) continue;
        if (ENEMIES[group.type].boss) boss = { type: group.type, wave: i + 1 };
        else counts.set(group.type, (counts.get(group.type) ?? 0) + group.count);
      }
    });
    const kinds = [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    return { sector, total: kinds.reduce((sum, k) => sum + k.count, 0) + (boss ? 1 : 0), kinds, boss };
  })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

const percent = (factor: number): number => Math.round(Math.abs(1 - factor) * 100);

export const chiefNotes = (): ChiefNotes => ({
  whistleEvery: BOSS.chief.whistleEvery,
  whistleSeconds: BOSS.chief.whistleSeconds,
  whistleHaste: percent(BOSS.chief.whistleSpeed),
  auraRadius: BOSS.chief.auraRadius,
  auraShield: percent(BOSS.chief.auraDamageTaken),
  selfShield: percent(BOSS.chief.selfDamageTaken),
});

/** What the "tonight" card says on top of the tracks, today. */
export function briefingFor(state: Pick<GameState, 'day' | 'phase' | 'intel'>): Briefing | null {
  if (state.phase !== 'day') return null;
  if (state.day === SHED.night + 1 && state.intel.includes('tonight')) return { kind: 'tonight', sectors: nightBySector(state.day) };
  if (state.day === BOSS_NIGHT.chief && state.intel.includes('chief')) return { kind: 'chief', chief: chiefNotes() };
  return null;
}

// ───────────────────────────── The scene ─────────────────────────────

/** Left to right: the workbench and the battery, the post he is chained to, the shelf by the tarpaulin. */
export const PLACES = ['bench', 'post', 'shelf'] as const;
export type Place = (typeof PLACES)[number];

/** What can be in the one hand that matters: the leads and the hammer live on the bench, the bowl and the flour on the shelf. */
export type Item = 'bowl' | 'flour' | 'leads' | 'hammer';

export const QUESTIONS = ['stash', 'tonight', 'chief', 'first'] as const;
export type Question = (typeof QUESTIONS)[number];

export type Beat =
  /** In at the door: walk up to the post. */
  | 'arrive'
  /** Everything else that is not a moment of its own. */
  | 'play'
  /** The first time he is there: he says who is waiting for him. */
  | 'flash'
  /** He is answering. */
  | 'answer'
  /** He goes for you: step back, now. */
  | 'lunge'
  | 'over';

/** Let go, finished off, left chained, used up, or the one that ends the run. */
export type Ending = 'freed' | 'finished' | 'chained' | 'emptied' | 'bitten';
export type Outcome = Exclude<Ending, 'bitten'>;
export const ENDINGS: readonly Ending[] = ['freed', 'finished', 'chained', 'emptied', 'bitten'];
export const isShedFate = (ending: Ending): ending is 'bitten' => ending === 'bitten';

/** What was done, in order, for the recap at the end. Each step is kept once. */
export type Step = 'sat' | 'watered' | 'floured' | 'wired' | 'shocked' | 'named' | 'stash' | 'tonight' | 'chief' | 'first' | 'cut' | 'dodged' | 'unlocked' | 'struck' | 'left' | 'emptied' | 'late';

export interface Shed {
  readonly beat: Beat;
  readonly place: Place;
  /** Seconds spent in the current beat. */
  readonly clock: number;
  /** Seconds spent inside, for the daylight it costs. */
  readonly elapsed: number;
  /** Where a walk in progress leads, and how far along it is (0..1). `arrive` uses `walk` alone. */
  readonly heading: Place | null;
  readonly walk: number;
  /** 0..1 crouching down toward him; `close` once all the way. */
  readonly near: number;
  readonly close: boolean;
  /** 0..1 of the padlock being opened, or of the way out. */
  readonly hold: number;
  /** 0 the virus, 1 the man. */
  readonly presence: number;
  /** What is left of the man to be brought back: worn by the current, never restored. */
  readonly remnant: number;
  readonly holding: Item | null;
  /** What is left in the bowl, 0..1. */
  readonly water: number;
  /** The leads are clipped to his chain. */
  readonly wired: boolean;
  /** The current has gone through him at least once. */
  readonly hurt: boolean;
  /** He has said who waits for him at home. */
  readonly named: boolean;
  readonly asking: Question | null;
  readonly learned: readonly Intel[];
  /** How far he got, each time, about the first one. */
  readonly fragments: number;
  /** Answers the virus let out, cut or not: it pulls harder after each. */
  readonly answers: number;
  readonly ending: Ending | null;
  readonly trail: readonly Step[];
}

export const startShed = (): Shed => ({
  beat: 'arrive',
  place: 'post',
  clock: 0,
  elapsed: 0,
  heading: null,
  walk: 0,
  near: 0,
  close: false,
  hold: 0,
  presence: SHED.start,
  remnant: 1,
  holding: null,
  water: 0,
  wired: false,
  hurt: false,
  named: false,
  asking: null,
  learned: [],
  fragments: 0,
  answers: 0,
  ending: null,
  trail: [],
});

export interface Held {
  readonly forward: boolean;
  readonly back: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly act: boolean;
}
export const NOTHING_HELD: Held = { forward: false, back: false, left: false, right: false, act: false };

export type Press = 'act' | 'up' | 'down' | 'left' | 'right' | `ask_${Question}`;

/** What just happened, for whoever draws and plays it. */
export type Cue =
  | { readonly type: 'arrived'; readonly place: Place }
  | { readonly type: 'took'; readonly what: Item }
  | { readonly type: 'put'; readonly what: Item }
  | { readonly type: 'refilled' }
  | { readonly type: 'crouched' }
  | { readonly type: 'stood' }
  | { readonly type: 'wired' }
  | { readonly type: 'emptied_bowl' }
  | { readonly type: 'floured' }
  | { readonly type: 'flash'; readonly hurt: boolean }
  | { readonly type: 'asked'; readonly question: Question }
  | { readonly type: 'answered'; readonly question: Intel }
  /** The virus took him back mid-sentence. `fragment` is set when it was about the first one. */
  | { readonly type: 'cut'; readonly question: Question; readonly fragment: number | null }
  | { readonly type: 'surge' }
  | { readonly type: 'lunge' }
  | { readonly type: 'dodged'; readonly dropped: Item | null }
  | { readonly type: 'ended'; readonly ending: Ending };

export interface Turn {
  readonly shed: Shed;
  readonly cues: readonly Cue[];
}

const same = (shed: Shed): Turn => ({ shed, cues: [] });
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const step = (shed: Shed, s: Step): readonly Step[] => (shed.trail.includes(s) ? shed.trail : [...shed.trail, s]);

const end = (shed: Shed, ending: Ending, cues: readonly Cue[] = []): Turn => ({
  shed: { ...shed, beat: 'over', ending, heading: null, walk: 0, hold: 0, asking: null },
  cues: [...cues, { type: 'ended', ending }],
});

const neighbour = (place: Place, direction: -1 | 1): Place | null => PLACES[PLACES.indexOf(place) + direction] ?? null;

/** What the virus takes back per second right now, when nothing holds him up. */
export const pullOf = (shed: Pick<Shed, 'answers'>): number => SHED.pull + SHED.pullPerAnswer * shed.answers;

export type Zone = 'feral' | 'drift' | 'lucid' | 'breaking';
export const zoneOf = (presence: number): Zone =>
  presence < SHED.feral ? 'feral' : presence < SHED.lucid ? 'drift' : presence <= SHED.breaking ? 'lucid' : 'breaking';

/** He is there, nothing else is going on, and there is something left to ask. */
export const canAsk = (shed: Shed): boolean => shed.beat === 'play' && shed.presence >= SHED.lucid && questionsLeft(shed).length > 0;

export const questionsLeft = (shed: Pick<Shed, 'learned' | 'fragments'>): Question[] =>
  QUESTIONS.filter((q) => (q === 'first' ? shed.fragments < SHED.firstCuts.length : !shed.learned.includes(q)));

/** Standing still at a place, not crouched, not on the way somewhere. */
const standing = (shed: Shed, place: Place): boolean => shed.place === place && shed.heading === null && !shed.close && shed.near === 0;

/** Nothing threatening in hand: he calms down for someone who just sits there. */
const quietHands = (shed: Shed): boolean => shed.holding !== 'leads' && shed.holding !== 'hammer';

/** What is being done right now with the keys that are held. One thing at a time. */
export type Doing = 'silence' | 'drinking' | 'current' | 'unlock' | 'leave' | 'approach' | null;

export function doing(shed: Shed, held: Held): Doing {
  if (shed.beat !== 'play') return null;
  if (shed.close) {
    if (held.act && shed.holding === 'bowl' && shed.water > 0) return 'drinking';
    if (held.act && shed.holding === null && canFree(shed)) return 'unlock';
    return null;
  }
  if (shed.heading !== null) return null;
  if (shed.place === 'post') {
    if (held.forward && shed.hold === 0) return 'approach';
    if (held.back && shed.near === 0) return 'leave';
    if (held.act && shed.near === 0 && shed.hold === 0 && quietHands(shed)) return 'silence';
    return null;
  }
  if (shed.place === 'bench' && held.act && shed.wired && shed.holding === null) return 'current';
  return null;
}

/** Only someone who never hurt him, with empty hands, while he is there. */
export const canFree = (shed: Shed): boolean => !shed.hurt && shed.close && shed.holding === null && shed.presence >= SHED.lucid;

/** Walking between two places while a direction is held; letting go, or turning back, undoes the steps taken. */
function stride(shed: Shed, held: Held, dt: number): Turn {
  const wanted: -1 | 0 | 1 = held.left === held.right ? 0 : held.left ? -1 : 1;
  let { heading, walk } = shed;
  if (heading === null) {
    if (wanted === 0 || shed.close || shed.near > 0 || shed.hold > 0) return same(shed);
    heading = neighbour(shed.place, wanted);
    if (heading === null) return same(shed);
    walk = 0;
  }
  const toward = Math.sign(PLACES.indexOf(heading) - PLACES.indexOf(shed.place));
  walk += (wanted === toward ? dt : -dt * SHED.retreat) / SHED.walkSeconds;
  if (walk >= 1) return { shed: { ...shed, place: heading, heading: null, walk: 0 }, cues: [{ type: 'arrived', place: heading }] };
  if (walk <= 0) return same({ ...shed, heading: null, walk: 0 });
  return same({ ...shed, heading, walk });
}

/** Something held fills up; let go, it runs back down. */
const fill = (value: number, holding: boolean, seconds: number, dt: number): number => clamp01(value + (holding ? dt : -dt * SHED.retreat) / seconds);

/** A gentle hand brings him up to where it can, and keeps him there while it lasts. */
const toward = (presence: number, rate: number, ceiling: number, dt: number): number => (presence >= ceiling ? presence : Math.min(ceiling, presence + rate * dt));

/** The virus takes him back at once: an answer is over, or he was cut off. Within reach, it goes for you. */
function surge(shed: Shed, cues: Cue[]): Turn {
  const presence = clamp01(shed.presence - SHED.surge);
  const next: Shed = { ...shed, presence, beat: 'play', clock: 0, asking: null };
  cues.push({ type: 'surge' });
  if (next.close && presence < SHED.feral) return { shed: { ...next, beat: 'lunge', clock: 0, hold: 0 }, cues: [...cues, { type: 'lunge' }] };
  return { shed: next, cues };
}

/** Time passing, with whatever is held down. */
export function tick(shed: Shed, dt: number, held: Held = NOTHING_HELD): Turn {
  if (shed.beat === 'over' || dt <= 0) return same(shed);
  const timed: Shed = { ...shed, clock: shed.clock + dt, elapsed: shed.beat === 'arrive' ? shed.elapsed : shed.elapsed + dt };

  switch (timed.beat) {
    case 'arrive': {
      if (!held.forward) return same(timed);
      const walk = timed.walk + dt / SHED.walkInSeconds;
      if (walk < 1) return same({ ...timed, walk });
      return { shed: { ...timed, beat: 'play', clock: 0, walk: 0 }, cues: [{ type: 'arrived', place: 'post' }] };
    }
    case 'flash':
      // Nobody pulls at him while he says it.
      if (timed.clock < SHED.flashSeconds) return same(timed);
      return same({ ...timed, beat: 'play', clock: 0 });
    case 'lunge':
      if (timed.clock < SHED.lungeSeconds) return same(timed);
      return end({ ...timed, trail: step(timed, 'late') }, 'bitten');
    case 'answer':
      return answering(timed, dt);
    case 'play':
      return playing(timed, held, dt);
    case 'over':
      return same(timed);
  }
}

function answering(shed: Shed, dt: number): Turn {
  const question = shed.asking;
  if (question === null) return same({ ...shed, beat: 'play', clock: 0 });
  const next: Shed = { ...shed, presence: clamp01(shed.presence - (pullOf(shed) + SHED.answerDrain) * dt) };
  const cues: Cue[] = [];
  if (question === 'first') {
    // That one, the virus never lets out whole.
    const at = SHED.firstCuts[shed.fragments] ?? 0;
    if (next.clock < at && next.presence >= SHED.lucid) return same(next);
    const fragments = shed.fragments + 1;
    cues.push({ type: 'cut', question, fragment: fragments });
    return surge({ ...next, fragments, answers: next.answers + 1, trail: step({ ...next, trail: step(next, 'first') }, 'cut') }, cues);
  }
  if (next.presence < SHED.lucid) {
    cues.push({ type: 'cut', question, fragment: null });
    return { shed: { ...next, beat: 'play', clock: 0, asking: null, answers: next.answers + 1, trail: step(next, 'cut') }, cues };
  }
  if (next.clock < SHED.answerSeconds[question]) return same(next);
  cues.push({ type: 'answered', question });
  return surge({ ...next, learned: [...next.learned, question], answers: next.answers + 1, trail: step(next, question) }, cues);
}

function playing(shed: Shed, held: Held, dt: number): Turn {
  const now = doing(shed, held);
  const cues: Cue[] = [];
  let next: Shed = shed;

  // ── Where he is ──
  let presence = shed.presence;
  let remnant = shed.remnant;
  if (now === 'silence') presence = toward(presence, SHED.silenceRate, shed.named ? SHED.silenceNamedCeiling : SHED.silenceCeiling, dt);
  else if (now === 'drinking') presence = toward(presence, SHED.waterRate, SHED.waterCeiling, dt);
  else if (now === 'current') {
    presence = clamp01(presence + SHED.shockRate * dt);
    remnant -= SHED.shockWear * dt;
  } else presence = clamp01(presence - pullOf(shed) * dt);
  if (presence > SHED.breaking) remnant -= SHED.breakWear * dt;
  remnant = Math.max(0, remnant);
  next = { ...next, presence, remnant };
  if (now === 'silence') next = { ...next, trail: step(next, 'sat') };
  if (now === 'drinking') {
    const water = Math.max(0, shed.water - dt / SHED.bowlSeconds);
    next = { ...next, water, trail: step(next, 'watered') };
    if (water === 0) cues.push({ type: 'emptied_bowl' });
  }
  if (now === 'current') next = { ...next, hurt: true, trail: step(next, 'shocked') };

  // Nothing left of him to bring back.
  if (remnant <= 0) return end({ ...next, trail: step(next, 'emptied') }, 'emptied', cues);

  // ── Hands and feet ──
  if (now === 'unlock' || (shed.close && shed.hold > 0)) {
    const hold = fill(shed.hold, now === 'unlock', SHED.unlockSeconds, dt);
    next = { ...next, hold };
    if (hold >= 1) return end({ ...next, trail: step(next, 'unlocked') }, 'freed', cues);
  } else if (now === 'leave' || (!shed.close && shed.hold > 0)) {
    const hold = fill(shed.hold, now === 'leave', SHED.leaveSeconds, dt);
    next = { ...next, hold };
    if (hold >= 1) return end({ ...next, trail: step(next, 'left') }, 'chained', cues);
  } else if (!shed.close && (now === 'approach' || shed.near > 0)) {
    const near = fill(shed.near, now === 'approach', SHED.approachSeconds, dt);
    next = { ...next, near };
    if (near >= 1) {
      next = { ...next, near: 1, close: true };
      cues.push({ type: 'crouched' });
    }
  } else if (!shed.close && now === null) {
    const walked = stride(next, held, dt);
    next = walked.shed;
    cues.push(...walked.cues);
  }

  // ── What he does about it ──
  if (!next.named && next.presence >= SHED.lucid) {
    // The first time he is there, he does not wait to be asked.
    cues.push({ type: 'flash', hurt: next.hurt });
    const presence = Math.max(next.presence, SHED.lucid + SHED.flashLift);
    return { shed: { ...next, presence, beat: 'flash', clock: 0, named: true, hold: 0, trail: step(next, 'named') }, cues };
  }
  if (next.close && next.presence < SHED.feral) {
    cues.push({ type: 'lunge' });
    return { shed: { ...next, beat: 'lunge', clock: 0, hold: 0 }, cues };
  }
  return { shed: next, cues };
}

/** A key going down. Anything that does not apply right now is simply ignored. */
export function press(shed: Shed, key: Press): Turn {
  if (shed.beat === 'lunge') {
    if (key !== 'down') return same(shed);
    // A step back, and whatever was in hand goes flying.
    const dropped = shed.holding === 'bowl' || shed.holding === 'flour' ? shed.holding : null;
    return {
      shed: { ...shed, beat: 'play', clock: 0, close: false, near: 0, hold: 0, holding: dropped ? null : shed.holding, water: dropped === 'bowl' ? 0 : shed.water, trail: step(shed, 'dodged') },
      cues: [{ type: 'dodged', dropped }],
    };
  }
  if (shed.beat === 'answer') {
    // He can be listened to from further away.
    if (key === 'down' && shed.close) return { shed: { ...shed, close: false, near: 0 }, cues: [{ type: 'stood' }] };
    return same(shed);
  }
  if (shed.beat !== 'play') return same(shed);

  if (key.startsWith('ask_')) {
    const question = key.slice(4) as Question;
    if (!canAsk(shed) || !questionsLeft(shed).includes(question) || shed.hold > 0) return same(shed);
    return { shed: { ...shed, beat: 'answer', clock: 0, asking: question }, cues: [{ type: 'asked', question }] };
  }

  if (shed.close) {
    if (key === 'down') return { shed: { ...shed, close: false, near: 0, hold: 0 }, cues: [{ type: 'stood' }] };
    if (key !== 'act') return same(shed);
    if (shed.holding === 'flour') {
      const presence = Math.max(shed.presence, Math.min(SHED.flourCeiling, shed.presence + SHED.flourJump));
      return { shed: { ...shed, presence, holding: null, trail: step(shed, 'floured') }, cues: [{ type: 'floured' }] };
    }
    if (shed.holding === 'hammer') return end({ ...shed, trail: step(shed, 'struck') }, 'finished');
    return same(shed);
  }

  if (shed.heading !== null || shed.near > 0 || shed.hold > 0) return same(shed);
  // Taking one thing puts back whatever from the same place was in hand.
  const take = (what: Item): Turn => ({
    shed: { ...shed, holding: what, water: what === 'bowl' ? 1 : 0 },
    cues: [...(shed.holding ? [{ type: 'put', what: shed.holding } as const] : []), { type: 'took', what }],
  });
  const put = (what: Item): Turn => ({ shed: { ...shed, holding: null, water: 0 }, cues: [{ type: 'put', what }] });
  const free = (other: Item): boolean => shed.holding === null || shed.holding === other;

  switch (shed.place) {
    case 'bench':
      // Space for the leads, ↑ for the hammer.
      if (key === 'act' && shed.holding === 'leads') return put('leads');
      if (key === 'act' && free('hammer') && !shed.wired) return take('leads');
      if (key === 'up' && shed.holding === 'hammer') return put('hammer');
      if (key === 'up' && free('leads')) return take('hammer');
      return same(shed);
    case 'shelf':
      // Space for the bowl, ↑ for the flour.
      if (key === 'act' && shed.holding === 'bowl' && shed.water < 1) return { shed: { ...shed, water: 1 }, cues: [{ type: 'refilled' }] };
      if (key === 'act' && shed.holding === 'bowl') return put('bowl');
      if (key === 'act' && free('flour')) return take('bowl');
      if (key === 'up' && shed.holding === 'flour') return put('flour');
      if (key === 'up' && free('bowl')) return take('flour');
      return same(shed);
    case 'post':
      // The leads go on the loose end of the chain; the battery is on the bench.
      if (key === 'act' && shed.holding === 'leads') return { shed: { ...shed, holding: null, wired: true, trail: step(shed, 'wired') }, cues: [{ type: 'wired' }] };
      return same(shed);
  }
}

// ───────────────────────────── What the screen offers ─────────────────────────────

export type PromptId =
  | 'walk_in'
  | 'approach'
  | 'silence'
  | 'leave'
  | 'clip'
  | 'go_left'
  | 'go_right'
  | 'take_leads'
  | 'put_leads'
  | 'take_hammer'
  | 'put_hammer'
  | 'current'
  | 'take_bowl'
  | 'refill'
  | 'put_bowl'
  | 'take_flour'
  | 'put_flour'
  | 'give_water'
  | 'give_flour'
  | 'strike'
  | 'unlock'
  | 'step_back'
  | 'dodge'
  | `ask_${Question}`;

export interface Prompt {
  readonly id: PromptId;
  /** Where the neighbouring place is, for the two walking prompts. */
  readonly to?: Place;
  /** 0..1 for prompts that fill up or run out. */
  readonly progress?: number;
}

/** Everything that can be done right now, in the order it should be read. */
export function promptsOf(shed: Shed): Prompt[] {
  const prompts: Prompt[] = [];
  const ways = (): void => {
    if (shed.close || shed.near > 0 || shed.hold > 0) return;
    const left = neighbour(shed.place, -1);
    const right = neighbour(shed.place, 1);
    const toward = shed.heading === null ? 0 : Math.sign(PLACES.indexOf(shed.heading) - PLACES.indexOf(shed.place));
    if (left && toward <= 0) prompts.push({ id: 'go_left', to: left, progress: toward < 0 ? shed.walk : 0 });
    if (right && toward >= 0) prompts.push({ id: 'go_right', to: right, progress: toward > 0 ? shed.walk : 0 });
  };
  const questions = (): void => {
    if (!canAsk(shed)) return;
    for (const q of questionsLeft(shed)) prompts.push({ id: `ask_${q}` });
  };
  switch (shed.beat) {
    case 'arrive':
      prompts.push({ id: 'walk_in', progress: shed.walk });
      break;
    case 'play': {
      questions();
      if (shed.close) {
        if (shed.holding === 'bowl' && shed.water > 0) prompts.push({ id: 'give_water', progress: shed.water });
        if (shed.holding === 'flour') prompts.push({ id: 'give_flour' });
        if (shed.holding === 'hammer') prompts.push({ id: 'strike' });
        if (canFree(shed) || shed.hold > 0) prompts.push({ id: 'unlock', progress: shed.hold });
        prompts.push({ id: 'step_back' });
        break;
      }
      const still = shed.heading === null;
      if (still && shed.place === 'post') {
        if (shed.hold === 0) prompts.push({ id: 'approach', progress: shed.near });
        if (shed.holding === 'leads') prompts.push({ id: 'clip' });
        else if (shed.near === 0 && shed.hold === 0 && quietHands(shed)) prompts.push({ id: 'silence' });
        if (shed.near === 0) prompts.push({ id: 'leave', progress: shed.hold });
      }
      if (still && shed.place === 'bench') {
        const free = (other: Item): boolean => shed.holding === null || shed.holding === other;
        if (shed.wired && shed.holding === null) prompts.push({ id: 'current' });
        if (shed.holding === 'leads') prompts.push({ id: 'put_leads' });
        else if (!shed.wired && free('hammer')) prompts.push({ id: 'take_leads' });
        if (shed.holding === 'hammer') prompts.push({ id: 'put_hammer' });
        else if (free('leads')) prompts.push({ id: 'take_hammer' });
      }
      if (still && shed.place === 'shelf') {
        const free = (other: Item): boolean => shed.holding === null || shed.holding === other;
        if (shed.holding === 'bowl') prompts.push({ id: shed.water < 1 ? 'refill' : 'put_bowl' });
        else if (free('flour')) prompts.push({ id: 'take_bowl' });
        if (shed.holding === 'flour') prompts.push({ id: 'put_flour' });
        else if (free('bowl')) prompts.push({ id: 'take_flour' });
      }
      ways();
      break;
    }
    case 'answer':
      if (shed.close) prompts.push({ id: 'step_back' });
      break;
    case 'lunge':
      prompts.push({ id: 'dodge', progress: 1 - shed.clock / SHED.lungeSeconds });
      break;
    case 'flash':
    case 'over':
      break;
  }
  return prompts;
}

// ───────────────────────────── What the morning cost ─────────────────────────────

/** What the scene hands to the campaign once it is over. */
export interface ShedResult {
  readonly ending: Ending;
  readonly learned: readonly Intel[];
  /** Daylight the morning took, everything included. */
  readonly hours: number;
}

/** Daylight spent in the shed, to the quarter hour above. */
export const hoursInside = (elapsed: number): number => Math.min(SHED.maxHours, Math.ceil((SHED.baseHours + elapsed * SHED.hoursPerSecond) * 4 - 1e-9) / 4);

export function resultOf(shed: Shed): ShedResult | null {
  if (shed.ending === null) return null;
  const dig = shed.ending === 'finished' || shed.ending === 'emptied' ? SHED.digHours : 0;
  const fetch = shed.learned.includes('stash') ? SHED.stashHours : 0;
  return { ending: shed.ending, learned: shed.learned, hours: hoursInside(shed.elapsed) + dig + fetch };
}
