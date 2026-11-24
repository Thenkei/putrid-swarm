// The morning on the radio, after night 6.
//
// A played cut-scene like the orchard and the shed, but nothing here is done fast or pushed hard: it is
// listened to. Among the salvage on the desk, an old CB set that has only ever given static catches a
// living voice. First it has to be found — a dial turned through the static, a voice that drifts and has
// to be held — and what gets through of each line depends on how well the set is tuned at the moment the
// words are said. Then they want something, and the player answers into the microphone with whatever got
// through. Who calls is whoever the run left a mark on; a run that met nobody gets the man on the hill.
//
// A CB wants two hands: one on the dial, one on the microphone. With one, the hand goes from one to the
// other, and the voice drifts off while it is away.
//
// A pure reducer over a small state — `tick` for time and held keys, `press` for key presses — so every
// branch can be walked in tests; the scene only draws it and makes it heard.

import { GROUPS } from './data/rivals';
import { LAST_NIGHT } from './data/waves';
import { seize } from './encounters';
import { createRng, type Rng } from './rng';
import { nightBySector, type SectorCount } from './shed';
import type { Cost, GameState, Inventory, NightReport, ResourceId, RivalId, SectorId, Standing } from './types';
import { RESOURCE_IDS } from './types';

export const RADIO = {
  /** The voice comes the morning after this night. */
  night: 6,

  /** Leaning in to the set, from the chair. */
  leanSeconds: 1.4,

  // ── The set ──
  /** The dial runs 0..1 across the band and starts near its bottom end. */
  dialStart: 0.06,
  /** Band crossed per second while a direction is held. */
  turnRate: 0.14,
  /** How narrow a station is: its strength is exp(−(off / width)²). */
  width: 0.028,
  /** Strength at which the voice counts as found, held this long. */
  lock: 0.6,
  lockSeconds: 0.9,
  /** What gets through of a word: nothing below `hearFloor`, everything from `hearSure`, in between some words. */
  hearFloor: 0.28,
  hearSure: 0.72,
  /** They hear the player only if the set is at least this well tuned when the microphone is keyed. */
  reachThem: 0.2,
  /** How their voice wanders on the band: two slow swells, in band units and seconds. */
  drift: [
    { amp: 0.05, period: 13 },
    { amp: 0.022, period: 5.3 },
  ],
  /** And how it fades, wherever the dial is: a dip now and then, down to `1 − depth`, that eats a few words. */
  fade: { depth: 0.45, period: 9.7, sharpness: 6 },
  /** Where things sit on the band: the voice, the broadcast that still loops, the baker's round. */
  callerBand: [0.5, 0.84] as readonly [number, number],
  newsBand: [0.22, 0.3] as readonly [number, number],
  bakerBand: [0.36, 0.42] as readonly [number, number],
  /** Strength at which a station on the band is noticed. */
  notice: 0.6,
  /** How many pieces a line is heard in. */
  slots: 40,

  // ── Talking ──
  /** Between two lines of theirs, and between two calls while nobody answers. */
  gap: 0.7,
  callGap: 2.4,
  /** Space on the carrier for the two pulls of the pocket zip, then for his voice. */
  zipLead: 1.6,
  /** One hand, from the dial to the microphone or back. */
  crossSeconds: 1.1,
  /** How long they wait for an answer, and when they ask whether anyone is there. */
  answerWindow: 18,
  nudgeAt: 9,
  /** Holding the switch to turn it off, or to hang up. */
  offSeconds: 1.3,
  /** How fast a hold is undone when it is let go, against its own pace. */
  retreat: 1.7,
  /** Their line has been out of reach this long: the voice is being lost. */
  fadeSeconds: 1.4,
  /** Odds that whatever the caller can only tell by being heard is true (bitten, listened to, many, not alone). */
  secretChance: 0.5,

  // ── What it costs the campaign ──
  /** The morning at the set: the least it takes, the most, and what each second of it adds. */
  baseHours: 0.25,
  hoursPerSecond: 1 / 60,
  maxHours: 2.5,
  /** What La Brocanteuse owes: left at the gate, or fetched where the crate was argued over. */
  load: { wood: 4, scrap: 3, springs: 2, battery: 1 } as Cost,
  fetchHours: 1.5,
  /** Someone at the gate, taking what they came for. */
  gateHours: 0.5,
  /** Two planks walked to the crossroads. */
  crossroadsHours: 0.25,
  planks: 2,
  /** What a visit takes from the stock, in pieces of whatever there is most of. */
  toll: { listening: 4, few: 3, many: 6, refusedOffer: 4, unpaid: 3, refused: 3, invited: 4 },
  /** The camper locked in the shed: by day he nails with you. */
  helperHours: 1,
  /**
   * Someone holding a door on the last night: which one, the damage it takes, and, if he was bitten, when he
   * turns and what that door loses then. The back door: it is the one that gives most often on the last night
   * (`pnpm balance --radio`), and the way anyone who comes would come in.
   */
  ally: { door: 'arriere' as SectorId, factor: 0.5, turnWave: 2, turnLoss: 0.5 },
} as const;

// ───────────────────────────── Who calls, and what they say ─────────────────────────────

export const CALLERS = ['dealer_owes', 'camper_owes', 'dealer_grudge', 'camper_grudge', 'ham'] as const;
export type CallerId = (typeof CALLERS)[number];

/** The survivor a call comes from; null for the radio amateur, whom no run has met. */
export const rivalOf = (caller: CallerId): RivalId | null => (caller === 'ham' ? null : caller.startsWith('dealer') ? 'dealer' : 'camper');

export const ANSWERS = ['address', 'landmark', 'keep', 'shelter', 'shed', 'no', 'lie', 'planks', 'battery', 'refuse', 'invite', 'stay', 'info', 'many'] as const;
export type AnswerId = (typeof ANSWERS)[number];

/** What answering amounts to: telling them the truth or letting them in, a deal, a lie, a no. */
export type Kind = 'trusted' | 'bargained' | 'lied' | 'refused';
/** How the call ends: an answer of one of those kinds, nothing said until they gave up, or the set switched off. */
export type Ending = Kind | 'silence' | 'off';
export const ENDINGS: readonly Ending[] = ['trusted', 'bargained', 'lied', 'refused', 'silence', 'off'];

/** A spoken line: an id of the voice table, its recording and its subtitle. */
export type LineId = string;

export interface Option {
  readonly id: AnswerId;
  readonly kind: Kind;
  /** What the protagonist says into the microphone. */
  readonly says: LineId;
  /** What they answer, if they heard it. */
  readonly replies: readonly LineId[];
}

export interface Script {
  /** What they say over and over until someone answers. */
  readonly calls: readonly LineId[];
  /** What they say once answered. A pair is the line that tells their secret: as it is when true, as it is when not. */
  readonly opening: readonly (LineId | readonly [LineId, LineId])[];
  /** What they want, ending in "à vous". */
  readonly ask: LineId;
  /** Nobody has answered for a while. */
  readonly nudge: LineId;
  /** Nobody answered. */
  readonly gone: LineId;
  readonly options: readonly [Option, Option, Option];
}

const line = (caller: CallerId, part: string): LineId => `vo_cb_${caller}_${part}`;
const option = (caller: CallerId, id: AnswerId, kind: Kind, replies: readonly string[]): Option => ({ id, kind, says: `vo_radio_${caller}_${id}`, replies: replies.map((part) => line(caller, part)) });
const calls = (caller: CallerId): LineId[] => [1, 2, 3].map((n) => line(caller, `call_${n}`));

/**
 * Every call, line by line. What each caller's secret is, when it is true: the committee listens on the
 * channel (dealer_owes), he was bitten (camper_owes), they are six with pitchforks (dealer_grudge), the van
 * people are standing next to him (camper_grudge). The man on the hill has none.
 */
export const SCRIPTS: Readonly<Record<CallerId, Script>> = {
  dealer_owes: {
    calls: calls('dealer_owes'),
    opening: [line('dealer_owes', '1'), line('dealer_owes', '2'), [line('dealer_owes', '3a'), line('dealer_owes', '3b')]],
    ask: line('dealer_owes', 'ask'),
    nudge: line('dealer_owes', 'nudge'),
    gone: line('dealer_owes', 'gone'),
    options: [
      option('dealer_owes', 'address', 'trusted', ['re_address']),
      option('dealer_owes', 'landmark', 'bargained', ['re_landmark']),
      option('dealer_owes', 'keep', 'refused', ['re_keep']),
    ],
  },
  camper_owes: {
    calls: calls('camper_owes'),
    opening: [line('camper_owes', '1'), [line('camper_owes', '2a'), line('camper_owes', '2b')], line('camper_owes', '3')],
    ask: line('camper_owes', 'ask'),
    nudge: line('camper_owes', 'nudge'),
    gone: line('camper_owes', 'gone'),
    options: [
      option('camper_owes', 'shelter', 'trusted', ['re_shelter']),
      option('camper_owes', 'shed', 'bargained', ['re_shed']),
      option('camper_owes', 'no', 'refused', ['re_no']),
    ],
  },
  dealer_grudge: {
    calls: calls('dealer_grudge'),
    opening: [line('dealer_grudge', '1'), [line('dealer_grudge', '2a'), line('dealer_grudge', '2b')], line('dealer_grudge', '3')],
    ask: line('dealer_grudge', 'ask'),
    nudge: line('dealer_grudge', 'nudge'),
    gone: line('dealer_grudge', 'gone'),
    options: [
      option('dealer_grudge', 'address', 'trusted', ['re_address']),
      option('dealer_grudge', 'planks', 'bargained', ['re_planks']),
      option('dealer_grudge', 'lie', 'lied', ['re_lie']),
    ],
  },
  camper_grudge: {
    calls: calls('camper_grudge'),
    opening: [line('camper_grudge', '1'), [line('camper_grudge', '2a'), line('camper_grudge', '2b')], line('camper_grudge', '3')],
    ask: line('camper_grudge', 'ask'),
    nudge: line('camper_grudge', 'nudge'),
    gone: line('camper_grudge', 'gone'),
    options: [
      option('camper_grudge', 'battery', 'bargained', ['re_battery']),
      option('camper_grudge', 'refuse', 'refused', ['re_refuse']),
      option('camper_grudge', 'invite', 'trusted', ['re_invite']),
    ],
  },
  ham: {
    calls: calls('ham'),
    opening: [line('ham', '1'), line('ham', '2'), line('ham', '3')],
    ask: line('ham', 'ask'),
    nudge: line('ham', 'nudge'),
    gone: line('ham', 'gone'),
    options: [option('ham', 'stay', 'trusted', ['re_stay', 're_stay_2']), option('ham', 'info', 'bargained', ['re_info']), option('ham', 'many', 'lied', ['re_many'])],
  },
};

/** The protagonist's first word into the microphone. */
export const HELLO: LineId = 'vo_radio_hello';

/**
 * How long each line is spoken, in seconds: its recording, rounded up. A line is heard in pieces over
 * that time; tests check it against the recordings.
 */
export const LINE_SECONDS: Readonly<Record<LineId, number>> = {
  vo_radio_hello: 4.4,
  vo_radio_ham_stay: 2.8,
  vo_radio_ham_info: 2.3,
  vo_radio_ham_many: 2.9,
  vo_radio_dealer_owes_address: 5.0,
  vo_radio_dealer_owes_landmark: 3.8,
  vo_radio_dealer_owes_keep: 2.8,
  vo_radio_camper_owes_shelter: 2.9,
  vo_radio_camper_owes_shed: 4.8,
  vo_radio_camper_owes_no: 2.4,
  vo_radio_dealer_grudge_address: 3.7,
  vo_radio_dealer_grudge_lie: 3.3,
  vo_radio_dealer_grudge_planks: 3.3,
  vo_radio_camper_grudge_battery: 4.5,
  vo_radio_camper_grudge_refuse: 2.2,
  vo_radio_camper_grudge_invite: 2.6,
  vo_cb_ham_call_1: 3.8,
  vo_cb_ham_call_2: 4.1,
  vo_cb_ham_call_3: 4.3,
  vo_cb_ham_1: 5.6,
  vo_cb_ham_2: 5.9,
  vo_cb_ham_3: 5.6,
  vo_cb_ham_ask: 4.9,
  vo_cb_ham_nudge: 4.5,
  vo_cb_ham_gone: 5.0,
  vo_cb_ham_re_stay: 10.0,
  vo_cb_ham_re_stay_2: 4.0,
  vo_cb_ham_re_info: 3.6,
  vo_cb_ham_re_many: 6.4,
  vo_cb_dealer_owes_call_1: 3.9,
  vo_cb_dealer_owes_call_2: 4.7,
  vo_cb_dealer_owes_call_3: 3.2,
  vo_cb_dealer_owes_1: 5.0,
  vo_cb_dealer_owes_2: 4.9,
  vo_cb_dealer_owes_3a: 4.2,
  vo_cb_dealer_owes_3b: 4.2,
  vo_cb_dealer_owes_ask: 6.8,
  vo_cb_dealer_owes_nudge: 3.2,
  vo_cb_dealer_owes_gone: 5.3,
  vo_cb_dealer_owes_re_address: 3.3,
  vo_cb_dealer_owes_re_landmark: 5.1,
  vo_cb_dealer_owes_re_keep: 5.5,
  vo_cb_camper_owes_call_1: 3.9,
  vo_cb_camper_owes_call_2: 3.8,
  vo_cb_camper_owes_call_3: 4.7,
  vo_cb_camper_owes_1: 5.0,
  vo_cb_camper_owes_2a: 3.9,
  vo_cb_camper_owes_2b: 3.7,
  vo_cb_camper_owes_3: 5.0,
  vo_cb_camper_owes_ask: 5.2,
  vo_cb_camper_owes_nudge: 4.1,
  vo_cb_camper_owes_gone: 5.7,
  vo_cb_camper_owes_re_shelter: 4.9,
  vo_cb_camper_owes_re_shed: 6.0,
  vo_cb_camper_owes_re_no: 4.5,
  vo_cb_dealer_grudge_call_1: 3.8,
  vo_cb_dealer_grudge_call_2: 2.8,
  vo_cb_dealer_grudge_call_3: 3.2,
  vo_cb_dealer_grudge_1: 4.2,
  vo_cb_dealer_grudge_2a: 4.5,
  vo_cb_dealer_grudge_2b: 4.2,
  vo_cb_dealer_grudge_3: 3.6,
  vo_cb_dealer_grudge_ask: 4.6,
  vo_cb_dealer_grudge_nudge: 4.0,
  vo_cb_dealer_grudge_gone: 2.7,
  vo_cb_dealer_grudge_re_address: 4.8,
  vo_cb_dealer_grudge_re_lie: 5.6,
  vo_cb_dealer_grudge_re_planks: 4.4,
  vo_cb_camper_grudge_call_1: 3.5,
  vo_cb_camper_grudge_call_2: 3.5,
  vo_cb_camper_grudge_call_3: 3.2,
  vo_cb_camper_grudge_1: 3.8,
  vo_cb_camper_grudge_2a: 2.9,
  vo_cb_camper_grudge_2b: 3.4,
  vo_cb_camper_grudge_3: 4.9,
  vo_cb_camper_grudge_ask: 4.5,
  vo_cb_camper_grudge_nudge: 4.0,
  vo_cb_camper_grudge_gone: 3.4,
  vo_cb_camper_grudge_re_battery: 3.6,
  vo_cb_camper_grudge_re_refuse: 4.1,
  vo_cb_camper_grudge_re_invite: 4.4,
};

/** Seconds a line is spoken for. */
export const lineSeconds = (id: LineId): number => LINE_SECONDS[id] ?? 4;

/**
 * Where, in the man on the hill's answer, each door of the last night is named (as a fraction of the
 * line), in the order he names them: the busiest first, as the wave table has it. Heard, it goes on day 7's
 * "tonight" card; lost in the static, it does not.
 */
export const LOOKOUT: Readonly<Partial<Record<AnswerId, { readonly line: LineId; readonly marks: readonly { readonly sector: SectorId; readonly at: number }[] }>>> = {
  stay: {
    line: 'vo_cb_ham_re_stay',
    marks: [
      { sector: 'portail', at: 0.378 },
      { sector: 'arriere', at: 0.666 },
      { sector: 'verger', at: 0.8 },
      { sector: 'grange', at: 0.975 },
    ],
  },
  info: { line: 'vo_cb_ham_re_info', marks: [{ sector: 'portail', at: 0.735 }] },
};

// ───────────────────────────── The call, rolled once ─────────────────────────────

export interface Call {
  readonly caller: CallerId;
  /** The one thing about them that can only be learnt by hearing it (see SCRIPTS). */
  readonly secret: boolean;
  /** Where the voice sits on the band, and where its drift starts. */
  readonly at: number;
  readonly phase: number;
  /** Where the broadcast still loops, and the baker's round when he was let go (null otherwise). */
  readonly news: number;
  readonly baker: number | null;
}

const within = (band: readonly [number, number], rng: Rng): number => band[0] + rng.next() * (band[1] - band[0]);

/**
 * Who calls: someone the run left a mark on — a favour owed or a grudge, never a mere stranger — and
 * when there is nobody, the man on the hill. Rolled once, when night 6 is won, and kept.
 */
export function rollCall(state: Pick<GameState, 'people' | 'shed'>, rng: Rng): Call {
  const marked = (['dealer', 'camper'] as const).filter((id) => (state.people[id]?.standing ?? 'stranger') !== 'stranger');
  const rival = marked.length > 0 ? rng.pick(marked) : null;
  const caller: CallerId = rival === null ? 'ham' : `${rival}_${state.people[rival]?.standing === 'owes' ? 'owes' : 'grudge'}`;
  const secret = caller !== 'ham' && rng.chance(RADIO.secretChance);
  const at = within(RADIO.callerBand, rng);
  const phase = rng.next() * Math.PI * 2;
  const news = within(RADIO.newsBand, rng);
  const baker = state.shed === 'freed' ? within(RADIO.bakerBand, rng) : null;
  return { caller, secret, at, phase, news, baker };
}

/** The opening of a call as it is spoken in this run: the secret line as it is. */
export const openingOf = (call: Call): LineId[] => SCRIPTS[call.caller].opening.map((entry) => (typeof entry === 'string' ? entry : call.secret ? entry[0] : entry[1]));

export const optionOf = (caller: CallerId, answer: AnswerId): Option | undefined => SCRIPTS[caller].options.find((o) => o.id === answer);

// ───────────────────────────── The campaign ─────────────────────────────

export type RadioStage = 'quiet' | 'waiting' | 'done';

/** The morning on the radio, once per run: nothing yet, a voice on the set waiting, then how the call went. */
export interface RadioChapter {
  readonly stage: RadioStage;
  /** Who calls, set from `waiting` on. */
  readonly call: Call | null;
  readonly ending: Ending | null;
  /** What was answered and heard; null when nothing was. */
  readonly answer: AnswerId | null;
  /** Doors of the last night the man on the hill got through, in his order. */
  readonly sighted: readonly SectorId[];
  /** What was paid out, and what a visit took from the stock, the day it happened. */
  readonly paid: Cost;
  readonly took: Cost;
}

export const QUIET_RADIO: RadioChapter = { stage: 'quiet', call: null, ending: null, answer: null, sighted: [], paid: {}, took: {} };

/** The night just won makes the set catch a voice: someone has to answer it in the morning. Who it is is rolled now, once. */
export function opensRadio(state: GameState, report: NightReport): GameState {
  if (!report.survived || report.night !== RADIO.night || state.radio.stage !== 'quiet') return state;
  const rng = createRng(state.rng);
  const call = rollCall(state, rng);
  return { ...state, rng: rng.state(), radio: { ...QUIET_RADIO, stage: 'waiting', call } };
}

export const awaitsRadio = (state: Pick<GameState, 'phase' | 'radio'>): boolean => state.phase === 'morning' && state.radio.stage === 'waiting';

/** Everything the radio does, it does to the one day after it: later mornings are untouched. */
export const radioDawn = (): { hours: number; gift: Cost } => ({ hours: 0, gift: {} });

/** Someone holding a door on the last night. */
export interface Ally {
  readonly sector: SectorId;
  /** What that door's barricade takes, against what it would take alone. */
  readonly factor: number;
  /** The wave at whose start he turns, if he was bitten; null if he holds to the end. */
  readonly turnsAtWave: number | null;
  /** The share of that barricade lost when he turns. */
  readonly loss: number;
}

/** Who comes to hold a door, for a call and what was answered. */
export function allyOf(call: Call, answer: AnswerId | null): Ally | null {
  const held = (bitten: boolean): Ally => ({ sector: RADIO.ally.door, factor: RADIO.ally.factor, turnsAtWave: bitten ? RADIO.ally.turnWave : null, loss: RADIO.ally.turnLoss });
  if (call.caller === 'camper_owes' && answer === 'shelter') return held(call.secret);
  if (call.caller === 'camper_grudge' && answer === 'invite' && !call.secret) return held(false);
  return null;
}

/** What a call and its answer lead to, the day after. */
export interface Aftermath {
  /** What comes into the stock: left at the gate, or fetched. */
  readonly gift: Cost;
  /** What the player leaves out for them. */
  readonly pay: Cost;
  /** A visit: how many pieces they take, of what. */
  readonly toll: number;
  readonly tollFrom: readonly ResourceId[];
  /** Daylight it takes that day (negative: gives). */
  readonly hours: number;
  readonly ally: Ally | null;
  /** The camper, locked in the shed for the night. */
  readonly guest: boolean;
  /** How the caller stands with the player afterwards; null when it does not change. */
  readonly standing: Standing | null;
  /** The man on the hill says where they will come from. */
  readonly lookout: AnswerId | null;
}

const NOTHING: Aftermath = { gift: {}, pay: {}, toll: 0, tollFrom: [], hours: 0, ally: null, guest: false, standing: null, lookout: null };

const acceptedBy = (refuses: readonly ResourceId[]): ResourceId[] => RESOURCE_IDS.filter((id) => !refuses.includes(id));
const COMMITTEE = acceptedBy(GROUPS.committee.refuses);
const VAN = acceptedBy(GROUPS.van.refuses);

/**
 * Every branch, in one place. `stock` is the refuge's stock at the time, for what can only be paid if it is
 * there. Bounded: a visit takes six pieces at most, a load is ten, an hour and a half is the most daylight
 * an answer takes, and a door held is one door.
 */
export function aftermathOf(call: Call, answer: AnswerId | null, stock: Inventory): Aftermath {
  if (answer === null) return NOTHING;
  const T = RADIO.toll;
  const visit = (pieces: number, from: readonly ResourceId[], standing: Standing | null = null): Aftermath => ({ ...NOTHING, toll: pieces, tollFrom: from, hours: RADIO.gateHours, standing });
  switch (call.caller) {
    case 'dealer_owes':
      if (answer === 'address') return { ...NOTHING, gift: RADIO.load, standing: 'stranger', ...(call.secret ? { toll: T.listening, tollFrom: COMMITTEE, hours: RADIO.gateHours } : {}) };
      if (answer === 'landmark') return { ...NOTHING, gift: RADIO.load, hours: RADIO.fetchHours, standing: 'stranger' };
      return NOTHING;
    case 'camper_owes':
      if (answer === 'shelter') return { ...NOTHING, ally: allyOf(call, answer), standing: 'stranger' };
      if (answer === 'shed') return { ...NOTHING, hours: -RADIO.helperHours, guest: true, standing: 'stranger' };
      return NOTHING;
    case 'dealer_grudge':
      if (answer === 'address') return visit(call.secret ? T.many : T.few, COMMITTEE, 'stranger');
      if (answer === 'planks') {
        const pay: Cost = { wood: Math.min(RADIO.planks, stock.wood) };
        // Six of them with pitchforks do not settle for two planks: they come for the rest.
        if (call.secret) return { ...visit(T.refusedOffer, COMMITTEE), pay, hours: RADIO.crossroadsHours + RADIO.gateHours };
        return { ...NOTHING, pay, hours: RADIO.crossroadsHours, standing: 'stranger' };
      }
      return NOTHING;
    case 'camper_grudge':
      if (answer === 'battery') return stock.battery >= 1 ? { ...NOTHING, pay: { battery: 1 }, standing: 'stranger' } : visit(T.unpaid, VAN);
      if (answer === 'refuse') return call.secret ? visit(T.refused, VAN) : NOTHING;
      if (answer === 'invite') return call.secret ? visit(T.invited, VAN) : { ...NOTHING, ally: allyOf(call, answer), standing: 'owes' };
      return NOTHING;
    case 'ham':
      return answer === 'stay' || answer === 'info' ? { ...NOTHING, lookout: answer } : NOTHING;
  }
}

const take = (stock: Inventory, cost: Cost): Inventory => {
  const next = { ...stock };
  for (const id of RESOURCE_IDS) next[id] = Math.max(0, next[id] - (cost[id] ?? 0));
  return next;
};
const add = (stock: Inventory, cost: Cost): Inventory => {
  const next = { ...stock };
  for (const id of RESOURCE_IDS) next[id] += cost[id] ?? 0;
  return next;
};

/** The stock once the day's comings and goings are done: paid out, the load in, then the visit. */
export function stockAfter(stock: Inventory, after: Aftermath): { readonly stock: Inventory; readonly took: Cost } {
  const loaded = add(take(stock, after.pay), after.gift);
  const took = seize(loaded, after.toll, after.tollFrom);
  return { stock: take(loaded, took), took };
}

/** The door held on the last night, if someone came to hold it. Handed to the night like the outage and the one hand. */
export function allyFor(state: Pick<GameState, 'day' | 'radio'>): Ally | null {
  const { radio } = state;
  if (state.day !== LAST_NIGHT || radio.stage !== 'done' || !radio.call) return null;
  return allyOf(radio.call, radio.answer);
}

/** The camper locked in the shed tonight, and whether what bit him has done its work by the end. */
export function guestOf(state: Pick<GameState, 'radio'>): 'guest' | 'turned' | null {
  const { radio } = state;
  if (radio.stage !== 'done' || radio.call?.caller !== 'camper_owes' || radio.answer !== 'shed') return null;
  return radio.call.secret ? 'turned' : 'guest';
}

/** What the man on the hill said about tonight that got through, door by door from the wave table; null if he was not asked. */
export function lookoutFor(state: Pick<GameState, 'day' | 'phase' | 'radio'>): { readonly rows: readonly SectorCount[]; readonly missed: number } | null {
  const { radio } = state;
  if (state.phase !== 'day' || state.day !== LAST_NIGHT || radio.stage !== 'done' || !radio.answer) return null;
  const said = LOOKOUT[radio.answer];
  if (!said || radio.call?.caller !== 'ham') return null;
  const rows = nightBySector(LAST_NIGHT).filter((row) => radio.sighted.includes(row.sector));
  return { rows, missed: said.marks.length - rows.length };
}

/** A last line for the end of the run: who was on the radio, and what came of it. */
export type Epilogue = 'held' | 'turned' | 'guest' | 'guest_turned' | 'lookout' | 'silence' | 'lied' | 'visited' | 'load';

export function epilogueOf(state: Pick<GameState, 'radio'>): Epilogue | null {
  const { radio } = state;
  if (radio.stage !== 'done' || !radio.call) return null;
  const ally = allyOf(radio.call, radio.answer);
  if (ally) return ally.turnsAtWave === null ? 'held' : 'turned';
  const guest = guestOf(state);
  if (guest) return guest === 'turned' ? 'guest_turned' : 'guest';
  if (radio.call.caller === 'ham' && radio.answer && LOOKOUT[radio.answer]) return 'lookout';
  if (radio.ending === 'silence') return 'silence';
  if (radio.ending === 'lied') return 'lied';
  if (RESOURCE_IDS.some((id) => (radio.took[id] ?? 0) > 0)) return 'visited';
  if ((radio.call.caller === 'dealer_owes' && (radio.answer === 'address' || radio.answer === 'landmark'))) return 'load';
  return null;
}

// ───────────────────────────── The scene ─────────────────────────────

export type Beat =
  /** In the chair: lean in to the set. */
  | 'arrive'
  /** Turning the dial through the static. */
  | 'search'
  /** The voice is found: it is still calling, nobody has answered. */
  | 'hail'
  /** The protagonist answers the call. */
  | 'hello'
  /** They talk. */
  | 'talk'
  /** They have asked: the answer is the player's. */
  | 'answer'
  /** The protagonist answers into the microphone. */
  | 'reply'
  /** What they say back, or that nobody answered. */
  | 'response'
  | 'over';

export type Station = 'caller' | 'news' | 'baker';

/** What was done, in order, for the recap at the end. Each step is kept once. */
export type Step = 'found' | 'hailed' | 'missed' | 'nudged' | 'answered' | 'gave_up' | 'hung_up' | 'switched_off';

/** One line of theirs, as heard: the best the set was tuned while each piece of it was said. */
export interface Heard {
  readonly line: LineId;
  readonly slots: readonly number[];
}

/** Where the one hand is: on the dial, on the microphone, or on its way. */
export type Hand = 'dial' | 'mic' | 'to_mic' | 'to_dial';

export interface Radio {
  readonly call: Call;
  readonly oneArmed: boolean;
  readonly beat: Beat;
  /** Seconds spent in the current beat. */
  readonly clock: number;
  /** Seconds since leaning in: the band's own clock, and the daylight it takes. */
  readonly elapsed: number;
  readonly lean: number;
  readonly dial: number;
  /** Seconds the voice has been held at lock strength, while looking for it. */
  readonly lockFor: number;
  /** The one hand, with one arm; with two it stays `dial` (the other one holds the microphone). */
  readonly hand: Hand;
  readonly reach: number;
  /** What the hand is going to the microphone for. */
  readonly pending: AnswerId | 'hello' | null;
  /** Their line on air, and how far into it. */
  readonly on: { readonly line: LineId; readonly clock: number } | null;
  /** Seconds before their next line. */
  readonly wait: number;
  readonly queue: readonly LineId[];
  readonly calls: number;
  /** What the protagonist is saying into the microphone, and whether they are in reach to hear it. */
  readonly said: { readonly line: LineId; readonly clock: number; readonly reached: boolean; readonly answer: AnswerId | null } | null;
  readonly heard: readonly Heard[];
  readonly answer: AnswerId | null;
  readonly nudged: boolean;
  /** 0..1 of the switch held down. */
  readonly off: number;
  readonly fading: number;
  readonly noticed: readonly Station[];
  readonly ending: Ending | null;
  readonly trail: readonly Step[];
}

export const startRadio = (call: Call, oneArmed: boolean): Radio => ({
  call,
  oneArmed,
  beat: 'arrive',
  clock: 0,
  elapsed: 0,
  lean: 0,
  dial: RADIO.dialStart,
  lockFor: 0,
  hand: 'dial',
  reach: 0,
  pending: null,
  on: null,
  wait: 0,
  queue: [],
  calls: 0,
  said: null,
  heard: [],
  answer: null,
  nudged: false,
  off: 0,
  fading: 0,
  noticed: [],
  ending: null,
  trail: [],
});

export interface Held {
  readonly forward: boolean;
  readonly back: boolean;
  readonly left: boolean;
  readonly right: boolean;
}
export const NOTHING_HELD: Held = { forward: false, back: false, left: false, right: false };

/** `act` keys the microphone to answer the call; `answer_n` says the n-th answer. */
export type Press = 'act' | 'answer_1' | 'answer_2' | 'answer_3';

/** What just happened, for whoever draws and plays it. */
export type Cue =
  | { readonly type: 'leaned' }
  | { readonly type: 'found' }
  | { readonly type: 'foley'; readonly sound: 'camper_zip' | 'camper_breath' }
  /** One of their lines goes on air. */
  | { readonly type: 'line'; readonly line: LineId }
  | { readonly type: 'line_end'; readonly line: LineId; readonly cut: boolean }
  /** Something else on the band, tuned in for the first time. */
  | { readonly type: 'tuned'; readonly station: Exclude<Station, 'caller'> }
  /** Their voice has been out of reach for a while, mid-line. */
  | { readonly type: 'losing' }
  | { readonly type: 'hand'; readonly to: 'mic' | 'dial' }
  /** The microphone is keyed: the protagonist speaks. */
  | { readonly type: 'keyed'; readonly line: LineId; readonly reached: boolean }
  | { readonly type: 'unkeyed'; readonly reached: boolean }
  | { readonly type: 'ended'; readonly ending: Ending };

export interface Turn {
  readonly radio: Radio;
  readonly cues: readonly Cue[];
}

const same = (radio: Radio): Turn => ({ radio, cues: [] });
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const step = (radio: Radio, s: Step): readonly Step[] => (radio.trail.includes(s) ? radio.trail : [...radio.trail, s]);

// ── The band ──

/** Where the voice is on the band at a moment of the band's clock. */
export const callerAt = (call: Call, time: number): number =>
  RADIO.drift.reduce((at, swell, i) => at + swell.amp * Math.sin((2 * Math.PI * time) / swell.period + call.phase * (i + 1)), call.at);

/** How much of the voice's own strength reaches the set at a moment, wherever the dial is. */
export const fadeAt = (call: Call, time: number): number =>
  1 - RADIO.fade.depth * Math.max(0, Math.sin((2 * Math.PI * time) / RADIO.fade.period + call.phase * 3)) ** RADIO.fade.sharpness;

/** Where each station is now. */
export function stationsOf(radio: Pick<Radio, 'call' | 'elapsed'>): { readonly station: Station; readonly at: number }[] {
  const list: { station: Station; at: number }[] = [
    { station: 'caller', at: callerAt(radio.call, radio.elapsed) },
    { station: 'news', at: radio.call.news },
  ];
  if (radio.call.baker !== null) list.push({ station: 'baker', at: radio.call.baker });
  return list;
}

const lobe = (off: number): number => Math.exp(-((off / RADIO.width) ** 2));

/** How strongly a station comes in with the dial at `dial`: the voice fades now and then, the broadcast never. */
export function strength(radio: Pick<Radio, 'call' | 'elapsed' | 'dial'>, station: Station, dial = radio.dial): number {
  const found = stationsOf(radio).find((s) => s.station === station);
  if (!found) return 0;
  return lobe(dial - found.at) * (station === 'caller' ? fadeAt(radio.call, radio.elapsed) : 1);
}

/** What the needle shows at a point of the band: whatever comes in strongest there. */
export const signalAt = (radio: Pick<Radio, 'call' | 'elapsed'>, dial: number): number =>
  Math.max(0, ...stationsOf(radio).map((s) => strength({ ...radio, dial }, s.station, dial)));

/** How well their voice comes through right now. Nothing comes in while the microphone is keyed. */
export const clarity = (radio: Radio): number => (radio.said ? 0 : strength(radio, 'caller'));

/** The one hand is free to turn the dial (with two, the dial hand always is). */
export const canTurn = (radio: Radio): boolean => radio.beat !== 'arrive' && radio.beat !== 'over' && (!radio.oneArmed || radio.hand === 'dial');

/** The set can be switched off, or hung up, while nobody is speaking into it. */
export const canSwitchOff = (radio: Radio): boolean => ['search', 'hail', 'talk', 'answer', 'response'].includes(radio.beat) && radio.said === null && radio.pending === null;

/** Whether the microphone can be taken for an answer now. */
export const canAnswer = (radio: Radio): boolean => radio.beat === 'answer' && radio.said === null && radio.pending === null && radio.hand !== 'to_dial';

// ── Hearing ──

/** The strength a word needs, by where it falls in its line: some words get through a weak signal, others do not. */
export function hearThreshold(at: number): number {
  const n = Math.round(at * 997);
  const hash = (((n * 2654435761) >>> 0) % 1000) / 1000;
  return RADIO.hearFloor + (RADIO.hearSure - RADIO.hearFloor) * hash;
}

const slotOf = (at: number): number => Math.min(RADIO.slots - 1, Math.max(0, Math.floor(at * RADIO.slots)));

/** Whether the word said at fraction `at` of a line got through. */
export const wordHeard = (slots: readonly number[], at: number): boolean => (slots[slotOf(at)] ?? 0) >= hearThreshold(at);

const NOISE = ['·', '~', '-', '·', ':', '~'];
const isLetter = (c: string): boolean => c.toLowerCase() !== c.toUpperCase() || /[0-9]/.test(c);

/**
 * A line as it came through: the words that got through, and static for the rest. With `upTo` below 1,
 * only what has been said so far. `slots` null shows it whole.
 */
export function garble(text: string, slots: readonly number[] | null, upTo = 1): string {
  if (text.length === 0) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    let j = i;
    while (j < text.length && text[j] !== ' ') j++;
    const word = text.slice(i, j);
    const at = (i + (j - i) / 2) / text.length;
    if (at > upTo) break;
    if (slots === null || wordHeard(slots, at)) out += word;
    else out += [...word].map((c, k) => (isLetter(c) ? (NOISE[(k + i) % NOISE.length] as string) : c)).join('');
    if (j < text.length) out += ' ';
    i = j + 1;
  }
  return out.trimEnd();
}

/** The share of a line's words that got through. */
export function heardShare(text: string, slots: readonly number[]): number {
  const words = text.split(' ').filter((w) => [...w].some(isLetter));
  if (words.length === 0) return 1;
  let pos = 0;
  let heard = 0;
  for (const word of text.split(' ')) {
    const at = (pos + word.length / 2) / text.length;
    if ([...word].some(isLetter) && wordHeard(slots, at)) heard++;
    pos += word.length + 1;
  }
  return heard / words.length;
}

/** The best that was heard of a line, if it was said. */
export const heardOf = (radio: Pick<Radio, 'heard'>, id: LineId): Heard | undefined => radio.heard.find((h) => h.line === id);

/** The doors of the last night that got through, from what was heard of the man on the hill. */
export function sightedOf(radio: Pick<Radio, 'heard' | 'answer'>): SectorId[] {
  const said = radio.answer ? LOOKOUT[radio.answer] : undefined;
  if (!said) return [];
  const heard = heardOf(radio, said.line);
  if (!heard) return [];
  return said.marks.filter((mark) => wordHeard(heard.slots, mark.at)).map((mark) => mark.sector);
}

// ── Time ──

const end = (radio: Radio, ending: Ending, cues: Cue[], s?: Step): Turn => ({
  radio: { ...radio, beat: 'over', ending, on: null, said: null, pending: null, off: 0, queue: [], trail: s ? step(radio, s) : radio.trail },
  cues: [...cues, ...(radio.on ? [{ type: 'line_end', line: radio.on.line, cut: true } as const] : []), { type: 'ended', ending }],
});

/** Keeps the best that was heard of every piece of their line on air. */
function listen(radio: Radio, dt: number, cues: Cue[]): Radio {
  const on = radio.on;
  if (!on) return radio;
  const seconds = lineSeconds(on.line);
  const clock = on.clock + dt;
  const level = clarity(radio);
  const index = Math.min(RADIO.slots - 1, Math.floor((on.clock / seconds) * RADIO.slots));
  const previous = heardOf(radio, on.line);
  // A line said again (a call) is heard afresh.
  const slots = previous && on.clock > 0 ? [...previous.slots] : Array.from({ length: RADIO.slots }, () => 0);
  slots[index] = Math.max(slots[index] ?? 0, level);
  const heard = [...radio.heard.filter((h) => h.line !== on.line), { line: on.line, slots }];
  // Out of reach for a while, after it had been heard: the voice is being lost.
  const fading = level < RADIO.hearFloor && slots.some((s) => s >= RADIO.hearSure) ? radio.fading + dt : 0;
  if (fading >= RADIO.fadeSeconds && radio.fading < RADIO.fadeSeconds) cues.push({ type: 'losing' });
  if (clock < seconds) return { ...radio, heard, fading, on: { line: on.line, clock } };
  cues.push({ type: 'line_end', line: on.line, cut: false });
  // Let the sleeve and intake of breath through only when the receiver also caught
  // the admission. The word "bitten" falls at .118 of the English line, "mordre" at .253 in French.
  if (on.line === 'vo_cb_camper_owes_2a' && level >= RADIO.notice && wordHeard(slots, 9 / 76) && wordHeard(slots, 19 / 75)) {
    cues.push({ type: 'foley', sound: 'camper_breath' });
    return { ...radio, heard, fading: 0, on: null, wait: 1.55 };
  }
  return { ...radio, heard, fading: 0, on: null, wait: radio.beat === 'search' || radio.beat === 'hail' ? RADIO.callGap : RADIO.gap };
}

/** Their next line, when it is time for one. */
function speak(radio: Radio, cues: Cue[]): Turn | Radio {
  if (radio.on || radio.said || radio.wait > 0) return radio;
  const script = SCRIPTS[radio.call.caller];
  const air = (next: Radio, id: LineId): Radio => {
    cues.push({ type: 'line', line: id });
    return { ...next, on: { line: id, clock: 0 } };
  };
  switch (radio.beat) {
    case 'search':
    case 'hail':
      // Only a camper is fishing the mic out of his pocket. Hear the zip before any
      // of the repeated calls can identify him, even after a long sweep of the band.
      if (rivalOf(radio.call.caller) === 'camper' && !radio.noticed.includes('caller')) {
        if (strength(radio, 'caller') < RADIO.notice) return radio;
        cues.push({ type: 'foley', sound: 'camper_zip' });
        return { ...radio, noticed: [...radio.noticed, 'caller'], wait: RADIO.zipLead };
      }
      return air({ ...radio, calls: radio.calls + 1 }, script.calls[radio.calls % script.calls.length] as LineId);
    case 'talk': {
      const [next, ...rest] = radio.queue;
      // The question has been asked: over to the player.
      if (next === undefined) return { ...radio, beat: 'answer', clock: 0, queue: [] };
      return air({ ...radio, queue: rest }, next);
    }
    case 'response': {
      const [next, ...rest] = radio.queue;
      if (next === undefined) {
        const kind = radio.answer ? optionOf(radio.call.caller, radio.answer)?.kind : undefined;
        return end(radio, kind ?? 'silence', cues, kind ? undefined : 'gave_up');
      }
      return air({ ...radio, queue: rest }, next);
    }
    default:
      return radio;
  }
}

/** The one hand on its way somewhere: when it gets there, whatever it went for is done. */
function moveHand(radio: Radio, dt: number, cues: Cue[]): Radio {
  if (radio.hand !== 'to_mic' && radio.hand !== 'to_dial') return radio;
  const reach = radio.reach + dt / RADIO.crossSeconds;
  if (reach < 1) return { ...radio, reach };
  if (radio.hand === 'to_dial') {
    cues.push({ type: 'hand', to: 'dial' });
    return { ...radio, hand: 'dial', reach: 0 };
  }
  cues.push({ type: 'hand', to: 'mic' });
  return key({ ...radio, hand: 'mic', reach: 0 }, cues);
}

/** The microphone keyed for what was pending: the protagonist speaks, and they hear it or not. */
function key(radio: Radio, cues: Cue[]): Radio {
  const pending = radio.pending;
  if (pending === null) return radio;
  const answer = pending === 'hello' ? null : pending;
  const says = answer === null ? HELLO : optionOf(radio.call.caller, answer)?.says;
  if (!says) return { ...radio, pending: null };
  // Keying over them cuts them off: a CB is one way at a time.
  if (radio.on) cues.push({ type: 'line_end', line: radio.on.line, cut: true });
  const reached = strength(radio, 'caller') >= RADIO.reachThem;
  cues.push({ type: 'keyed', line: says, reached });
  return { ...radio, pending: null, on: null, beat: answer === null ? 'hello' : 'reply', clock: 0, said: { line: says, clock: 0, reached, answer } };
}

/** What the protagonist says runs its course; then they heard it, or they did not. */
function talkInto(radio: Radio, dt: number, cues: Cue[]): Radio {
  const said = radio.said;
  if (!said) return radio;
  const clock = said.clock + dt;
  if (clock < lineSeconds(said.line)) return { ...radio, said: { ...said, clock } };
  cues.push({ type: 'unkeyed', reached: said.reached });
  const free: Radio = { ...radio, said: null, wait: RADIO.gap, hand: radio.oneArmed ? 'to_dial' : radio.hand, reach: 0 };
  if (said.answer === null) {
    if (!said.reached) return { ...free, beat: 'hail', clock: 0, wait: RADIO.callGap, trail: step(free, 'missed') };
    return { ...free, beat: 'talk', clock: 0, queue: [...openingOf(radio.call), SCRIPTS[radio.call.caller].ask], trail: step(free, 'hailed') };
  }
  if (!said.reached) {
    // They did not hear it: still waiting, and asking right away whether anyone is there.
    return { ...free, beat: 'answer', clock: Math.max(radio.clock, RADIO.nudgeAt), trail: step(free, 'missed') };
  }
  const chosen = optionOf(radio.call.caller, said.answer);
  return { ...free, beat: 'response', clock: 0, answer: said.answer, queue: chosen ? [...chosen.replies] : [], trail: step(free, 'answered') };
}

/** Time passing, with whatever is held down. */
export function tick(radio: Radio, dt: number, held: Held = NOTHING_HELD): Turn {
  if (radio.beat === 'over' || dt <= 0) return same(radio);
  if (radio.beat === 'arrive') {
    const lean = held.forward ? radio.lean + dt / RADIO.leanSeconds : Math.max(0, radio.lean - (dt * RADIO.retreat) / RADIO.leanSeconds);
    if (lean < 1) return same({ ...radio, lean, clock: radio.clock + dt });
    return { radio: { ...radio, lean: 1, beat: 'search', clock: 0, wait: 0.6 }, cues: [{ type: 'leaned' }] };
  }

  const cues: Cue[] = [];
  let next: Radio = { ...radio, clock: radio.clock + dt, elapsed: radio.elapsed + dt, wait: Math.max(0, radio.wait - dt) };

  // ── Hands ──
  next = moveHand(next, dt, cues);
  const wanted = held.left === held.right ? 0 : held.left ? -1 : 1;
  if (wanted !== 0 && canTurn(next)) next = { ...next, dial: clamp01(next.dial + wanted * RADIO.turnRate * dt) };
  const switching = held.back && canSwitchOff(next);
  if (switching || next.off > 0) {
    const off = clamp01(next.off + (switching ? dt : -dt * RADIO.retreat) / RADIO.offSeconds);
    if (off >= 1) {
      // Hung up after answering: the answer stands, whatever was still to be said is not heard.
      if (next.beat === 'response' && next.answer) return end(next, optionOf(next.call.caller, next.answer)?.kind ?? 'off', cues, 'hung_up');
      return end(next, 'off', cues, 'switched_off');
    }
    next = { ...next, off };
  }

  // ── Voices ──
  next = talkInto(next, dt, cues);
  next = listen(next, dt, cues);
  const spoken = speak(next, cues);
  if ('cues' in spoken) return spoken;
  next = spoken;

  // ── The band ──
  for (const station of ['news', 'baker'] as const) {
    if (!next.noticed.includes(station) && strength(next, station) >= RADIO.notice) {
      next = { ...next, noticed: [...next.noticed, station] };
      cues.push({ type: 'tuned', station });
    }
  }
  if (next.beat === 'search') {
    const lockFor = strength(next, 'caller') >= RADIO.lock ? next.lockFor + dt : 0;
    next = { ...next, lockFor };
    if (lockFor >= RADIO.lockSeconds) {
      cues.push({ type: 'found' });
      next = { ...next, beat: 'hail', clock: 0, trail: step(next, 'found') };
    }
  }

  // ── Waiting for an answer ──
  if (next.beat === 'answer' && next.pending === null && next.said === null && next.on === null) {
    if (next.clock >= RADIO.answerWindow) {
      cues.push({ type: 'line', line: SCRIPTS[next.call.caller].gone });
      return { radio: { ...next, beat: 'response', clock: 0, queue: [], answer: null, on: { line: SCRIPTS[next.call.caller].gone, clock: 0 } }, cues };
    }
    if (next.clock >= RADIO.nudgeAt && !next.nudged) {
      const nudge = SCRIPTS[next.call.caller].nudge;
      cues.push({ type: 'line', line: nudge });
      next = { ...next, nudged: true, on: { line: nudge, clock: 0 }, trail: step(next, 'nudged') };
    }
  }
  return { radio: next, cues };
}

/** Takes the microphone for something to say: at once with two hands, once the hand gets there with one. */
function reachFor(radio: Radio, what: AnswerId | 'hello'): Turn {
  if (!radio.oneArmed || radio.hand === 'mic') {
    const cues: Cue[] = [];
    const keyed = key({ ...radio, pending: what }, cues);
    return { radio: keyed, cues };
  }
  if (radio.hand !== 'dial') return same(radio);
  return { radio: { ...radio, pending: what, hand: 'to_mic', reach: 0 }, cues: [] };
}

/** A key going down. Anything that does not apply right now is simply ignored. */
export function press(radio: Radio, key: Press): Turn {
  if (radio.off > 0) return same(radio);
  if (key === 'act') {
    if (radio.beat !== 'hail' || radio.pending !== null || radio.said !== null || radio.hand === 'to_dial') return same(radio);
    return reachFor(radio, 'hello');
  }
  if (!canAnswer(radio)) return same(radio);
  const index = Number(key.slice(-1)) - 1;
  const chosen = SCRIPTS[radio.call.caller].options[index];
  if (!chosen) return same(radio);
  return reachFor(radio, chosen.id);
}

// ───────────────────────────── What the screen offers ─────────────────────────────

export type PromptId = 'lean' | 'tune' | 'hello' | 'answer_1' | 'answer_2' | 'answer_3' | 'off' | 'hang_up' | 'hand';

export interface Prompt {
  readonly id: PromptId;
  /** 0..1 for prompts that fill up. */
  readonly progress?: number;
  /** The microphone would not reach them as tuned now. */
  readonly weak?: boolean;
  /** The answer behind a numbered prompt. */
  readonly answer?: AnswerId;
}

/** Everything that can be done right now, in the order it should be read. */
export function promptsOf(radio: Radio): Prompt[] {
  const prompts: Prompt[] = [];
  if (radio.beat === 'arrive') return [{ id: 'lean', progress: radio.lean }];
  if (radio.beat === 'over') return [];
  const weak = strength(radio, 'caller') < RADIO.reachThem;
  if (radio.beat === 'hail' && radio.pending === null && radio.said === null && radio.hand !== 'to_dial') prompts.push({ id: 'hello', weak });
  if (canAnswer(radio)) SCRIPTS[radio.call.caller].options.forEach((o, i) => prompts.push({ id: `answer_${i + 1}` as PromptId, answer: o.id, weak }));
  if (radio.oneArmed && (radio.hand === 'to_mic' || radio.hand === 'to_dial')) prompts.push({ id: 'hand', progress: radio.reach });
  if (canTurn(radio)) prompts.push({ id: 'tune' });
  if (canSwitchOff(radio)) prompts.push({ id: radio.beat === 'response' && radio.answer ? 'hang_up' : 'off', progress: radio.off });
  return prompts;
}

// ───────────────────────────── What the morning cost ─────────────────────────────

/** What the scene hands to the campaign once it is over. */
export interface RadioResult {
  readonly ending: Ending;
  /** What was answered and heard by them; null for silence, a call switched off, or an answer they never got. */
  readonly answer: AnswerId | null;
  readonly sighted: readonly SectorId[];
  /** Daylight the morning at the set took. */
  readonly hours: number;
}

/** Daylight spent at the set, to the quarter hour above. */
export const hoursOnAir = (elapsed: number): number => Math.min(RADIO.maxHours, Math.ceil((RADIO.baseHours + elapsed * RADIO.hoursPerSecond) * 4 - 1e-9) / 4);

export function resultOf(radio: Radio): RadioResult | null {
  if (radio.ending === null) return null;
  const answer = radio.ending === 'off' || radio.ending === 'silence' ? null : radio.answer;
  return { ending: radio.ending, answer, sighted: sightedOf({ heard: radio.heard, answer }), hours: hoursOnAir(radio.elapsed) };
}
