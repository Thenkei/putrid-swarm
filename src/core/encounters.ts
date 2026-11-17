// Encounters on an outing: someone already at a lot the player wants (a dispute), or a group
// barring the road home for part of the load (an ambush).
//
// Rules that hold whatever the branch:
//   - everything uncertain is rolled when the encounter is created and stored, so a reload
//     resumes the same rival, the same lot, the same washers and the same scuffle;
//   - an encounter can only touch the lot and the boot: the refuge's stock is out of reach;
//   - every choice states the most daylight it can cost, and is refused if that would leave
//     no time to drive home; one way out always costs nothing;
//   - a closed encounter is gone: its lot is spent once, and acting on it again is an error.

import { ENCOUNTER, GROUPS, RESOURCE_VALUE, RIVALS, WASHERS, type StanceWeights } from './data/rivals';
import { LOCATIONS, type LocationDef, type SearchSpot } from './data/locations';
import type { Rng } from './rng';
import type {
  Acquaintance,
  Ambush,
  Cost,
  Dispute,
  Encounter,
  Fight,
  GameState,
  GroupId,
  Inventory,
  OutcomeId,
  Outing,
  ResourceId,
  Result,
  RivalId,
  Stance,
  Standing,
} from './types';
import { GROUP_IDS, RESOURCE_IDS, RIVAL_IDS, err, ok } from './types';

const EPS = 1e-9;

export const NO_STOCK: Inventory = { wood: 0, scrap: 0, springs: 0, wire: 0, battery: 0 };

// ───────────────────────────── Lots ─────────────────────────────

export const units = (cost: Cost): number => RESOURCE_IDS.reduce((n, id) => n + (cost[id] ?? 0), 0);
export const worth = (cost: Cost): number => RESOURCE_IDS.reduce((n, id) => n + (cost[id] ?? 0) * RESOURCE_VALUE[id], 0);

const plus = (stock: Inventory, cost: Cost): Inventory => {
  const next = { ...stock };
  for (const id of RESOURCE_IDS) next[id] += cost[id] ?? 0;
  return next;
};

/** Never below zero: what is not there cannot be taken. */
const minus = (stock: Inventory, cost: Cost): Inventory => {
  const next = { ...stock };
  for (const id of RESOURCE_IDS) next[id] = Math.max(0, next[id] - (cost[id] ?? 0));
  return next;
};

const without = (lot: Cost, taken: Cost): Cost => {
  const rest: Partial<Record<ResourceId, number>> = {};
  for (const id of RESOURCE_IDS) {
    const left = (lot[id] ?? 0) - (taken[id] ?? 0);
    if (left > 0) rest[id] = left;
  }
  return rest;
};

const missing = (stock: Inventory, cost: Cost): Cost => without(cost, stock);
const covers = (stock: Inventory, cost: Cost): boolean => units(missing(stock, cost)) === 0;

/** Rarest first; pieces worth the same keep the inventory order. */
const BY_WORTH: readonly ResourceId[] = [...RESOURCE_IDS].sort((a, b) => RESOURCE_VALUE[b] - RESOURCE_VALUE[a]);

/**
 * A lot shared piece by piece, rarest first, each side in turn. The rival was there first and
 * picks first, so an odd lot leans their way.
 */
export function splitLot(lot: Cost): { readonly yours: Cost; readonly theirs: Cost } {
  const yours: Partial<Record<ResourceId, number>> = {};
  const theirs: Partial<Record<ResourceId, number>> = {};
  let turn = 0;
  for (const id of BY_WORTH) {
    for (let i = 0; i < (lot[id] ?? 0); i++) {
      const side = turn++ % 2 === 0 ? theirs : yours;
      side[id] = (side[id] ?? 0) + 1;
    }
  }
  return { yours, theirs };
}

/** What a group grabs when nobody chooses for them: whatever there is most of, one piece at a time. */
export function seize(trunk: Inventory, pieces: number, accepts: readonly ResourceId[]): Cost {
  const left = { ...trunk };
  const taken: Partial<Record<ResourceId, number>> = {};
  for (let i = 0; i < pieces; i++) {
    let best: ResourceId | null = null;
    for (const id of accepts) if (left[id] > 0 && (best === null || left[id] > left[best])) best = id;
    if (best === null) break;
    left[best] -= 1;
    taken[best] = (taken[best] ?? 0) + 1;
  }
  return taken;
}

// ───────────────────────────── People ─────────────────────────────

const UNKNOWN: Acquaintance = { standing: 'stranger', met: 0, fought: false };

export const acquaintance = (state: GameState, rival: RivalId): Acquaintance => state.people[rival] ?? UNKNOWN;

/** A good turn moves someone one step: a grudge is forgotten before a favour is owed. */
const WARMER: Readonly<Record<Standing, Standing>> = { grudge: 'stranger', stranger: 'owes', owes: 'owes' };

/** How a rival greets the player, from what happened before. */
export type Greeting = 'first' | 'again' | 'owes' | 'threat' | 'fight';

export function greetingOf(who: Acquaintance): Greeting {
  if (who.standing === 'owes') return 'owes';
  if (who.standing === 'grudge') return who.fought ? 'fight' : 'threat';
  return who.met === 0 ? 'first' : 'again';
}

// ───────────────────────────── Washers ─────────────────────────────

/** Two points in the tin, one inside the chalk ring, nothing on the bare plank. */
export function washerScore(position: number): 0 | 1 | 2 {
  const off = Math.abs(position - WASHERS.tin);
  return off <= WASHERS.tinHalf + EPS ? 2 : off <= WASHERS.ringHalf + EPS ? 1 : 0;
}

export const washerTotal = (throws: readonly number[]): number => throws.reduce((sum, p) => sum + washerScore(p), 0);

// ───────────────────────────── Scuffles ─────────────────────────────

export type FightMove = 'grab' | 'shove' | 'wait' | 'yield';

/** What the other side is doing in the exchange about to be played. */
export const stanceOf = (fight: Fight): Stance => (fight.staggered ? 'falter' : (fight.stances[fight.exchange] ?? 'guard'));

export const isLastExchange = (fight: Fight): boolean => fight.exchange >= ENCOUNTER.exchanges - 1;

/** Blows it costs to wrench the thing away, by what the other side is doing. */
const GRAB_BLOWS: Readonly<Record<Stance, number>> = { guard: 2, rush: 1, falter: 0 };

export const fightHours = (blows: number): number => Math.min(ENCOUNTER.hours.fightMax, ENCOUNTER.hours.fight + ENCOUNTER.hours.blow * blows);

export interface MovePreview {
  readonly move: FightMove;
  /** Blows this costs. */
  readonly blows: number;
  /** It settles the matter in the player's favour. */
  readonly wins: boolean;
  /** The next exchange becomes an opening. */
  readonly opening: boolean;
  /** Nothing is decided and no exchange is left: what is at stake gets split. */
  readonly splits: boolean;
}

/** The moves that make sense against the stance shown, each with exactly what it does. */
export function fightMoves(fight: Fight): readonly MovePreview[] {
  const stance = stanceOf(fight);
  const last = isLastExchange(fight);
  const moves: MovePreview[] = [{ move: 'grab', blows: GRAB_BLOWS[stance], wins: true, opening: false, splits: false }];
  // Shoving only pays against someone planted on the thing: it costs a blow, and the next exchange is an opening.
  if (stance === 'guard' && !last) moves.push({ move: 'shove', blows: 1, wins: false, opening: true, splits: false });
  if (stance !== 'falter') moves.push({ move: 'wait', blows: 0, wins: false, opening: false, splits: last });
  moves.push({ move: 'yield', blows: 0, wins: false, opening: false, splits: false });
  return moves;
}

// ───────────────────────────── Creation ─────────────────────────────

const flagToday = (kind: string, id: string, day: number): string => `${kind}:${id}:${day}`;
const majorsKey = (day: number): string => `majors:${day}`;

function rollStances(rng: Rng, weights: StanceWeights): Stance[] {
  const table = (Object.keys(weights) as Stance[]).flatMap((stance) => Array.from({ length: weights[stance] }, () => stance));
  return Array.from({ length: ENCOUNTER.exchanges }, () => rng.pick(table));
}

const freshFight = (rng: Rng, weights: StanceWeights): Fight => ({ stances: rollStances(rng, weights), exchange: 0, blows: 0, staggered: false });

const expectedWorth = (spot: SearchSpot): number =>
  RESOURCE_IDS.reduce((sum, id) => {
    const range = spot.loot[id];
    return range ? sum + ((range[0] + range[1]) / 2) * RESOURCE_VALUE[id] : sum;
  }, 0);

/** What a rival asks from the boot for a whole lot: the thing they want most that the lot does not hold. */
function priceFor(rival: RivalId, lot: Cost, standing: Standing): Cost {
  const def = RIVALS[rival];
  const wanted = def.wants.find((id) => !(lot[id] ?? 0)) ?? def.wants[0] ?? 'scrap';
  const pieces = Math.max(1, Math.ceil((worth(lot) * ENCOUNTER.priceShare[standing]) / RESOURCE_VALUE[wanted] - EPS));
  return { [wanted]: pieces };
}

export interface Meeting<E extends Encounter> {
  readonly encounter: E;
  readonly flags: GameState['flags'];
}

/**
 * Decides whether someone is already there when the break pulls up, and who claims what.
 * Rivals keep to places with nobody left to mind them: a neighbour still at home is encounter enough.
 */
export function rollDispute(state: GameState, location: LocationDef, neighborAtHome: boolean, rng: Rng): Meeting<Dispute> | null {
  const { day, flags } = state;
  if (neighborAtHome) return null;
  if (state.totals.searches < ENCOUNTER.searchesBeforeFirst) return null;
  if ((flags[majorsKey(day)] ?? 0) >= ENCOUNTER.majorsPerDay) return null;
  if (flags[flagToday('dispute', location.id, day)]) return null;

  const searched = state.locations[location.id].searched;
  const open = location.spots.map((spot, index) => ({ spot, index })).filter(({ index }) => !searched.includes(index));
  if (open.length === 0) return null;

  const candidates = RIVAL_IDS.filter((id) => RIVALS[id].fromDay <= day && !flags[flagToday('rival', id, day)]);
  if (candidates.length === 0) return null;

  // The first one is certain, and is the dealer: she is the one who offers every way out.
  const first = !flags['disputes'];
  if (!first && !rng.chance(ENCOUNTER.disputeChance)) return null;
  const rival = first && candidates.includes('dealer') ? 'dealer' : rng.pick(candidates);
  const def = RIVALS[rival];
  const who = acquaintance(state, rival);

  const claimed = open.reduce((best, entry) => (expectedWorth(entry.spot) > expectedWorth(best.spot) ? entry : best));
  const rolled: Partial<Record<ResourceId, number>> = {};
  for (const id of RESOURCE_IDS) {
    const range = claimed.spot.loot[id];
    if (range) rolled[id] = rng.int(range[0], range[1]);
  }
  // Someone with a grudge does not wait: their half is already loaded when the player walks in.
  const left = who.standing === 'grudge' ? splitLot(rolled).yours : rolled;
  const lot: Cost = units(left) > 0 ? left : rolled;

  const encounter: Dispute = {
    kind: 'dispute',
    rival,
    location: location.id,
    spot: claimed.index,
    lot,
    price: priceFor(rival, lot, who.standing),
    yields: def.nervous && who.standing !== 'grudge' && !(def.needs !== null && (lot[def.needs] ?? 0) > 0),
    plays: def.plays && who.standing !== 'grudge',
    stage: 'open',
    game: {
      theirs: Array.from({ length: ENCOUNTER.throws }, () => Math.min(0.95, Math.max(0.05, WASHERS.tin + (rng.next() + rng.next() - 1) * def.spread))),
      yours: [],
    },
    fight: freshFight(rng, def.stances),
  };
  return {
    encounter,
    flags: {
      ...flags,
      disputes: (flags['disputes'] ?? 0) + 1,
      [majorsKey(day)]: (flags[majorsKey(day)] ?? 0) + 1,
      [flagToday('dispute', location.id, day)]: 1,
      [flagToday('rival', rival, day)]: 1,
    },
  };
}

/** Decides whether a group bars the road as the break leaves with what it loaded. */
export function rollAmbush(state: GameState, rng: Rng): Meeting<Ambush> | null {
  const { day, flags, outing } = state;
  if (!outing || outing.major) return null;
  if (day < ENCOUNTER.ambushFromDay) return null;
  const load = units(outing.trunk);
  if (load < ENCOUNTER.ambushMinLoad) return null;
  if ((flags[majorsKey(day)] ?? 0) >= ENCOUNTER.majorsPerDay) return null;
  if (flags[`ambush:${day}`]) return null;

  const candidates = GROUP_IDS.filter((id) => GROUPS[id].fromDay <= day);
  if (candidates.length === 0) return null;
  const first = !flags['ambushes'];
  if (!first && !rng.chance(ENCOUNTER.ambushChance)) return null;
  // The first roadblock is the neighbours': faces the player may already know.
  const group: GroupId = first && candidates.includes('committee') ? 'committee' : rng.pick(candidates);
  const def = GROUPS[group];

  const known = acquaintance(state, def.member);
  const member = known.met > 0 ? def.member : null;
  const asked = Math.min(ENCOUNTER.tollMax, Math.max(ENCOUNTER.tollMin, Math.ceil(load * ENCOUNTER.tollShare - EPS)));
  // Someone in the group remembers being pushed around.
  const toll = Math.min(load, asked + (member && known.standing === 'grudge' ? 1 : 0));
  const wanted = RESOURCE_IDS.filter((id) => !def.refuses.includes(id));
  const accepts = wanted.reduce((n, id) => n + outing.trunk[id], 0) >= toll ? wanted : RESOURCE_IDS;

  const encounter: Ambush = {
    kind: 'ambush',
    group,
    toll,
    accepts,
    need: { [def.need]: Math.max(1, Math.round((toll * ENCOUNTER.needShare) / RESOURCE_VALUE[def.need])) },
    detourHours: def.detourHours,
    member,
    memberStanding: known.standing,
    stage: 'open',
    fight: freshFight(rng, def.stances),
  };
  return {
    encounter,
    flags: { ...flags, ambushes: (flags['ambushes'] ?? 0) + 1, [majorsKey(day)]: (flags[majorsKey(day)] ?? 0) + 1, [`ambush:${day}`]: 1 },
  };
}

// ───────────────────────────── Choices ─────────────────────────────

export type ChoiceId = 'share' | 'trade' | 'favor' | 'play' | 'threaten' | 'concede' | 'fight' | 'pay' | 'bargain' | 'detour' | 'defend' | FightMove;

export interface Choice {
  readonly id: ChoiceId;
  /** Daylight it costs at least, and at most when that depends on how it goes. */
  readonly hours: number;
  readonly maxHours: number;
  /** What would come into the boot, when that is known beforehand. */
  readonly gains: Cost | null;
  /** What would leave the boot. */
  readonly gives: Cost | null;
  /** Set for the moves of a scuffle. */
  readonly move: MovePreview | null;
  readonly blocked: null | { readonly code: 'no_time'; readonly needed: number } | { readonly code: 'cannot_pay'; readonly missing: Cost };
}

/** Daylight an encounter may still use: on site the drive home is kept back; on the road it is already paid. */
export function spareHours(state: GameState): number {
  const reserve = state.where !== 'home' && state.where !== 'road' ? LOCATIONS[state.where].travelHours : 0;
  return Math.max(0, state.hoursLeft - reserve);
}

/** Everything the player may do at this point of the encounter, with what each costs. Nothing here is hidden from them. */
export function choicesOf(state: GameState): readonly Choice[] {
  const encounter = state.encounter;
  const trunk = state.outing?.trunk;
  if (!encounter || !trunk) return [];
  const spare = spareHours(state);

  const choice = (id: ChoiceId, hours: number, extra: Partial<Pick<Choice, 'maxHours' | 'gains' | 'gives' | 'move'>> = {}): Choice => {
    const maxHours = extra.maxHours ?? hours;
    const gives = extra.gives ?? null;
    const short = gives ? missing(trunk, gives) : {};
    return {
      id,
      hours,
      maxHours,
      gains: extra.gains ?? null,
      gives,
      move: extra.move ?? null,
      blocked: units(short) > 0 ? { code: 'cannot_pay', missing: short } : maxHours > spare + EPS ? { code: 'no_time', needed: maxHours } : null,
    };
  };
  // Once a scuffle has started its daylight is already set aside: no move may be refused for lack of time.
  const moves = (fight: Fight): Choice[] => fightMoves(fight).map((move) => ({ ...choice(move.move, 0, { move }), blocked: null }));
  const scuffle = (id: 'fight' | 'defend'): Choice => choice(id, ENCOUNTER.hours.fight, { maxHours: ENCOUNTER.hours.fightMax });
  const H = ENCOUNTER.hours;

  if (encounter.kind === 'dispute') {
    const { lot } = encounter;
    switch (encounter.stage) {
      case 'open': {
        const list: Choice[] = [];
        if (acquaintance(state, encounter.rival).standing === 'owes') list.push(choice('favor', H.favor, { gains: lot }));
        list.push(choice('share', H.share, { gains: splitLot(lot).yours }));
        list.push(choice('trade', H.trade, { gains: lot, gives: encounter.price }));
        if (encounter.plays) list.push(choice('play', H.game));
        list.push(choice('threaten', 0, { maxHours: H.threat }));
        list.push(choice('concede', 0));
        return list;
      }
      case 'refused':
        return [scuffle('fight'), choice('concede', 0)];
      case 'game':
        return [];
      case 'fight':
        return moves(encounter.fight);
    }
  }

  if (encounter.stage === 'fight') return moves(encounter.fight);
  const list: Choice[] = [];
  if (encounter.member && encounter.memberStanding === 'owes') list.push(choice('favor', 0));
  list.push(choice('pay', 0));
  list.push(choice('bargain', H.bargain, { gives: encounter.need }));
  list.push(choice('detour', encounter.detourHours));
  list.push(scuffle('defend'));
  return list;
}

// ───────────────────────────── Acting ─────────────────────────────

export type EncounterError =
  | { readonly code: 'no_encounter' }
  | { readonly code: 'not_offered' }
  | { readonly code: 'no_time'; readonly needed: number }
  | { readonly code: 'cannot_pay'; readonly missing: Cost }
  | { readonly code: 'bad_payment' };

export type Action =
  | { readonly type: Exclude<ChoiceId, 'pay'> }
  | { readonly type: 'pay'; readonly payment: Cost }
  | { readonly type: 'throw'; readonly aim: number };

/** How an encounter ended, for the player to read and for the outing's report. */
export interface Resolution {
  readonly who: RivalId | GroupId;
  readonly outcome: OutcomeId;
  /** What came into the boot. */
  readonly gained: Cost;
  /** What left it. */
  readonly lost: Cost;
  /** What the other side kept of a disputed lot. */
  readonly theirs: Cost;
  readonly hours: number;
  /** How the survivor concerned stood before and stands now; null when nobody the player knows was involved. */
  readonly standing: { readonly rival: RivalId; readonly before: Standing; readonly after: Standing } | null;
}

/** What one exchange of a scuffle did, to show before the next. */
export interface Exchange {
  readonly stance: Stance;
  readonly move: FightMove;
  readonly blows: number;
  readonly opening: boolean;
}

export interface Step {
  readonly state: GameState;
  /** Set when this step closed the encounter. */
  readonly resolution: Resolution | null;
  readonly exchange: Exchange | null;
}

const going = (state: GameState, exchange: Exchange | null = null): Result<Step, EncounterError> => ok({ state, resolution: null, exchange });

interface Closing {
  readonly outcome: OutcomeId;
  readonly gained?: Cost;
  readonly lost?: Cost;
  readonly hours?: number;
  /** The survivor whose opinion of the player this settles, and what it becomes. */
  readonly rival?: RivalId | null;
  readonly standing?: Standing;
  readonly fought?: boolean;
  readonly exchange?: Exchange | null;
}

function close(state: GameState, outing: Outing, encounter: Encounter, closing: Closing): Result<Step, EncounterError> {
  const gained = closing.gained ?? {};
  // What is not in the boot cannot leave it, whatever a rule above asked for.
  const lost = without(closing.lost ?? {}, missing(outing.trunk, closing.lost ?? {}));
  const hours = Math.min(closing.hours ?? 0, state.hoursLeft);
  const dispute = encounter.kind === 'dispute' ? encounter : null;
  const rival = closing.rival === undefined ? (dispute?.rival ?? null) : closing.rival;
  const before = rival ? acquaintance(state, rival) : null;
  const after: Acquaintance | null = before && {
    standing: closing.standing ?? before.standing,
    met: before.met + (dispute ? 1 : 0),
    fought: before.fought || closing.fought === true,
  };
  const who = dispute ? dispute.rival : (encounter as Ambush).group;

  const next: GameState = {
    ...state,
    hoursLeft: state.hoursLeft - hours,
    encounter: null,
    outing: {
      ...outing,
      trunk: minus(plus(outing.trunk, gained), lost),
      parted: plus(outing.parted, lost),
      marks: [...outing.marks, { who, outcome: closing.outcome }],
    },
    people: rival && after ? { ...state.people, [rival]: after } : state.people,
    // The lot is spent whoever left with it: its search spot is empty for good.
    locations: dispute
      ? {
          ...state.locations,
          [dispute.location]: {
            ...state.locations[dispute.location],
            searched: [...new Set([...state.locations[dispute.location].searched, dispute.spot])],
          },
        }
      : state.locations,
  };
  return ok({
    state: next,
    resolution: {
      who,
      outcome: closing.outcome,
      gained,
      lost,
      theirs: dispute ? without(dispute.lot, gained) : {},
      hours,
      standing: rival && before && after ? { rival, before: before.standing, after: after.standing } : null,
    },
    exchange: closing.exchange ?? null,
  });
}

/** Plays one exchange. `null` when the move is not one the stance allows. */
function playExchange(fight: Fight, move: FightMove): { readonly fight: Fight; readonly exchange: Exchange; readonly end: 'won' | 'split' | 'lost' | null } | null {
  const preview = fightMoves(fight).find((m) => m.move === move);
  if (!preview) return null;
  const exchange: Exchange = { stance: stanceOf(fight), move, blows: preview.blows, opening: preview.opening };
  const next: Fight = { ...fight, exchange: fight.exchange + 1, blows: fight.blows + preview.blows, staggered: preview.opening };
  const end = move === 'yield' ? 'lost' : preview.wins ? 'won' : next.exchange >= ENCOUNTER.exchanges ? 'split' : null;
  return { fight: next, exchange, end };
}

const setPerson = (state: GameState, rival: RivalId, patch: Partial<Acquaintance>): GameState['people'] => ({
  ...state.people,
  [rival]: { ...acquaintance(state, rival), ...patch },
});

function actOnDispute(state: GameState, outing: Outing, dispute: Dispute, action: Action): Result<Step, EncounterError> {
  const H = ENCOUNTER.hours;
  const who = acquaintance(state, dispute.rival);
  const split = splitLot(dispute.lot);

  if (dispute.stage === 'game') {
    if (action.type !== 'throw' || !Number.isFinite(action.aim)) return err({ code: 'not_offered' });
    const yours = [...dispute.game.yours, Math.min(1, Math.max(0, action.aim))];
    if (yours.length < ENCOUNTER.throws) return going({ ...state, encounter: { ...dispute, game: { ...dispute.game, yours } } });
    const mine = washerTotal(yours);
    const theirs = washerTotal(dispute.game.theirs);
    // A wager kept is a wager kept: nobody's opinion of anybody changes.
    return close(state, outing, dispute, {
      outcome: mine > theirs ? 'game_won' : mine === theirs ? 'game_tied' : 'game_lost',
      gained: mine > theirs ? dispute.lot : mine === theirs ? split.yours : {},
      hours: H.game,
    });
  }

  if (dispute.stage === 'fight') {
    if (action.type === 'throw' || action.type === 'pay') return err({ code: 'not_offered' });
    const played = playExchange(dispute.fight, action.type as FightMove);
    if (!played) return err({ code: 'not_offered' });
    if (!played.end) return going({ ...state, encounter: { ...dispute, fight: played.fight } }, played.exchange);
    return close(state, outing, dispute, {
      outcome: played.end === 'won' ? 'fight_won' : played.end === 'split' ? 'fight_split' : 'fight_lost',
      gained: played.end === 'won' ? dispute.lot : played.end === 'split' ? split.yours : {},
      hours: fightHours(played.fight.blows),
      standing: 'grudge',
      fought: true,
      exchange: played.exchange,
    });
  }

  const offered = choicesOf(state).find((c) => c.id === action.type);
  if (!offered) return err({ code: 'not_offered' });
  if (offered.blocked) return err(offered.blocked);

  switch (action.type) {
    case 'share':
      // A fair share settles an old score, no more.
      return close(state, outing, dispute, { outcome: 'shared', gained: split.yours, hours: H.share, standing: who.standing === 'grudge' ? 'stranger' : who.standing });
    case 'trade':
      return close(state, outing, dispute, { outcome: 'traded', gained: dispute.lot, lost: dispute.price, hours: H.trade });
    case 'favor':
      return close(state, outing, dispute, { outcome: 'favor', gained: dispute.lot, hours: H.favor, standing: 'stranger' });
    case 'play':
      return going({ ...state, encounter: { ...dispute, stage: 'game' } });
    case 'threaten':
      if (dispute.yields) return close(state, outing, dispute, { outcome: 'scared', gained: dispute.lot, hours: H.threat, standing: 'grudge' });
      // The threat was made whether or not it worked: it is remembered from now on.
      return going({ ...state, encounter: { ...dispute, stage: 'refused' }, people: setPerson(state, dispute.rival, { standing: 'grudge' }) });
    case 'fight':
      return going({ ...state, encounter: { ...dispute, stage: 'fight' } });
    case 'concede':
      // Leaving them the lot is a good turn; backing down after a threat is only backing down.
      return dispute.stage === 'refused'
        ? close(state, outing, dispute, { outcome: 'backed_down' })
        : close(state, outing, dispute, { outcome: 'conceded', standing: WARMER[who.standing] });
    default:
      return err({ code: 'not_offered' });
  }
}

function actOnAmbush(state: GameState, outing: Outing, ambush: Ambush, action: Action): Result<Step, EncounterError> {
  const H = ENCOUNTER.hours;

  if (ambush.stage === 'fight') {
    if (action.type === 'throw' || action.type === 'pay') return err({ code: 'not_offered' });
    const played = playExchange(ambush.fight, action.type as FightMove);
    if (!played) return err({ code: 'not_offered' });
    if (!played.end) return going({ ...state, encounter: { ...ambush, fight: played.fight } }, played.exchange);
    // Getting away keeps everything; a stand-off costs half of what they asked; giving up costs it all, and they choose.
    const pieces = played.end === 'won' ? 0 : played.end === 'split' ? Math.ceil(ambush.toll / 2) : ambush.toll;
    return close(state, outing, ambush, {
      outcome: played.end === 'won' ? 'held' : played.end === 'split' ? 'robbed_half' : 'robbed',
      lost: seize(outing.trunk, pieces, ambush.accepts),
      hours: fightHours(played.fight.blows),
      rival: ambush.member,
      exchange: played.exchange,
    });
  }

  const offered = choicesOf(state).find((c) => c.id === action.type);
  if (!offered) return err({ code: 'not_offered' });
  if (offered.blocked) return err(offered.blocked);

  switch (action.type) {
    case 'pay': {
      const payment = action.payment;
      const valid =
        units(payment) === ambush.toll &&
        RESOURCE_IDS.every((id) => {
          const n = payment[id] ?? 0;
          return Number.isInteger(n) && n >= 0 && (n === 0 || ambush.accepts.includes(id));
        });
      if (!valid) return err({ code: 'bad_payment' });
      if (!covers(outing.trunk, payment)) return err({ code: 'cannot_pay', missing: missing(outing.trunk, payment) });
      return close(state, outing, ambush, { outcome: 'paid', lost: payment, rival: ambush.member });
    }
    case 'bargain':
      return close(state, outing, ambush, { outcome: 'bargained', lost: ambush.need, hours: H.bargain, rival: ambush.member });
    case 'favor':
      // The favour is spent: they are quits.
      return close(state, outing, ambush, { outcome: 'waved', rival: ambush.member, standing: 'stranger' });
    case 'detour':
      return close(state, outing, ambush, { outcome: 'detour', hours: ambush.detourHours, rival: null });
    case 'defend':
      // Whoever the player knows in the group was there to see it.
      return going({
        ...state,
        encounter: { ...ambush, stage: 'fight' },
        people: ambush.member ? setPerson(state, ambush.member, { standing: 'grudge', fought: true }) : state.people,
      });
    default:
      return err({ code: 'not_offered' });
  }
}

/** Applies one decision of the player to the encounter in progress. */
export function act(state: GameState, action: Action): Result<Step, EncounterError> {
  const { encounter, outing } = state;
  if (state.phase !== 'day' || !encounter || !outing) return err({ code: 'no_encounter' });
  return encounter.kind === 'dispute' ? actOnDispute(state, outing, encounter, action) : actOnAmbush(state, outing, encounter, action);
}

/**
 * Settles a dispute the player drives away from: the rival keeps the lot. A wager or a scuffle
 * already started is lost, with the daylight it was given.
 */
export function walkAway(state: GameState): Result<Step, EncounterError> {
  const { encounter, outing } = state;
  if (!encounter || !outing || encounter.kind !== 'dispute') return err({ code: 'no_encounter' });
  if (encounter.stage === 'game') return close(state, outing, encounter, { outcome: 'game_lost', hours: ENCOUNTER.hours.game });
  return act(state, { type: encounter.stage === 'fight' ? 'yield' : 'concede' });
}
