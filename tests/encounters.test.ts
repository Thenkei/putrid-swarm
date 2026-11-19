import { describe, expect, it } from 'vitest';
import { radioAppraisal } from '../src/core/appraisal';
import { HARDWARE_SPRING_BIN, LOCATIONS } from '../src/core/data/locations';
import { ENCOUNTER, WASHERS } from '../src/core/data/rivals';
import { NO_STOCK, act, choicesOf, fightHours, greetingOf, seize, splitLot, units, washerScore, type Action, type Step } from '../src/core/encounters';
import { arriveHome, leaveLocation, newGame, searchSpot, startNextDay, takeSpringReceipt, travelTo } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save';
import type { Ambush, Dispute, Fight, GameState, Inventory, Stance } from '../src/core/types';
import { RESOURCE_IDS } from '../src/core/types';

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
};
const fail = (r: { ok: true; value: unknown } | { ok: false; error: { code: string } }): string => {
  if (r.ok) throw new Error('expected an error');
  return r.error.code;
};

const stock = (patch: Partial<Inventory> = {}): Inventory => ({ ...NO_STOCK, ...patch });
const fight = (stances: Stance[] = ['guard', 'rush', 'falter']): Fight => ({ stances, exchange: 0, blows: 0, staggered: false });

/** At the hardware shop, the dealer standing at the spring bin. */
const disputed = (patch: Partial<Dispute> = {}, state: Partial<GameState> = {}): GameState => ({
  ...newGame(3),
  where: 'hardware',
  hoursLeft: 6,
  outing: { to: 'hardware', trunk: NO_STOCK, parted: NO_STOCK, major: true, marks: [] },
  encounter: {
    kind: 'dispute',
    rival: 'dealer',
    location: 'hardware',
    spot: 2,
    lot: { springs: 3, scrap: 1 },
    price: { wood: 3 },
    yields: false,
    plays: true,
    stage: 'open',
    game: { theirs: [0.7, 0.6, 0.2], yours: [] },
    fight: fight(),
    ...patch,
  },
  ...state,
});

/** On day 2 at the grocery, about to drive home with this in the boot. */
const loaded = (trunk: Partial<Inventory>, state: Partial<GameState> = {}): GameState => ({
  ...newGame(3),
  day: 2,
  where: 'grocery',
  hoursLeft: 6,
  outing: { to: 'grocery', trunk: stock(trunk), parted: NO_STOCK, major: false, marks: [] },
  ...state,
});

const stopped = (trunk: Partial<Inventory>, state: Partial<GameState> = {}): GameState => {
  const out = unwrap(leaveLocation(loaded(trunk, state))).state;
  if (out.encounter?.kind !== 'ambush') throw new Error('expected a roadblock');
  return out;
};

const play = (state: GameState, ...actions: Action[]): Step => {
  let step: Step = { state, resolution: null, exchange: null };
  for (const action of actions) step = unwrap(act(step.state, action));
  return step;
};

const trunkOf = (state: GameState): Inventory => state.outing?.trunk ?? NO_STOCK;

describe('Le Dernier Prix', () => {
  it('keeps the radio clue and guesses stable after a reload and resolves each outcome once', () => {
    const offered = disputed();
    const begun = play(offered, { type: 'appraise' }).state;
    const loaded = deserialize(serialize(begun))!;
    expect(loaded).toEqual(begun);
    expect(fail(searchSpot(loaded, 0))).toBe('busy');
    expect(fail(act(loaded, { type: 'estimate', francs: -1 }))).toBe('not_offered');
    const round = radioAppraisal(loaded, loaded.encounter as Dispute);
    expect(round).toEqual(radioAppraisal(begun, begun.encounter as Dispute));
    for (const [guess, outcome, springs] of [
      [round.correct, 'game_won', 3],
      [round.dealer, 'game_tied', 1],
      [round.correct + 10, 'game_lost', 0],
    ] as const) {
      const result = play(loaded, { type: 'estimate', francs: guess });
      expect(result.resolution).toMatchObject({ outcome, appraisal: { correct: round.correct, yours: guess } });
      expect(trunkOf(result.state).springs).toBe(springs);
      expect(result.state.hoursLeft).toBe(offered.hoursLeft - ENCOUNTER.hours.game);
      expect(fail(act(result.state, { type: 'estimate', francs: guess }))).toBe('no_encounter');
      expect(choicesOf(disputed({}, { flags: result.state.flags })).some(choice => choice.id === 'appraise')).toBe(false);
    }
  });

  it('leaves a started wager to the dealer when driving away', () => {
    const begun = play(disputed(), { type: 'appraise' }).state;
    const left = unwrap(leaveLocation(begun));
    expect(left.forfeit?.outcome).toBe('game_lost');
    expect(trunkOf(left.state)).toEqual(NO_STOCK);
    expect(left.state.hoursLeft).toBe(begun.hoursLeft - ENCOUNTER.hours.game - LOCATIONS.hardware.travelHours);
  });
});

describe('lots', () => {
  it('shares a lot piece by piece, rarest first, the rival picking first', () => {
    expect(splitLot({ springs: 3, scrap: 1 })).toEqual({ theirs: { springs: 2 }, yours: { springs: 1, scrap: 1 } });
    expect(splitLot({ wood: 6 })).toEqual({ theirs: { wood: 3 }, yours: { wood: 3 } });
    const lot = { battery: 1, scrap: 3 };
    const { yours, theirs } = splitLot(lot);
    expect(units(yours) + units(theirs)).toBe(units(lot));
    expect(theirs.battery).toBe(1);
  });

  it('scores a washer by how close to the tin it lands', () => {
    expect(washerScore(WASHERS.tin)).toBe(2);
    expect(washerScore(WASHERS.tin + WASHERS.tinHalf)).toBe(2);
    expect(washerScore(WASHERS.tin - WASHERS.ringHalf)).toBe(1);
    expect(washerScore(0.2)).toBe(0);
    expect(washerScore(WASHERS.end)).toBe(0);
    expect(washerScore(1)).toBe(0);
  });

  it('a group helping itself takes what there is most of, and only what it accepts', () => {
    expect(seize(stock({ wood: 5, springs: 2 }), 3, RESOURCE_IDS)).toEqual({ wood: 3 });
    expect(seize(stock({ wood: 5, springs: 2 }), 3, ['springs', 'battery'])).toEqual({ springs: 2 });
  });
});

describe('meeting someone at a lot', () => {
  it('lets the player keep the wire once and follow the marked springs to the dealer', () => {
    const first = unwrap(travelTo(newGame(7), 'hardware')).state;
    const searched = unwrap(searchSpot(first, 0)).state;
    const home = unwrap(arriveHome(unwrap(leaveLocation(searched)).state)).state;
    const dayTwo = startNextDay({ ...home, phase: 'morning', rng: 7, flags: { disputes: 1 } });
    const shop = unwrap(travelTo(dayTwo, 'hardware')).state;
    expect(shop.locations.hardware.looted).toEqual([HARDWARE_SPRING_BIN]);
    expect(shop.springReceipt).toBe('left');
    expect(trunkOf(shop)).toEqual(NO_STOCK);

    const savedShop = deserialize(serialize(shop))!;
    const receipt = takeSpringReceipt(savedShop);
    expect(receipt.springReceipt).toBe('held');
    expect(trunkOf(receipt)).toEqual(stock({ wire: 1 }));
    expect(receipt.hoursLeft).toBe(shop.hoursLeft);
    expect(takeSpringReceipt(deserialize(serialize(receipt))!)).toEqual(receipt);
    const unloaded = unwrap(arriveHome(unwrap(leaveLocation(receipt)).state));
    expect(unloaded.brought).toEqual(stock({ wire: 1 }));

    // Seed 4 would miss a normal repeat encounter. The receipt brings up the dealer.
    const nextTrip = { ...unloaded.state, rng: 4 };
    expect(unwrap(travelTo({ ...nextTrip, springReceipt: 'none' }, 'grocery')).state.encounter).toBeNull();
    const market = unwrap(travelTo(nextTrip, 'grocery')).state;
    expect(market.encounter).toMatchObject({ kind: 'dispute', rival: 'dealer', stage: 'open' });
    expect(choicesOf(market).some((choice) => choice.id === 'showReceipt')).toBe(true);
    expect(fail(act({ ...market, springReceipt: 'none' }, { type: 'showReceipt' }))).toBe('not_offered');

    const leftUnshown = unwrap(arriveHome(unwrap(leaveLocation(market)).state)).state;
    const later = startNextDay({ ...leftUnshown, phase: 'morning', rng: 4 });
    expect(later.springReceipt).toBe('held');
    expect(unwrap(travelTo(later, 'grocery')).state.encounter).toBeNull();
    const ordinaryMeeting = unwrap(travelTo({ ...later, rng: 7 }, 'grocery')).state;
    expect(ordinaryMeeting.encounter).toMatchObject({ kind: 'dispute', rival: 'dealer' });
    expect(choicesOf(ordinaryMeeting).some((choice) => choice.id === 'showReceipt')).toBe(true);

    const { state: answered, resolution } = unwrap(act(market, { type: 'showReceipt' }));
    expect(resolution).toBeNull();
    expect(answered).toMatchObject({ springReceipt: 'answered', encounter: { ...market.encounter, receiptAnswered: true } });
    expect(answered.outing).toBe(market.outing);
    expect(answered.hoursLeft).toBe(market.hoursLeft);
    expect(deserialize(serialize(answered))).toEqual(answered);
    expect(fail(act(answered, { type: 'showReceipt' }))).toBe('not_offered');
    expect(act(answered, { type: 'share' }).ok).toBe(true);
  });

  it('lets the first rummage go undisturbed, then puts the dealer on the best lot left', () => {
    const first = unwrap(travelTo(newGame(1), 'hardware')).state;
    expect(first.encounter).toBeNull();

    const searched = unwrap(searchSpot(first, 0)).state;
    const home = unwrap(arriveHome(unwrap(leaveLocation(searched)).state)).state;
    const back = unwrap(travelTo(home, 'hardware')).state;
    const dispute = back.encounter;
    expect(dispute).toMatchObject({ kind: 'dispute', rival: 'dealer', location: 'hardware', stage: 'open' });
    if (dispute?.kind !== 'dispute') throw new Error('expected a dispute');
    // The spring bin is the most precious thing in the shop.
    expect(LOCATIONS.hardware.spots[dispute.spot]?.key).toBe('springbin');
    expect(units(dispute.lot)).toBeGreaterThan(0);
    expect(fail(searchSpot(back, dispute.spot))).toBe('disputed');
    // Everything else in the shop is still there for the taking.
    expect(searchSpot(back, 1).ok).toBe(true);
  });

  it('leaves the neighbours to do their own talking while they are at home', () => {
    const state = { ...newGame(1), totals: { kills: 0, triggers: 0, searches: 5 } };
    expect(unwrap(travelTo(state, 'garage')).state.encounter).toBeNull();
  });

  it('is the same meeting for the same seed', () => {
    const state = { ...newGame(9), totals: { kills: 0, triggers: 0, searches: 1 } };
    expect(unwrap(travelTo(state, 'hardware')).state.encounter).toEqual(unwrap(travelTo(state, 'hardware')).state.encounter);
  });

  it('does not bring the rival or the lot back when the player leaves and returns', () => {
    const state = { ...newGame(1), totals: { kills: 0, triggers: 0, searches: 1 } };
    const there = unwrap(travelTo(state, 'hardware')).state;
    const spot = (there.encounter as Dispute).spot;
    const left = unwrap(leaveLocation(there));
    expect(left.forfeit).toMatchObject({ outcome: 'conceded', gained: {} });
    const again = unwrap(travelTo(unwrap(arriveHome(left.state)).state, 'hardware')).state;
    expect(again.encounter).toBeNull();
    expect(again.locations.hardware.searched).toContain(spot);
    expect(fail(searchSpot(again, spot))).toBe('already_searched');
  });

  it('never stages more than two encounters with something at stake in a day', () => {
    let state: GameState = { ...newGame(4), day: 6, totals: { kills: 0, triggers: 0, searches: 9 } };
    let met = 0;
    for (const id of ['hardware', 'grocery', 'shed', 'garage', 'hardware', 'grocery'] as const) {
      const there = unwrap(travelTo({ ...state, hoursLeft: 12 }, id)).state;
      if (there.encounter) met++;
      const left = unwrap(leaveLocation(there)).state;
      if (left.encounter) {
        met++;
        state = unwrap(arriveHome(play(left, { type: 'detour' }).state)).state;
      } else state = unwrap(arriveHome(left)).state;
    }
    expect(met).toBeLessThanOrEqual(ENCOUNTER.majorsPerDay);
    expect(state.flags['majors:6'] ?? 0).toBeLessThanOrEqual(ENCOUNTER.majorsPerDay);
  });
});

describe('settling a dispute', () => {
  it('sharing splits the lot, costs a quarter of an hour and empties the spot', () => {
    const state = disputed();
    const { state: next, resolution } = play(state, { type: 'share' });
    expect(resolution).toMatchObject({ outcome: 'shared', gained: { springs: 1, scrap: 1 }, theirs: { springs: 2 }, hours: 0.25 });
    expect(trunkOf(next)).toEqual(stock({ springs: 1, scrap: 1 }));
    expect(next.hoursLeft).toBe(state.hoursLeft - 0.25);
    expect(next.encounter).toBeNull();
    expect(next.locations.hardware.searched).toContain(2);
    expect(next.inventory).toEqual(state.inventory);
  });

  it('cannot be settled twice', () => {
    const { state: next } = play(disputed(), { type: 'share' });
    expect(fail(act(next, { type: 'share' }))).toBe('no_encounter');
    expect(fail(act(next, { type: 'trade' }))).toBe('no_encounter');
  });

  it('trades from the boot only: the refuge’s stock cannot pay', () => {
    const empty = disputed();
    expect(empty.inventory.wood).toBeGreaterThanOrEqual(3);
    expect(choicesOf(empty).find((c) => c.id === 'trade')?.blocked).toEqual({ code: 'cannot_pay', missing: { wood: 3 } });
    expect(fail(act(empty, { type: 'trade' }))).toBe('cannot_pay');

    const stocked = disputed({}, { outing: { to: 'hardware', trunk: stock({ wood: 5 }), parted: NO_STOCK, major: true, marks: [] } });
    const { state: next, resolution } = play(stocked, { type: 'trade' });
    expect(resolution).toMatchObject({ outcome: 'traded', gained: { springs: 3, scrap: 1 }, lost: { wood: 3 }, theirs: {} });
    expect(trunkOf(next)).toEqual(stock({ wood: 2, springs: 3, scrap: 1 }));
    expect(next.outing?.parted).toEqual(stock({ wood: 3 }));
    expect(next.inventory).toEqual(stocked.inventory);
  });

  it('a wager is won, tied or lost on the washers, the rival’s throws being set beforehand', () => {
    // Theirs: 2 + 1 + 0 = 3 points.
    const game = play(disputed(), { type: 'play' }).state;
    expect(game.encounter).toMatchObject({ stage: 'game' });
    expect(choicesOf(game)).toEqual([]);
    expect(fail(act(game, { type: 'share' }))).toBe('not_offered');

    const tin = { type: 'throw', aim: WASHERS.tin } as const;
    const wide = { type: 'throw', aim: 0.05 } as const;
    const ring = { type: 'throw', aim: WASHERS.tin + WASHERS.ringHalf - 0.01 } as const;

    const won = play(game, tin, tin, wide);
    expect(won.resolution).toMatchObject({ outcome: 'game_won', gained: { springs: 3, scrap: 1 }, hours: 0.5 });
    const tied = play(game, tin, ring, wide);
    expect(tied.resolution).toMatchObject({ outcome: 'game_tied', gained: { springs: 1, scrap: 1 } });
    const lost = play(game, ring, wide, wide);
    expect(lost.resolution).toMatchObject({ outcome: 'game_lost', gained: {}, theirs: { springs: 3, scrap: 1 } });
    // A wager kept leaves nobody's opinion changed.
    expect(lost.resolution?.standing).toMatchObject({ before: 'stranger', after: 'stranger' });
  });

  it('a reload in the middle of a wager resumes the same game, throws included', () => {
    const mid = play(disputed(), { type: 'play' }, { type: 'throw', aim: 0.3 }).state;
    const reloaded = deserialize(serialize(mid));
    expect(reloaded).toEqual(mid);
    expect((reloaded?.encounter as Dispute).game).toEqual({ theirs: [0.7, 0.6, 0.2], yours: [0.3] });
  });

  it('a threat makes the nervous give way and everybody remember', () => {
    const jumpy = disputed({ rival: 'camper', yields: true, plays: false });
    const { state: next, resolution } = play(jumpy, { type: 'threaten' });
    expect(resolution).toMatchObject({ outcome: 'scared', gained: { springs: 3, scrap: 1 }, hours: 0.25, standing: { rival: 'camper', before: 'stranger', after: 'grudge' } });
    expect(next.people.camper).toEqual({ standing: 'grudge', met: 1, fought: false });
    expect(greetingOf(next.people.camper!)).toBe('threat');
  });

  it('a threat that fails costs no daylight but leaves only backing down or a scuffle', () => {
    const state = disputed();
    const refused = play(state, { type: 'threaten' });
    expect(refused.resolution).toBeNull();
    expect(refused.state.encounter).toMatchObject({ stage: 'refused' });
    expect(refused.state.hoursLeft).toBe(state.hoursLeft);
    expect(refused.state.people.dealer?.standing).toBe('grudge');
    expect(choicesOf(refused.state).map((c) => c.id)).toEqual(['fight', 'concede']);

    const backed = play(refused.state, { type: 'concede' });
    expect(backed.resolution).toMatchObject({ outcome: 'backed_down', gained: {}, hours: 0 });
    expect(backed.state.people.dealer?.standing).toBe('grudge');
  });

  it('a scuffle is three exchanges at most, each move doing exactly what it announced', () => {
    const start = play(disputed({ fight: fight(['guard', 'rush', 'guard']) }), { type: 'threaten' }, { type: 'fight' }).state;
    // Against a guard: wrench it away for two blows, shove for one and an opening, or wait.
    expect(choicesOf(start).map((c) => [c.id, c.move?.blows, c.move?.wins, c.move?.opening])).toEqual([
      ['grab', 2, true, false],
      ['shove', 1, false, true],
      ['wait', 0, false, false],
      ['yield', 0, false, false],
    ]);

    const forced = play(start, { type: 'grab' });
    expect(forced.resolution).toMatchObject({ outcome: 'fight_won', gained: { springs: 3, scrap: 1 }, hours: fightHours(2) });
    expect(forced.state.people.dealer).toMatchObject({ standing: 'grudge', fought: true });

    // Shove, then take what is left unguarded.
    const shoved = play(start, { type: 'shove' });
    expect(shoved.exchange).toMatchObject({ stance: 'guard', blows: 1, opening: true });
    expect(choicesOf(shoved.state).map((c) => c.id)).toEqual(['grab', 'yield']);
    expect(play(shoved.state, { type: 'grab' }).resolution).toMatchObject({ outcome: 'fight_won', hours: fightHours(1) });

    // Wait for her to come at you, take the blow and the crate. Shoving someone who is already coming is not on offer.
    const waited = play(start, { type: 'wait' });
    expect(choicesOf(waited.state).map((c) => c.id)).toEqual(['grab', 'wait', 'yield']);
    expect(fail(act(waited.state, { type: 'shove' }))).toBe('not_offered');
    expect(play(waited.state, { type: 'grab' }).resolution).toMatchObject({ outcome: 'fight_won', hours: fightHours(1) });
    // Wait it out: nobody has it after three exchanges, so it is split.
    const split = play(start, { type: 'wait' }, { type: 'wait' }, { type: 'wait' });
    expect(split.resolution).toMatchObject({ outcome: 'fight_split', gained: { springs: 1, scrap: 1 }, hours: fightHours(0) });
    // Or let go.
    expect(play(start, { type: 'yield' }).resolution).toMatchObject({ outcome: 'fight_lost', gained: {} });
    expect(fightHours(9)).toBe(ENCOUNTER.hours.fightMax);
  });

  it('leaving the lot is a good turn, and the favour is called in once', () => {
    const conceded = play(disputed(), { type: 'concede' });
    expect(conceded.resolution).toMatchObject({ outcome: 'conceded', gained: {}, hours: 0, standing: { before: 'stranger', after: 'owes' } });

    const later = disputed({}, { people: conceded.state.people });
    expect(choicesOf(later)[0]).toMatchObject({ id: 'favor', gains: { springs: 3, scrap: 1 } });
    const called = play(later, { type: 'favor' });
    expect(called.resolution).toMatchObject({ outcome: 'favor', gained: { springs: 3, scrap: 1 }, standing: { before: 'owes', after: 'stranger' } });
    expect(choicesOf(disputed({}, { people: called.state.people })).some((c) => c.id === 'favor')).toBe(false);
    expect(fail(act(disputed(), { type: 'favor' }))).toBe('not_offered');
  });

  it('sharing settles a grudge but earns no favour', () => {
    const sour = disputed({ plays: false }, { people: { dealer: { standing: 'grudge', met: 1, fought: true } } });
    expect(choicesOf(sour).some((c) => c.id === 'play')).toBe(false);
    expect(fail(act(sour, { type: 'play' }))).toBe('not_offered');
    const shared = play(sour, { type: 'share' });
    expect(shared.state.people.dealer).toEqual({ standing: 'stranger', met: 2, fought: true });
    expect(play(disputed(), { type: 'share' }).state.people.dealer?.standing).toBe('stranger');
  });

  it('someone with a grudge has loaded their half before the player walks in, plays no more and asks more', () => {
    const base: GameState = { ...newGame(1), totals: { kills: 0, triggers: 0, searches: 1 } };
    const fresh = unwrap(travelTo(base, 'hardware')).state.encounter as Dispute;
    const sour = unwrap(travelTo({ ...base, people: { dealer: { standing: 'grudge', met: 1, fought: false } } }, 'hardware')).state.encounter as Dispute;
    expect(fresh.plays).toBe(true);
    expect(sour.plays).toBe(false);
    expect(sour.yields).toBe(false);
    expect(units(sour.lot)).toBeLessThan(units(fresh.lot));
    expect(units(sour.price)).toBeGreaterThanOrEqual(1);
  });

  it('refuses what there is no daylight left for, and always leaves a way out that costs nothing', () => {
    // A quarter of an hour to spare on top of the drive home.
    const tight = disputed({}, { hoursLeft: LOCATIONS.hardware.travelHours + 0.25 });
    const choices = choicesOf(tight);
    expect(choices.find((c) => c.id === 'share')?.blocked).toBeNull();
    expect(choices.find((c) => c.id === 'play')?.blocked).toEqual({ code: 'no_time', needed: 0.5 });
    expect(fail(act(tight, { type: 'play' }))).toBe('no_time');
    expect(choices.find((c) => c.id === 'concede')?.blocked).toBeNull();

    const none = disputed({}, { hoursLeft: LOCATIONS.hardware.travelHours });
    expect(choicesOf(none).filter((c) => !c.blocked).map((c) => c.id)).toEqual(['concede']);
    const refused = disputed({ stage: 'refused' }, { hoursLeft: LOCATIONS.hardware.travelHours + 0.5 });
    expect(choicesOf(refused).find((c) => c.id === 'fight')?.blocked).toEqual({ code: 'no_time', needed: 0.75 });
  });

  it('driving off in the middle of a wager or a scuffle forfeits it', () => {
    const game = play(disputed(), { type: 'play' }, { type: 'throw', aim: 0.7 }).state;
    expect(fail(searchSpot(game, 0))).toBe('busy');
    const left = unwrap(leaveLocation(game));
    expect(left.forfeit).toMatchObject({ outcome: 'game_lost', gained: {}, hours: 0.5 });
    expect(left.state.locations.hardware.searched).toContain(2);
    expect(left.state.hoursLeft).toBe(game.hoursLeft - 0.5 - LOCATIONS.hardware.travelHours);

    const scuffle = play(disputed({ fight: fight(['guard', 'guard', 'rush']) }), { type: 'threaten' }, { type: 'fight' }, { type: 'shove' }).state;
    expect(unwrap(leaveLocation(scuffle)).forfeit).toMatchObject({ outcome: 'fight_lost', hours: fightHours(1) });
  });
});

describe('the load is not safe until the refuge', () => {
  it('what is found rides in the boot and only joins the stock on arrival', () => {
    const start = newGame(1);
    const there = unwrap(travelTo(start, 'hardware')).state;
    const searched = unwrap(searchSpot(there, 0));
    expect(searched.state.inventory).toEqual(start.inventory);
    expect(trunkOf(searched.state).wood).toBe(searched.loot.wood);

    const road = unwrap(leaveLocation(searched.state)).state;
    expect(road.where).toBe('road');
    expect(road.inventory).toEqual(start.inventory);
    const arrival = unwrap(arriveHome(road));
    expect(arrival.brought.wood).toBe(searched.loot.wood);
    expect(arrival.state.inventory.wood).toBe(start.inventory.wood + (searched.loot.wood ?? 0));
    expect(arrival.state).toMatchObject({ where: 'home', outing: null });
    expect(fail(arriveHome(arrival.state))).toBe('not_on_road');
  });

  it('nobody bars the road on the first day, for a light boot, or after a dispute on the same outing', () => {
    expect(unwrap(leaveLocation(loaded({ wood: 9 }, { day: 1 }))).state.encounter).toBeNull();
    expect(unwrap(leaveLocation(loaded({ wood: ENCOUNTER.ambushMinLoad - 1 }))).state.encounter).toBeNull();
    const after = loaded({ wood: 9 });
    expect(unwrap(leaveLocation({ ...after, outing: { ...after.outing!, major: true } })).state.encounter).toBeNull();
  });

  it('the first roadblock is the neighbours’, asks for a third of the load and holds the break on the road', () => {
    const state = stopped({ wood: 6, springs: 3 });
    const ambush = state.encounter as Ambush;
    expect(ambush).toMatchObject({ group: 'committee', toll: 3, stage: 'open', member: null });
    expect(state.where).toBe('road');
    expect(fail(arriveHome(state))).toBe('encounter_pending');
    expect(choicesOf(state).map((c) => c.id)).toEqual(['pay', 'bargain', 'detour', 'defend']);
  });

  it('paying is choosing what to hand over: the right count, of things they accept, from the boot', () => {
    const state = stopped({ wood: 6, springs: 3 });
    expect(fail(act(state, { type: 'pay', payment: { wood: 2 } }))).toBe('bad_payment');
    expect(fail(act(state, { type: 'pay', payment: { wood: 4 } }))).toBe('bad_payment');
    expect(fail(act(state, { type: 'pay', payment: { battery: 3 } }))).toBe('cannot_pay');
    expect(fail(act(state, { type: 'pay', payment: { wood: 3.5, springs: -0.5 } }))).toBe('bad_payment');

    const paid = play(state, { type: 'pay', payment: { wood: 3 } });
    expect(paid.resolution).toMatchObject({ outcome: 'paid', lost: { wood: 3 }, hours: 0 });
    expect(trunkOf(paid.state)).toEqual(stock({ wood: 3, springs: 3 }));
    const arrival = unwrap(arriveHome(paid.state));
    expect(arrival.brought).toEqual(stock({ wood: 3, springs: 3 }));
    expect(arrival.parted).toEqual(stock({ wood: 3 }));
    expect(arrival.marks).toEqual([{ who: 'committee', outcome: 'paid' }]);
    expect(arrival.state.inventory.wood).toBe(state.inventory.wood + 3);
  });

  it('strangers with no use for planks say so, unless planks are all there is', () => {
    const seen = { ambushes: 1 };
    const pick = (trunk: Partial<Inventory>): Ambush => {
      for (let seed = 1; seed < 400; seed++) {
        const out = unwrap(leaveLocation(loaded(trunk, { day: 3, flags: seen, rng: seed }))).state.encounter;
        if (out?.kind === 'ambush' && out.group === 'van') return out;
      }
      throw new Error('no van found');
    };
    expect(pick({ wood: 4, scrap: 6 }).accepts).not.toContain('wood');
    expect(pick({ wood: 9 }).accepts).toContain('wood');
  });

  it('their one need settles it for less, the way round costs daylight, and neither touches the stock', () => {
    const state = stopped({ wood: 6, wire: 3 });
    const need = (state.encounter as Ambush).need;
    expect(need).toEqual({ wire: 1 });
    const bargained = play(state, { type: 'bargain' });
    expect(bargained.resolution).toMatchObject({ outcome: 'bargained', lost: { wire: 1 }, hours: 0.25 });

    const without = stopped({ wood: 9 });
    expect(choicesOf(without).find((c) => c.id === 'bargain')?.blocked).toMatchObject({ code: 'cannot_pay' });

    const round = play(state, { type: 'detour' });
    expect(round.resolution).toMatchObject({ outcome: 'detour', lost: {}, hours: 0.5 });
    expect(trunkOf(round.state)).toEqual(trunkOf(state));
    expect(round.state.hoursLeft).toBe(state.hoursLeft - 0.5);

    // Home with no daylight to spare: paying is the way out that is always there.
    const late = stopped({ wood: 6, wire: 3 }, { hoursLeft: LOCATIONS.grocery.travelHours });
    expect(late.hoursLeft).toBe(0);
    expect(choicesOf(late).filter((c) => !c.blocked).map((c) => c.id)).toEqual(['pay']);
    expect(fail(act(late, { type: 'detour' }))).toBe('no_time');
  });

  it('standing one’s ground keeps everything, half the toll or none of it', () => {
    const base = stopped({ wood: 6, springs: 3 });
    const state: GameState = { ...base, encounter: { ...(base.encounter as Ambush), fight: fight(['rush', 'guard', 'guard']) } };
    const held = play(state, { type: 'defend' }, { type: 'grab' });
    expect(held.resolution).toMatchObject({ outcome: 'held', lost: {}, hours: fightHours(1) });
    expect(trunkOf(held.state)).toEqual(trunkOf(state));

    const half = play(state, { type: 'defend' }, { type: 'wait' }, { type: 'wait' }, { type: 'wait' });
    expect(half.resolution).toMatchObject({ outcome: 'robbed_half', lost: { wood: 2 } });
    const robbed = play(state, { type: 'defend' }, { type: 'yield' });
    expect(robbed.resolution).toMatchObject({ outcome: 'robbed', lost: { wood: 3 } });
    expect(robbed.state.inventory).toEqual(state.inventory);
  });

  it('a face in the group remembers: a favour owed opens the road, a grudge raises the price', () => {
    const owed = stopped({ wood: 6, springs: 3 }, { people: { dealer: { standing: 'owes', met: 1, fought: false } } });
    expect(owed.encounter).toMatchObject({ member: 'dealer', memberStanding: 'owes', toll: 3 });
    const waved = play(owed, { type: 'favor' });
    expect(waved.resolution).toMatchObject({ outcome: 'waved', lost: {}, hours: 0, standing: { before: 'owes', after: 'stranger' } });

    const sour = stopped({ wood: 6, springs: 3 }, { people: { dealer: { standing: 'grudge', met: 1, fought: false } } });
    expect(sour.encounter).toMatchObject({ member: 'dealer', toll: 4 });
    expect(choicesOf(sour).some((c) => c.id === 'favor')).toBe(false);

    // Standing up to a group she is part of is not forgotten either.
    const fought = play(stopped({ wood: 6, springs: 3 }, { people: { dealer: { standing: 'stranger', met: 1, fought: false } } }), { type: 'defend' });
    expect(fought.state.people.dealer).toMatchObject({ standing: 'grudge' });
  });

  it('a save made at a roadblock resumes on the road with the same group and the same load', () => {
    const state = stopped({ wood: 6, springs: 3 });
    const reloaded = deserialize(serialize(state));
    expect(reloaded).toEqual(state);
    expect(fail(arriveHome(reloaded!))).toBe('encounter_pending');

    const guarded: GameState = { ...state, encounter: { ...(state.encounter as Ambush), fight: fight(['guard', 'rush', 'guard']) } };
    const mid = play(guarded, { type: 'defend' }, { type: 'wait' }).state;
    expect(mid.encounter).toMatchObject({ stage: 'fight', fight: { exchange: 1 } });
    expect(deserialize(serialize(mid))).toEqual(mid);
  });

  it('loads a save from before encounters, and drops an encounter it cannot trust', () => {
    const state = unwrap(travelTo(newGame(1), 'hardware')).state;
    const { outing: _outing, encounter: _encounter, people: _people, ...legacy } = state;
    const loadedLegacy = deserialize(JSON.stringify(legacy));
    expect(loadedLegacy).toMatchObject({ where: 'hardware', encounter: null, people: {}, outing: { to: 'hardware', trunk: NO_STOCK } });

    const road = stopped({ wood: 6, springs: 3 });
    const broken = deserialize(JSON.stringify({ ...road, encounter: { ...road.encounter, toll: -2 } }));
    expect(broken).toMatchObject({ where: 'road', encounter: null });
    expect(arriveHome(broken!).ok).toBe(true);

    const elsewhere = deserialize(JSON.stringify({ ...disputed(), where: 'grocery' }));
    expect(elsewhere?.encounter).toBeNull();
    expect(deserialize(JSON.stringify({ ...road, outing: { ...road.outing, trunk: { wood: -1 } } }))).toMatchObject({ where: 'home', outing: null });
  });

  it('a new day starts at the refuge with no trip in progress', () => {
    const morning: GameState = { ...newGame(1), phase: 'morning' };
    expect(startNextDay(morning)).toMatchObject({ where: 'home', outing: null, encounter: null });
  });
});

describe('every branch', () => {
  /** Plays every sequence of choices from a state, and checks what must hold at each end. */
  const explore = (state: GameState, check: (end: GameState, path: string[]) => void, path: string[] = []): number => {
    const encounter = state.encounter;
    if (!encounter) {
      check(state, path);
      return 1;
    }
    let actions: Action[];
    if (encounter.kind === 'dispute' && encounter.stage === 'game') {
      actions = [{ type: 'throw', aim: WASHERS.tin }, { type: 'throw', aim: 0.1 }];
    } else if (encounter.kind === 'dispute' && encounter.stage === 'price') {
      actions = radioAppraisal(state, encounter).bids.map(francs => ({ type: 'estimate', francs }));
    } else {
      actions = choicesOf(state).filter(c => !c.blocked).map((c): Action =>
        c.id === 'pay' ? { type: 'pay', payment: seize(trunkOf(state), (encounter as Ambush).toll, (encounter as Ambush).accepts) } : { type: c.id });
    }
    expect(actions.length).toBeGreaterThan(0);
    return actions.reduce((ends, action) => ends + explore(unwrap(act(state, action)).state, check, [...path, action.type]), 0);
  };

  it('of a dispute ends, keeps the drive home, and never reaches the refuge’s stock', () => {
    let total = 0;
    for (const hoursLeft of [0.75, 1, 1.25, 1.5, 6]) {
      for (const stances of [['guard', 'guard', 'guard'], ['rush', 'falter', 'guard'], ['falter', 'rush', 'rush']] as Stance[][]) {
        for (const yields of [false, true]) {
          const start = disputed({ yields, fight: fight(stances) }, { hoursLeft, outing: { to: 'hardware', trunk: stock({ wood: 4 }), parted: NO_STOCK, major: true, marks: [] }, people: { dealer: { standing: 'owes', met: 1, fought: false } } });
          total += explore(start, (end, path) => {
            expect(end.hoursLeft, path.join(' > ')).toBeGreaterThanOrEqual(LOCATIONS.hardware.travelHours - 1e-9);
            expect(end.inventory).toEqual(start.inventory);
            expect(end.locations.hardware.searched).toContain(2);
            for (const id of RESOURCE_IDS) expect(trunkOf(end)[id]).toBeGreaterThanOrEqual(0);
            // Nothing is made up: what is in the boot is what was there, plus at most the lot, less what was handed over.
            expect(units(trunkOf(end)) + units(end.outing!.parted)).toBeLessThanOrEqual(4 + 4);
            expect(leaveLocation(end).ok).toBe(true);
          });
        }
      }
    }
    expect(total).toBeGreaterThan(300);
  });

  it('of a roadblock ends before dark with a boot that only got lighter', () => {
    let total = 0;
    for (const hoursLeft of [0.75, 1, 1.5, 2, 6]) {
      for (const stances of [['guard', 'guard', 'guard'], ['rush', 'falter', 'guard']] as Stance[][]) {
        const base = stopped({ wood: 5, wire: 2, battery: 2 }, { hoursLeft, people: { dealer: { standing: 'owes', met: 1, fought: false } } });
        const start: GameState = { ...base, encounter: { ...(base.encounter as Ambush), fight: fight(stances) } };
        total += explore(start, (end, path) => {
          expect(end.hoursLeft, path.join(' > ')).toBeGreaterThanOrEqual(-1e-9);
          expect(end.inventory).toEqual(start.inventory);
          for (const id of RESOURCE_IDS) {
            expect(trunkOf(end)[id]).toBeGreaterThanOrEqual(0);
            expect(trunkOf(end)[id]).toBeLessThanOrEqual(trunkOf(start)[id]);
          }
          expect(units(trunkOf(end)) + units(end.outing!.parted)).toBe(units(trunkOf(start)));
          // The worst that can happen is the toll they announced.
          expect(units(end.outing!.parted)).toBeLessThanOrEqual((start.encounter as Ambush).toll);
          expect(arriveHome(end).ok).toBe(true);
        });
      }
    }
    expect(total).toBeGreaterThan(60);
  });
});
