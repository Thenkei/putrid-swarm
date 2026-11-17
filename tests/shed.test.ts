import { describe, expect, it } from 'vitest';
import { chapterOfFate, chapterWaiting, dawnOf } from '../src/core/chapters';
import { BOSS } from '../src/core/data/enemies';
import { BOSS_NIGHT, DAY_HOURS } from '../src/core/data/locations';
import { concludeNight, newGame, retryChapter, settleOrchard, settleShed, startNextDay, startNight } from '../src/core/game';
import { NightSim } from '../src/core/night';
import { ORCHARD } from '../src/core/orchard';
import { deserialize, serialize } from '../src/core/save';
import {
  NOTHING_HELD,
  SHED,
  awaitsShed,
  briefingFor,
  canAsk,
  hoursInside,
  nightBySector,
  press,
  promptsOf,
  pullOf,
  resultOf,
  shedDawn,
  startShed,
  tick,
  zoneOf,
  type Cue,
  type Held,
  type Place,
  type Press,
  type Question,
  type Shed,
  type ShedResult,
} from '../src/core/shed';
import type { GameState, NightReport } from '../src/core/types';
import { layout, operate } from './operator';

const STEP = 1 / 60;
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
};

/** Plays the scene: time passing with keys held, and key presses, collecting what it says happened. */
class Player {
  shed: Shed = startShed();
  readonly cues: Cue[] = [];

  hold(seconds: number, held: Partial<Held> = {}): this {
    const keys: Held = { ...NOTHING_HELD, ...held };
    for (let t = 0; t < Math.round(seconds / STEP); t++) this.apply(tick(this.shed, STEP, keys));
    return this;
  }

  /** Holds until `done`, and fails rather than spin if it never comes. */
  until(done: (shed: Shed) => boolean, held: Partial<Held> = {}, limit = 60): this {
    const keys: Held = { ...NOTHING_HELD, ...held };
    for (let t = 0; t < limit / STEP && !done(this.shed); t++) this.apply(tick(this.shed, STEP, keys));
    if (!done(this.shed)) throw new Error(`never got there: ${JSON.stringify(this.shed)}`);
    return this;
  }

  press(...keys: Press[]): this {
    for (const key of keys) this.apply(press(this.shed, key));
    return this;
  }

  private apply(turn: { shed: Shed; cues: readonly Cue[] }): void {
    this.shed = turn.shed;
    this.cues.push(...turn.cues);
  }

  said(type: Cue['type']): boolean {
    return this.cues.some((cue) => cue.type === type);
  }

  // The scene's set pieces, as a player would do them.
  walkIn(): this {
    return this.until((s) => s.beat === 'play', { forward: true });
  }
  walkTo(place: Place): this {
    const order: Place[] = ['bench', 'post', 'shelf'];
    if (this.shed.close) this.press('down');
    if (this.shed.place === place) return this;
    const key = order.indexOf(place) < order.indexOf(this.shed.place) ? 'left' : 'right';
    return this.until((s) => s.place === place && s.heading === null, { [key]: true });
  }
  /** Sits out of reach until he has calmed down as far as silence takes him. */
  sit(): this {
    this.walkTo('post');
    const ceiling = this.shed.named ? SHED.silenceNamedCeiling : SHED.silenceCeiling;
    return this.until((s) => s.presence >= ceiling - 1e-9, { act: true });
  }
  crouch(): this {
    return this.until((s) => s.close || s.beat !== 'play', { forward: true });
  }
  fetch(item: 'bowl' | 'flour' | 'leads' | 'hammer'): this {
    this.walkTo(item === 'bowl' || item === 'flour' ? 'shelf' : 'bench');
    return this.press(item === 'bowl' || item === 'leads' ? 'act' : 'up');
  }
  /** Water until he is as high as water takes him, or the bowl is empty. */
  water(): this {
    if (this.shed.holding !== 'bowl') this.fetch('bowl');
    else if (this.shed.water < 1) this.walkTo('shelf').press('act');
    this.walkTo('post').crouch();
    return this.until((s) => s.beat !== 'play' || s.presence >= SHED.waterCeiling - 1e-9 || s.water === 0, { act: true });
  }
  /** Through the flash, if it comes. */
  waitFlash(): this {
    return this.until((s) => s.beat !== 'flash');
  }
  ask(question: Question): this {
    return this.press(`ask_${question}`);
  }
  /** Lets an answer run to its end, standing back if he goes for it. */
  listen(stepBack = true): this {
    this.until((s) => s.beat !== 'answer');
    if (this.shed.beat === 'lunge' && stepBack) this.press('down');
    return this;
  }
  /** Puts back whatever is in hand, where it belongs. */
  emptyHands(): this {
    const item = this.shed.holding;
    if (item === null) return this;
    this.walkTo(item === 'bowl' || item === 'flour' ? 'shelf' : 'bench');
    const key: Press = item === 'bowl' || item === 'leads' ? 'act' : 'up';
    // A bowl that is not full is filled first.
    for (let i = 0; i < 2 && this.shed.holding !== null; i++) this.press(key);
    return this;
  }
  wire(): this {
    return this.fetch('leads').walkTo('post').press('act');
  }
  /** The current, held until he reaches `to`. */
  shock(to: number): this {
    this.walkTo('bench');
    return this.until((s) => s.presence >= to || s.beat !== 'play', { act: true });
  }
}

describe('the shed: walking in on him', () => {
  it('reaches the post by walking, and not by waiting', () => {
    expect(new Player().hold(10).shed.beat).toBe('arrive');
    const player = new Player().walkIn();
    expect(player.shed).toMatchObject({ beat: 'play', place: 'post', presence: SHED.start });
    expect(player.cues).toContainEqual({ type: 'arrived', place: 'post' });
    // The walk to the door does not count against the daylight; what follows does.
    expect(player.shed.elapsed).toBe(0);
  });

  it('offers to crouch by him, to sit down, to leave, and the bench and the shelf', () => {
    const ids = promptsOf(new Player().walkIn().shed).map((p) => p.id);
    expect(ids).toEqual(['approach', 'silence', 'leave', 'go_left', 'go_right']);
  });

  it('offers the leads and the hammer at the bench, the bowl and the flour at the shelf, one thing in hand at a time', () => {
    const player = new Player().walkIn().walkTo('bench');
    expect(promptsOf(player.shed).map((p) => p.id)).toEqual(['take_leads', 'take_hammer', 'go_right']);
    player.press('up');
    expect(player.shed.holding).toBe('hammer');
    expect(promptsOf(player.shed).map((p) => p.id)).toEqual(['take_leads', 'put_hammer', 'go_right']);
    // Taking the other one puts the first back where it was.
    player.press('act');
    expect(player.shed.holding).toBe('leads');
    expect(player.cues.slice(-2)).toEqual([
      { type: 'put', what: 'hammer' },
      { type: 'took', what: 'leads' },
    ]);
    player.press('act').walkTo('shelf');
    expect(promptsOf(player.shed).map((p) => p.id)).toEqual(['take_bowl', 'take_flour', 'go_left']);
    player.press('act');
    expect(player.shed).toMatchObject({ holding: 'bowl', water: 1 });
    expect(promptsOf(player.shed).map((p) => p.id)).toEqual(['put_bowl', 'take_flour', 'go_left']);
    // Nothing from the bench can be picked up with the bowl in hand.
    player.walkTo('bench');
    expect(promptsOf(player.shed).map((p) => p.id)).toEqual(['go_right']);
    player.press('act', 'up');
    expect(player.shed.holding).toBe('bowl');
  });

  it('undoes the steps of a walk that is let go', () => {
    const player = new Player().walkIn().hold(0.6, { left: true });
    expect(player.shed.heading).toBe('bench');
    player.hold(2);
    expect(player.shed).toMatchObject({ place: 'post', heading: null, walk: 0 });
  });

  it('lets the virus have him when nobody does anything', () => {
    const player = new Player().walkIn().hold(5);
    expect(player.shed.presence).toBeLessThan(SHED.start);
    expect(zoneOf(player.shed.presence)).toBe('feral');
  });

  it('can be left as it is, any time, from the post', () => {
    const player = new Player().walkIn().until((s) => s.beat === 'over', { back: true });
    expect(player.shed.ending).toBe('chained');
    expect(player.shed.trail).toEqual(['left']);
    const result = resultOf(player.shed) as ShedResult;
    expect(result).toEqual({ ending: 'chained', learned: [], hours: hoursInside(player.shed.elapsed) });
    expect(result.hours).toBe(1);
  });
});

describe('the shed: getting close', () => {
  it('goes for whoever crouches by him while he is only the virus', () => {
    const player = new Player().walkIn().crouch();
    expect(player.shed.beat).toBe('lunge');
    expect(player.said('lunge')).toBe(true);
    expect(promptsOf(player.shed).map((p) => p.id)).toEqual(['dodge']);
  });

  it('bites whoever does not step back in time', () => {
    const player = new Player().walkIn().crouch().hold(SHED.lungeSeconds + 0.05).press('down');
    expect(player.shed).toMatchObject({ beat: 'over', ending: 'bitten' });
    expect(player.shed.trail).toEqual(['late']);
    expect(resultOf(player.shed)?.ending).toBe('bitten');
  });

  it('misses whoever steps back, and what was in hand goes flying', () => {
    const player = new Player().walkIn().fetch('bowl').walkTo('post').crouch().hold(SHED.lungeSeconds * 0.6).press('down');
    expect(player.shed).toMatchObject({ beat: 'play', close: false, near: 0, holding: null, water: 0 });
    expect(player.cues).toContainEqual({ type: 'dodged', dropped: 'bowl' });
  });

  it('calms down for someone who sits still out of reach, but not as far as coming back', () => {
    const player = new Player().walkIn().sit();
    expect(player.shed.presence).toBeCloseTo(SHED.silenceCeiling, 5);
    expect(player.shed.presence).toBeLessThan(SHED.lucid);
    expect(player.shed.trail).toEqual(['sat']);
    // Nor with the hammer in hand.
    const armed = new Player().walkIn().fetch('hammer').walkTo('post');
    expect(promptsOf(armed.shed).map((p) => p.id)).not.toContain('silence');
  });

  it('can be crouched by once he is calm, and stood up from again', () => {
    const player = new Player().walkIn().sit().crouch();
    expect(player.shed).toMatchObject({ beat: 'play', close: true });
    expect(promptsOf(player.shed).map((p) => p.id)).toEqual(['step_back']);
    player.press('down');
    expect(player.shed).toMatchObject({ close: false, near: 0 });
  });

  it('stands back up when the crouch is let go halfway', () => {
    const player = new Player().walkIn().hold(SHED.approachSeconds * 0.5, { forward: true }).hold(2);
    expect(player.shed).toMatchObject({ near: 0, close: false, beat: 'play' });
  });
});

describe('the shed: bringing him back without hurting him', () => {
  it('comes back with water, and says who is waiting for him', () => {
    const player = new Player().walkIn().sit().water();
    expect(player.shed.beat).toBe('flash');
    expect(player.cues).toContainEqual({ type: 'flash', hurt: false });
    expect(player.shed.named).toBe(true);
    player.waitFlash();
    expect(player.shed.beat).toBe('play');
    expect(canAsk(player.shed)).toBe(true);
    expect(promptsOf(player.shed).map((p) => p.id)).toEqual(['ask_stash', 'ask_tonight', 'ask_chief', 'ask_first', 'give_water', 'step_back']);
  });

  it('holds still while he says it: the flash costs nothing', () => {
    const player = new Player().walkIn().sit().water();
    const at = player.shed.presence;
    player.waitFlash();
    expect(player.shed.presence).toBe(at);
  });

  it('answers in full when asked high enough, then the virus comes back, harder each time', () => {
    const player = new Player().walkIn().sit().water().waitFlash().water();
    expect(player.shed.presence).toBeCloseTo(SHED.waterCeiling, 5);
    const pull = pullOf(player.shed);
    player.ask('tonight');
    expect(player.shed).toMatchObject({ beat: 'answer', asking: 'tonight' });
    player.listen();
    expect(player.cues).toContainEqual({ type: 'answered', question: 'tonight' });
    expect(player.said('surge')).toBe(true);
    expect(player.shed.learned).toEqual(['tonight']);
    expect(pullOf(player.shed)).toBeGreaterThan(pull);
  });

  it('goes for whoever is still crouched when an answer ends', () => {
    const player = new Player().walkIn().sit().water().waitFlash().water().ask('stash').listen(false);
    expect(player.shed.beat).toBe('lunge');
    player.press('down');
    expect(player.shed).toMatchObject({ beat: 'play', close: false });
  });

  it('can be listened to from further back, out of reach', () => {
    const player = new Player().walkIn().sit().water().waitFlash().water().ask('stash').press('down').listen(false);
    expect(player.shed.beat).toBe('play');
    expect(player.shed.learned).toEqual(['stash']);
  });

  it('is cut off when the question comes too low, and nothing is learned', () => {
    // Up to the window and no further: the answer does not fit in it.
    const player = new Player().walkIn().sit().water().waitFlash();
    player.press('down').until((s) => s.presence < SHED.lucid + 0.02);
    player.ask('chief').listen();
    expect(player.cues).toContainEqual({ type: 'cut', question: 'chief', fragment: null });
    expect(player.shed.learned).toEqual([]);
    expect(player.shed.trail).toContain('cut');
  });

  it('never lets the first one out whole, and says a little more each time', () => {
    const player = new Player().walkIn().sit().water().waitFlash().water().ask('first').listen();
    expect(player.cues).toContainEqual({ type: 'cut', question: 'first', fragment: 1 });
    expect(player.shed.fragments).toBe(1);
    expect(player.shed.learned).toEqual([]);
  });

  it('takes him further with silence once he has named her, and higher still with flour', () => {
    const player = new Player().walkIn().sit().water().waitFlash().press('down').sit();
    expect(player.shed.presence).toBeCloseTo(SHED.silenceNamedCeiling, 5);
    expect(canAsk(player.shed)).toBe(true);
    player.fetch('flour').walkTo('post').crouch().press('act');
    expect(player.cues).toContainEqual({ type: 'floured' });
    expect(player.shed.holding).toBeNull();
    expect(player.shed.presence).toBeGreaterThan(SHED.waterCeiling);
    expect(player.shed.presence).toBeLessThanOrEqual(SHED.flourCeiling);
  });

  it('can be got through whole, all three answers, without the current', () => {
    const player = new Player().walkIn().sit().water().waitFlash();
    player.water().ask('tonight').listen();
    player.sit().ask('stash').press('down').listen();
    // The chief is the long one: flour first.
    player.sit().fetch('flour').walkTo('post').crouch().press('act').ask('chief').listen();
    expect(player.shed.learned).toEqual(['tonight', 'stash', 'chief']);
    expect(player.shed.hurt).toBe(false);
    expect(player.shed.remnant).toBe(1);
  });

  it('lets him go only while he is there, hands empty, and never hurt', () => {
    const player = new Player().walkIn().sit().water().waitFlash();
    // The bowl is still in hand.
    expect(promptsOf(player.shed).map((p) => p.id)).not.toContain('unlock');
    player.emptyHands();
    expect(player.shed.holding).toBeNull();
    player.sit().crouch();
    expect(promptsOf(player.shed).map((p) => p.id)).toContain('unlock');
    player.until((s) => s.beat === 'over', { act: true });
    expect(player.shed.ending).toBe('freed');
    expect(player.shed.trail).toEqual(['sat', 'watered', 'named', 'unlocked']);
  });
});

describe('the shed: the current', () => {
  it('needs the leads clipped to the chain, then the battery, from the bench', () => {
    const player = new Player().walkIn().walkTo('bench');
    expect(promptsOf(player.shed).map((p) => p.id)).not.toContain('current');
    player.wire();
    expect(player.shed).toMatchObject({ wired: true, holding: null });
    expect(player.said('wired')).toBe(true);
    player.walkTo('bench');
    expect(promptsOf(player.shed).map((p) => p.id)).toEqual(['current', 'take_hammer', 'go_right']);
  });

  it('brings him up fast, from out of reach, and costs what is left of him', () => {
    const player = new Player().walkIn().wire().shock(SHED.lucid);
    expect(player.shed.beat).toBe('flash');
    expect(player.cues).toContainEqual({ type: 'flash', hurt: true });
    expect(player.shed.hurt).toBe(true);
    expect(player.shed.remnant).toBeLessThan(1);
    expect(player.shed.elapsed).toBeLessThan(12);
  });

  it('wears him out much faster above the breaking point', () => {
    const careful = new Player().walkIn().wire().shock(SHED.breaking - 0.01).waitFlash();
    const careless = new Player().walkIn().wire().shock(SHED.breaking - 0.01).waitFlash().shock(1).hold(0.5, { act: true });
    expect(careless.shed.remnant).toBeLessThan(careful.shed.remnant - 0.2);
  });

  it('can get two answers out of him, quickly, and leaves no way to let him go', () => {
    const player = new Player().walkIn().wire().shock(0.8).waitFlash().shock(0.82).ask('stash').listen();
    player.shock(0.86).ask('tonight').listen();
    expect(player.shed.learned).toEqual(['stash', 'tonight']);
    expect(player.shed.remnant).toBeGreaterThan(0);
    player.walkTo('post').sit().crouch();
    expect(promptsOf(player.shed).map((p) => p.id)).not.toContain('unlock');
  });

  it('empties him when it is held too long', () => {
    const player = new Player().walkIn().wire().walkTo('bench').until((s) => s.beat !== 'play', { act: true }).waitFlash().until((s) => s.beat === 'over', { act: true });
    expect(player.shed.ending).toBe('emptied');
    expect(player.shed.remnant).toBe(0);
    expect(player.shed.trail).toEqual(['wired', 'shocked', 'named', 'emptied']);
  });
});

describe('the shed: ending it', () => {
  it('finishes him with the hammer, crouched by him', () => {
    const player = new Player().walkIn().sit().fetch('hammer').walkTo('post').crouch();
    expect(promptsOf(player.shed).map((p) => p.id)).toEqual(['strike', 'step_back']);
    player.press('act');
    expect(player.shed).toMatchObject({ beat: 'over', ending: 'finished' });
  });

  it('ignores everything once it is over', () => {
    const player = new Player().walkIn().until((s) => s.beat === 'over', { back: true });
    const after = player.shed;
    player.press('act', 'up', 'down', 'left', 'right', 'ask_stash').hold(5, { forward: true, act: true, back: true });
    expect(player.shed).toEqual(after);
  });
});

describe('the shed: what it costs the campaign', () => {
  it('counts the morning to the quarter hour, within bounds', () => {
    expect(hoursInside(0)).toBe(SHED.baseHours);
    expect(hoursInside(30)).toBe(1.75);
    expect(hoursInside(31)).toBe(2);
    expect(hoursInside(10_000)).toBe(SHED.maxHours);
  });

  it('adds the hole and the walk to the van', () => {
    const player = new Player().walkIn().sit().water().waitFlash().water().ask('stash').press('down').listen();
    player.sit().emptyHands().fetch('hammer').walkTo('post').crouch().press('act');
    const result = resultOf(player.shed) as ShedResult;
    expect(result.ending).toBe('finished');
    expect(result.hours).toBe(hoursInside(player.shed.elapsed) + SHED.digHours + SHED.stashHours);
  });

  it('costs more daylight the patient way than the quick one', () => {
    const patient = new Player().walkIn().sit().water().waitFlash().water().ask('tonight').press('down').listen();
    patient.walkTo('post').until((s) => s.beat === 'over', { back: true });
    const quick = new Player().walkIn().wire().shock(0.8).waitFlash().shock(0.82).ask('tonight').listen();
    quick.walkTo('post').until((s) => s.beat === 'over', { back: true });
    expect((resultOf(patient.shed) as ShedResult).hours).toBeGreaterThan((resultOf(quick.shed) as ShedResult).hours);
  });
});

// ───────────────────────────── In the campaign ─────────────────────────────

const report = (night: number, extra: Partial<NightReport> = {}): NightReport => ({
  night,
  survived: true,
  kills: {},
  breaches: 0,
  houseDamage: 0,
  devicesBroken: 0,
  barricadeDamage: { portail: 0, grange: 0, arriere: 0, verger: 0 },
  triggers: 0,
  autoTriggers: 0,
  bossDefeated: null,
  durationSeconds: 90,
  cameraLost: null,
  ...extra,
});

/** The morning after night 4, someone in the shed. */
const shedMorning = (seed = 5): GameState => ({ ...newGame(seed), day: SHED.night, phase: 'morning', hoursLeft: 0, orchard: 'spared', shed: 'waiting', lastNight: report(SHED.night) });

describe('the shed: in the campaign', () => {
  it('is opened by night 4 and only by night 4, once, and only if it was won', () => {
    const night = (day: number, shed: GameState['shed'] = 'quiet'): GameState => unwrap(startNight({ ...layout(newGame(7), 4), day, shed, orchard: 'spared' }));
    const run = (state: GameState): GameState => {
      const sim = new NightSim(state.day, state.yard, state.seed);
      for (let t = 0; t < 400 * 60 && sim.outcome === 'ongoing'; t++) {
        operate(sim);
        sim.step(STEP);
      }
      return concludeNight(state, sim);
    };
    const after4 = run(night(SHED.night));
    expect(after4.phase).toBe('morning');
    expect(after4.shed).toBe('waiting');
    expect(awaitsShed(after4)).toBe(true);
    expect(chapterWaiting(after4)).toBe('shed');
    expect(run(night(3)).shed).toBe('quiet');
    expect(run(night(SHED.night, 'chained')).shed).toBe('chained');
  });

  it('holds the next day back until someone has been to the shed', () => {
    const state = shedMorning();
    expect(startNextDay(state)).toBe(state);
  });

  it('starts day 5 short of the daylight the shed took, with the van unloaded', () => {
    const state = shedMorning();
    const day = unwrap(settleShed(state, { ending: 'chained', learned: ['stash', 'tonight'], hours: 2.5 }));
    expect(day).toMatchObject({ phase: 'day', day: SHED.night + 1, shed: 'chained', intel: ['stash', 'tonight'], hoursLeft: DAY_HOURS - 2.5, fate: null });
    expect(day.inventory.wood).toBe(state.inventory.wood + (SHED.stash.wood ?? 0));
    expect(day.inventory.battery).toBe(state.inventory.battery + (SHED.stash.battery ?? 0));
  });

  it('gives nothing for a van nobody was told about', () => {
    const state = shedMorning();
    const day = unwrap(settleShed(state, { ending: 'finished', learned: [], hours: 1 }));
    expect(day.inventory).toEqual(state.inventory);
    expect(day.intel).toEqual([]);
  });

  it('never starts a day with less than nothing', () => {
    const day = unwrap(settleShed(shedMorning(), { ending: 'finished', learned: [], hours: 99 }));
    expect(day.hoursLeft).toBe(0);
  });

  it('adds up with the dressing of a one-armed protagonist', () => {
    const day = unwrap(settleShed({ ...shedMorning(), orchard: 'maimed' }, { ending: 'chained', learned: [], hours: 1 }));
    expect(day.hoursLeft).toBe(DAY_HOURS - ORCHARD.dressingHours - 1);
    const later = startNextDay({ ...day, phase: 'morning' });
    expect(later.hoursLeft).toBe(DAY_HOURS - ORCHARD.dressingHours - SHED.upkeepHours);
  });

  it('costs a quarter of an hour every morning after, left chained', () => {
    const day = unwrap(settleShed(shedMorning(), { ending: 'chained', learned: [], hours: 1 }));
    const day6 = startNextDay({ ...day, phase: 'morning' });
    expect(day6.hoursLeft).toBe(DAY_HOURS - SHED.upkeepHours);
    expect(day6.inventory).toEqual(day.inventory);
  });

  it('brings a bundle of oven wood every morning after, let go', () => {
    const day = unwrap(settleShed(shedMorning(), { ending: 'freed', learned: [], hours: 3 }));
    const day6 = startNextDay({ ...day, phase: 'morning' });
    expect(day6.hoursLeft).toBe(DAY_HOURS);
    expect(day6.inventory.wood).toBe(day.inventory.wood + (SHED.delivery.wood ?? 0));
    const day7 = startNextDay({ ...day6, phase: 'morning' });
    expect(day7.inventory.wood).toBe(day6.inventory.wood + (SHED.delivery.wood ?? 0));
  });

  it('does nothing to later mornings once he is dead', () => {
    for (const ending of ['finished', 'emptied'] as const) {
      expect(shedDawn({ day: SHED.night + 2, shed: ending })).toEqual({ hours: 0, gift: {} });
    }
    expect(dawnOf({ ...newGame(1), day: SHED.night + 2, shed: 'freed', orchard: 'maimed' })).toEqual({ hours: -ORCHARD.dressingHours, gift: SHED.delivery });
  });

  it('ends the run when he bites, and gives that morning back', () => {
    const state = shedMorning();
    const over = unwrap(settleShed(state, { ending: 'bitten', learned: ['stash'], hours: 2 }));
    expect(over).toMatchObject({ phase: 'lost', fate: 'bitten', shed: 'waiting', day: SHED.night, intel: [] });
    expect(over.inventory).toEqual(state.inventory);
    const again = unwrap(retryChapter(over));
    expect(again.chapter).toBe('shed');
    expect(again.state).toMatchObject({ phase: 'morning', fate: null, shed: 'waiting' });
    expect(again.state.lastNight).toEqual(state.lastNight);
    expect(chapterOfFate('bitten')).toBe('shed');
  });

  it('refuses to settle a morning that is not waiting for it, and the orchard refuses the shed’s', () => {
    expect(settleShed(newGame(1), { ending: 'freed', learned: [], hours: 1 })).toEqual({ ok: false, error: { code: 'not_awaited' } });
    expect(settleOrchard(shedMorning(), 'spared')).toEqual({ ok: false, error: { code: 'not_awaited' } });
  });

  it('keeps what was learned when he is asked again on a later run of the same morning', () => {
    const day = unwrap(settleShed({ ...shedMorning(), intel: ['stash'] }, { ending: 'chained', learned: ['stash', 'chief'], hours: 1 }));
    expect(day.intel).toEqual(['stash', 'chief']);
    // The van is only unloaded once.
    expect(day.inventory.wood).toBe(shedMorning().inventory.wood);
  });
});

describe('the shed: what he told, on the "tonight" card', () => {
  it('lays out night 5 door by door from the wave table itself', () => {
    const rows = nightBySector(SHED.night + 1);
    const portail = rows.find((r) => r.sector === 'portail');
    expect(portail?.boss).toEqual({ type: 'mail', wave: 3 });
    expect(portail?.kinds).toEqual([
      { type: 'shambler', count: 8 },
      { type: 'runner', count: 6 },
      { type: 'dog', count: 5 },
    ]);
    expect(rows.reduce((sum, r) => sum + r.total, 0)).toBe(58);
    // Busiest door first.
    expect(rows.map((r) => r.total)).toEqual([...rows.map((r) => r.total)].sort((a, b) => b - a));
  });

  it('shows the round on day 5 and the chief on his day, and only if he told', () => {
    const day = (n: number, intel: GameState['intel']): GameState => ({ ...newGame(1), day: n, intel });
    expect(briefingFor(day(SHED.night + 1, ['tonight']))?.kind).toBe('tonight');
    expect(briefingFor(day(SHED.night + 1, ['chief']))).toBeNull();
    expect(briefingFor(day(BOSS_NIGHT.chief, ['chief']))).toEqual({
      kind: 'chief',
      chief: { whistleEvery: BOSS.chief.whistleEvery, whistleSeconds: BOSS.chief.whistleSeconds, whistleHaste: 35, auraRadius: BOSS.chief.auraRadius, auraShield: 28, selfShield: 40 },
    });
    expect(briefingFor(day(BOSS_NIGHT.chief + 1, ['chief', 'tonight']))).toBeNull();
    expect(briefingFor({ ...day(SHED.night + 1, ['tonight']), phase: 'morning' })).toBeNull();
  });
});

describe('the shed: in saves', () => {
  it('survives a round trip, chapter, intel and fate', () => {
    const chained: GameState = { ...newGame(5), day: 6, shed: 'chained', intel: ['stash', 'chief'] };
    expect(deserialize(serialize(chained))).toEqual(chained);
    const waiting = shedMorning();
    expect(deserialize(serialize(waiting))?.shed).toBe('waiting');
    const dead: GameState = { ...waiting, phase: 'lost', fate: 'bitten' };
    expect(deserialize(serialize(dead))).toMatchObject({ phase: 'lost', fate: 'bitten', shed: 'waiting' });
  });

  it('reads a save made before the shed existed as a quiet one', () => {
    const { shed: _shed, intel: _intel, ...legacy } = { ...newGame(5), day: 5 };
    expect(deserialize(JSON.stringify(legacy))).toMatchObject({ shed: 'quiet', intel: [] });
  });

  it('drops a chapter, intel or fate it does not know, and intel or a fate with no shed behind them', () => {
    const state = newGame(5);
    expect(deserialize(JSON.stringify({ ...state, shed: 'baked', intel: ['stash', 'gossip', 'stash', 3] }))).toMatchObject({ shed: 'quiet', intel: [] });
    expect(deserialize(JSON.stringify({ ...state, shed: 'freed', intel: ['chief', 'gossip', 'chief'] }))?.intel).toEqual(['chief']);
    expect(deserialize(JSON.stringify({ ...state, intel: 'stash' }))?.intel).toEqual([]);
    expect(deserialize(JSON.stringify({ ...state, phase: 'lost', fate: 'bitten' }))).toMatchObject({ phase: 'lost', fate: null });
    // A shed fate on a morning the orchard was waiting for belongs to neither.
    expect(deserialize(JSON.stringify({ ...state, phase: 'lost', orchard: 'cut', fate: 'bitten' }))?.fate).toBeNull();
    expect(deserialize(JSON.stringify({ ...state, phase: 'lost', shed: 'waiting', fate: 'throat' }))?.fate).toBeNull();
  });
});
