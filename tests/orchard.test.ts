import { describe, expect, it } from 'vitest';
import { DAY_HOURS } from '../src/core/data/locations';
import { concludeNight, newGame, retryOrchard, settleOrchard, startNextDay, startNight } from '../src/core/game';
import { NightSim, type SimEvent } from '../src/core/night';
import {
  NOTHING_HELD,
  ORCHARD,
  awaitsOrchard,
  daylight,
  hasLeftArm,
  infectionPace,
  outageFor,
  press,
  promptsOf,
  startOrchard,
  tick,
  type Cue,
  type Held,
  type Orchard,
  type Press,
} from '../src/core/orchard';
import { deserialize, serialize } from '../src/core/save';
import type { GameState } from '../src/core/types';
import { layout, operate } from './operator';

const STEP = 1 / 60;
const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`);
  return r.value;
};

/** Plays the scene: time passing with keys held, and key presses, collecting what it says happened. */
class Player {
  orchard: Orchard = startOrchard();
  readonly cues: Cue[] = [];

  hold(seconds: number, held: Partial<Held> = {}): this {
    const keys: Held = { ...NOTHING_HELD, ...held };
    for (let t = 0; t < Math.round(seconds / STEP); t++) {
      const turn = tick(this.orchard, STEP, keys);
      this.orchard = turn.orchard;
      this.cues.push(...turn.cues);
    }
    return this;
  }

  /** Holds until `done`, and fails rather than spin if it never comes. */
  until(done: (orchard: Orchard) => boolean, held: Partial<Held> = {}, limit = 60): this {
    const keys: Held = { ...NOTHING_HELD, ...held };
    for (let t = 0; t < limit / STEP && !done(this.orchard); t++) {
      const turn = tick(this.orchard, STEP, keys);
      this.orchard = turn.orchard;
      this.cues.push(...turn.cues);
    }
    if (!done(this.orchard)) throw new Error(`never got there: ${JSON.stringify(this.orchard)}`);
    return this;
  }

  press(...keys: Press[]): this {
    for (const key of keys) {
      const turn = press(this.orchard, key);
      this.orchard = turn.orchard;
      this.cues.push(...turn.cues);
    }
    return this;
  }

  said(type: Cue['type']): boolean {
    return this.cues.some((cue) => cue.type === type);
  }

  // The scene's set pieces, as a player would do them.
  walkIn(): this {
    return this.until((o) => o.beat === 'watch', { forward: true });
  }
  goUpToIt(): this {
    return this.walkIn().until((o) => o.beat === 'guard', { forward: true });
  }
  getBitten(): this {
    return this.goUpToIt().press('act');
  }
  tearItOff(): this {
    this.getBitten();
    for (let i = 0; i < ORCHARD.tugs; i++) this.press('act');
    return this;
  }
  walkTo(place: Orchard['place']): this {
    const order = ['tree', 'pole', 'fence'];
    const key = order.indexOf(place) < order.indexOf(this.orchard.place) ? 'left' : 'right';
    return this.until((o) => o.place === place && o.heading === null, { [key]: true });
  }
  tie(): this {
    return this.walkTo('fence').press('act').until((o) => o.tied, { act: true });
  }
  takeSaw(): this {
    return this.walkTo('tree').press('act');
  }
  sawThrough(): this {
    this.press('down');
    for (let i = 0; i < ORCHARD.sawStrokes; i++) this.press(i % 2 === 0 ? 'left' : 'right');
    return this;
  }
}

describe('the orchard: walking in on it', () => {
  it('reaches the pole by walking, and not by waiting', () => {
    const idle = new Player().hold(10);
    expect(idle.orchard.beat).toBe('arrive');
    const player = new Player().walkIn();
    expect(player.orchard).toMatchObject({ beat: 'watch', place: 'pole' });
    expect(player.cues).toContainEqual({ type: 'arrived', place: 'pole' });
  });

  it('first offers the rabbit and the two side paths', () => {
    const ids = promptsOf(new Player().walkIn().orchard).map((p) => p.id);
    expect(ids).toEqual(['approach', 'go_left', 'go_right']);
  });

  it('lets the saw and the rope be looked at before anything happens, and not taken', () => {
    const player = new Player().walkIn().walkTo('tree').press('act');
    expect(player.cues).toContainEqual({ type: 'looked', at: 'saw' });
    expect(player.orchard.saw).toBe(false);
    player.walkTo('fence').press('act');
    expect(player.cues).toContainEqual({ type: 'looked', at: 'rope' });
    expect(player.orchard.rope).toBe(false);
  });

  it('undoes the steps of a walk that is let go', () => {
    const player = new Player().walkIn().hold(0.8, { left: true });
    expect(player.orchard.heading).toBe('tree');
    player.hold(2);
    expect(player.orchard).toMatchObject({ place: 'pole', heading: null, walk: 0 });
  });

  it('steps back from the rabbit when the approach is let go', () => {
    const player = new Player().walkIn().hold(1, { forward: true });
    expect(player.orchard.hold).toBeGreaterThan(0.4);
    player.hold(2);
    expect(player.orchard).toMatchObject({ beat: 'watch', hold: 0 });
  });
});

describe('the orchard: clapping', () => {
  const offered = (p: Player) => promptsOf(p.orchard).some(prompt => prompt.id === 'clap');

  it('starts the idle wait when the walk-in control is released at the pole', () => {
    const p = new Player().walkIn().hold(ORCHARD.clapWaitSeconds - .1).press('clap');
    expect(p.orchard.beat).toBe('watch');
    expect(offered(p)).toBe(false);
    p.hold(.11);
    expect(offered(p)).toBe(true);
  });

  it('recognises the walk-in key as an approach if it carries the player toward the rabbit', () => {
    const p = new Player().walkIn().hold(.45, { forward: true }).press('clap');
    expect(p.orchard.beat).toBe('watch');
    expect(offered(p)).toBe(false);
    p.hold(STEP);
    expect(offered(p)).toBe(true);
  });

  it('ignores an early clap and lets the player discover it after a quiet 3.5 seconds', () => {
    const player = new Player().walkIn().hold(.05, {forward: true}).hold(.15);
    player.press('clap').hold(3.25).press('clap');
    expect(player.orchard.beat).toBe('watch');
    expect(offered(player)).toBe(false);
    player.hold(.3);
    expect(offered(player)).toBe(true);
    expect(player.press('clap').said('clapped')).toBe(true);
  });

  it('offers the clap on letting go after a deliberate step, and remembers it on returning to the pole', () => {
    const player = new Player().walkIn().hold(.1).hold(.1, { forward: true });
    expect(offered(player)).toBe(false);
    player.hold(STEP);
    expect(offered(player)).toBe(true);
    player.hold(.3).walkTo('tree');
    expect(offered(player)).toBe(false);
    player.walkTo('pole');
    expect(offered(player)).toBe(true);
  });

  it('does not count time spent watching another part of the orchard', () => {
    const p = new Player().walkIn().walkTo('fence').hold(5).walkTo('pole');
    expect(offered(p)).toBe(false);
  });

  it('sends it off, and the cable can be mended with both arms', () => {
    const player = new Player().walkIn().hold(3.6).press('clap');
    expect(player.orchard.beat).toBe('mend');
    expect(player.said('clapped')).toBe(true);
    expect(promptsOf(player.orchard).map((p) => p.id)).toContain('splice');
    player.until((o) => o.beat === 'over', { act: true });
    expect(player.orchard.ending).toBe('spared');
    expect(player.orchard.trail).toEqual(['clapped', 'mended']);
    expect(player.orchard.infection).toBe(0);
  });

  it('only works from the pole', () => {
    const player = new Player().walkIn().walkTo('fence').press('clap');
    expect(player.orchard.beat).toBe('watch');
  });

  it('needs the splice held to the end', () => {
    const player = new Player().walkIn().hold(3.6).press('clap').hold(ORCHARD.spliceSeconds * 0.7, { act: true }).hold(3);
    expect(player.orchard).toMatchObject({ beat: 'mend', hold: 0, ending: null });
  });
});

describe('the orchard: going up to it', () => {
  it('turns round, then jumps', () => {
    const player = new Player().walkIn().until((o) => o.beat === 'reveal', { forward: true });
    expect(player.said('turned')).toBe(true);
    // Nothing can be done while it turns: an early key is not an arm up.
    player.press('act', 'clap');
    expect(player.orchard.beat).toBe('reveal');
    player.hold(ORCHARD.revealSeconds + 0.05);
    expect(player.orchard.beat).toBe('guard');
    expect(player.said('lunge')).toBe(true);
  });

  it('kills at the throat when the arm comes up too late', () => {
    const player = new Player().goUpToIt().hold(ORCHARD.guardSeconds + 0.05).press('act');
    expect(player.orchard).toMatchObject({ beat: 'over', ending: 'throat' });
    expect(player.orchard.trail).toEqual(['approached', 'late']);
  });

  it('takes the bite on the left arm when the arm comes up in time', () => {
    const player = new Player().goUpToIt().hold(ORCHARD.guardSeconds * 0.8).press('act');
    expect(player.orchard.beat).toBe('clamped');
    expect(player.said('guarded')).toBe(true);
    expect(infectionPace(player.orchard)).toBeGreaterThan(0);
  });

  it('has to be torn off, tug by tug, while the arm goes dark', () => {
    const player = new Player().getBitten();
    for (let i = 0; i < ORCHARD.tugs - 1; i++) player.press('act');
    expect(player.orchard.beat).toBe('clamped');
    player.press('act');
    expect(player.orchard.beat).toBe('loose');
    expect(player.said('torn')).toBe(true);
  });

  it('turns whoever does nothing about it', () => {
    const player = new Player().getBitten().until((o) => o.beat === 'over', {}, ORCHARD.infectionSeconds + 2);
    expect(player.orchard.ending).toBe('turned');
  });
});

describe('the orchard: the rope and the saw', () => {
  it('costs the left arm, and only the arm, with the rope tied first', () => {
    const player = new Player().tearItOff().tie().takeSaw().sawThrough();
    expect(player.orchard).toMatchObject({ beat: 'over', ending: 'maimed', tied: true });
    expect(player.orchard.trail).toEqual(['approached', 'guarded', 'torn', 'rope', 'tied', 'saw', 'cut']);
    expect(player.orchard.infection).toBeLessThan(1);
    expect(player.cues).toContainEqual({ type: 'severed', tied: true });
  });

  it('works in the other order too: the saw, then the rope', () => {
    const player = new Player().tearItOff().takeSaw().tie().sawThrough();
    expect(player.orchard.ending).toBe('maimed');
  });

  it('bleeds dry whoever saws with nothing tied above the cut', () => {
    const player = new Player().tearItOff().takeSaw().sawThrough();
    expect(player.orchard.beat).toBe('bleeding');
    expect(player.cues).toContainEqual({ type: 'severed', tied: false });
    // The infection went with the arm: it is the blood that runs out now.
    expect(infectionPace(player.orchard)).toBe(0);
    player.hold(ORCHARD.bleedSeconds + 0.1);
    expect(player.orchard.ending).toBe('bled');
  });

  it('does not count a rope that was taken and never tightened', () => {
    const player = new Player().tearItOff().walkTo('fence').press('act').hold(ORCHARD.tieSeconds * 0.6, { act: true }).hold(3);
    expect(player.orchard).toMatchObject({ rope: true, tied: false, hold: 0 });
    player.takeSaw().sawThrough();
    expect(player.orchard.beat).toBe('bleeding');
  });

  it('slows the infection once the tourniquet is on', () => {
    const loose = new Player().tearItOff();
    const tied = new Player().tearItOff().tie();
    expect(infectionPace(tied.orchard)).toBeCloseTo(infectionPace(loose.orchard) * ORCHARD.tiedPace, 10);
  });

  it('needs the saw in hand to kneel, and a saw goes one way then the other', () => {
    const player = new Player().tearItOff().press('down');
    expect(player.orchard.beat).toBe('loose');
    player.takeSaw().press('down', 'left', 'left', 'left');
    expect(player.orchard).toMatchObject({ beat: 'sawing', strokes: 1 });
    player.press('right');
    expect(player.orchard.strokes).toBe(2);
  });

  it('lets the player get up again before the first stroke, and not after', () => {
    const player = new Player().tearItOff().takeSaw().press('down', 'up');
    expect(player.orchard.beat).toBe('loose');
    player.press('down', 'left', 'up');
    expect(player.orchard.beat).toBe('sawing');
  });

  it('leaves time for the whole of it, and none to spare for dawdling twice', () => {
    const brisk = new Player().tearItOff().tie().takeSaw().sawThrough();
    expect(brisk.orchard.infection).toBeLessThan(0.5);
    // Standing still at the pole for the length of the bite is the other way it ends.
    const frozen = new Player().tearItOff().until((o) => o.beat === 'over', {}, ORCHARD.infectionSeconds + 2);
    expect(frozen.orchard.ending).toBe('turned');
  });

  it('can still turn on its knees, saw in hand', () => {
    const player = new Player().tearItOff().takeSaw().press('down', 'left').until((o) => o.beat === 'over', {}, ORCHARD.infectionSeconds + 2);
    expect(player.orchard.ending).toBe('turned');
  });

  it('offers only what applies', () => {
    const bitten = new Player().tearItOff();
    expect(promptsOf(bitten.orchard).map((p) => p.id)).toEqual(['go_left', 'go_right']);
    const atFence = new Player().tearItOff().walkTo('fence');
    expect(promptsOf(atFence.orchard).map((p) => p.id)).toEqual(['take_rope', 'go_left']);
    atFence.press('act');
    expect(promptsOf(atFence.orchard).map((p) => p.id)).toEqual(['tie', 'go_left']);
    const armed = new Player().tearItOff().tie().takeSaw();
    expect(promptsOf(armed.orchard).map((p) => p.id)).toEqual(['kneel', 'go_right']);
  });

  it('ignores everything once it is over', () => {
    const player = new Player().tearItOff().tie().takeSaw().sawThrough();
    const after = player.orchard;
    player.press('act', 'left', 'right', 'up', 'down', 'clap').hold(5, { forward: true, act: true });
    expect(player.orchard).toEqual(after);
  });
});

describe('the orchard: in the campaign', () => {
  const dawnOfNight2 = (seed = 7): { state: GameState; events: SimEvent[] } => {
    let state: GameState = { ...layout(newGame(seed), 4), day: ORCHARD.night };
    state = unwrap(startNight(state));
    const sim = new NightSim(state.day, state.yard, state.seed, outageFor(state));
    const events: SimEvent[] = [];
    for (let t = 0; t < 400 * 60 && sim.outcome === 'ongoing'; t++) {
      operate(sim);
      sim.step(STEP);
      events.push(...sim.drainEvents());
    }
    return { state: concludeNight(state, sim), events };
  };

  it('plans the outage for night 2 only, and only once', () => {
    const state = newGame(3);
    expect(outageFor(state)).toBeNull();
    expect(outageFor({ ...state, day: 2 })).toEqual({ sector: 'verger', wave: 2, delay: ORCHARD.outageDelay });
    expect(outageFor({ ...state, day: 2, orchard: 'spared' })).toBeNull();
    expect(outageFor({ ...state, day: 3 })).toBeNull();
  });

  it('loses the orchard camera during the second wave of night 2', () => {
    const { state, events } = dawnOfNight2();
    const lost = events.findIndex((e) => e.type === 'camera_lost');
    const wave2 = events.findIndex((e) => e.type === 'wave' && e.index === 2);
    const wave3 = events.findIndex((e) => e.type === 'wave' && e.index === 3);
    expect(wave2).toBeGreaterThanOrEqual(0);
    expect(lost).toBeGreaterThan(wave2);
    expect(lost).toBeLessThan(wave3);
    expect(events[lost]).toEqual({ type: 'camera_lost', sector: 'verger' });
    expect(state.lastNight?.cameraLost).toBe('verger');
  });

  it('keeps every camera on the other nights', () => {
    const state = unwrap(startNight(layout(newGame(7), 3)));
    const sim = new NightSim(state.day, state.yard, state.seed, outageFor(state));
    for (let t = 0; t < 400 * 60 && sim.outcome === 'ongoing'; t++) {
      operate(sim);
      sim.step(STEP);
    }
    expect(sim.cameraLost).toBeNull();
    expect(concludeNight(state, sim).orchard).toBe('quiet');
  });

  it('holds the next day back until someone has been to look', () => {
    const { state } = dawnOfNight2();
    expect(state.phase).toBe('morning');
    expect(state.orchard).toBe('cut');
    expect(awaitsOrchard(state)).toBe(true);
    expect(startNextDay(state)).toBe(state);
  });

  it('starts day 3 whole and on time when the rabbit was shooed off', () => {
    const { state } = dawnOfNight2();
    const day = unwrap(settleOrchard(state, 'spared'));
    expect(day).toMatchObject({ phase: 'day', day: 3, orchard: 'spared', fate: null, hoursLeft: DAY_HOURS, where: 'home' });
    expect(hasLeftArm(day)).toBe(true);
    expect(outageFor(day)).toBeNull();
  });

  it('starts day 3 late and one-armed, and every day after that an hour short', () => {
    const { state } = dawnOfNight2();
    const day = unwrap(settleOrchard(state, 'maimed'));
    expect(day).toMatchObject({ phase: 'day', day: 3, orchard: 'maimed' });
    expect(day.hoursLeft).toBe(DAY_HOURS - ORCHARD.dressingHours - ORCHARD.faintHours);
    expect(hasLeftArm(day)).toBe(false);
    const later = startNextDay({ ...day, phase: 'morning' });
    expect(later.day).toBe(4);
    expect(later.hoursLeft).toBe(DAY_HOURS - ORCHARD.dressingHours);
    expect(daylight(later)).toBe(DAY_HOURS - ORCHARD.dressingHours);
  });

  it.each(['throat', 'turned', 'bled'] as const)('ends the run on "%s", and gives that morning back', (fate) => {
    const { state } = dawnOfNight2();
    const over = unwrap(settleOrchard(state, fate));
    expect(over).toMatchObject({ phase: 'lost', fate, orchard: 'cut', day: 2 });
    const again = unwrap(retryOrchard(over));
    expect(again).toMatchObject({ phase: 'morning', fate: null, orchard: 'cut' });
    expect(awaitsOrchard(again)).toBe(true);
    // The night that was won is not played again.
    expect(again.lastNight).toEqual(state.lastNight);
  });

  it('refuses to settle a morning that is not waiting, and to retry a run the house lost', () => {
    const state = newGame(1);
    expect(settleOrchard(state, 'spared')).toEqual({ ok: false, error: { code: 'not_awaited' } });
    expect(retryOrchard({ ...state, phase: 'lost' })).toEqual({ ok: false, error: { code: 'no_fate' } });
  });
});

describe('the orchard: in saves', () => {
  it('survives a round trip, chapter and fate', () => {
    const maimed: GameState = { ...newGame(5), day: 4, orchard: 'maimed' };
    expect(deserialize(serialize(maimed))).toEqual(maimed);
    const waiting: GameState = { ...newGame(5), day: 2, phase: 'morning', orchard: 'cut' };
    expect(deserialize(serialize(waiting))?.orchard).toBe('cut');
    const dead: GameState = { ...waiting, phase: 'lost', fate: 'bled' };
    expect(deserialize(serialize(dead))).toMatchObject({ phase: 'lost', fate: 'bled', orchard: 'cut' });
  });

  it('reads a save made before the orchard existed as a quiet one', () => {
    const { orchard: _orchard, fate: _fate, ...legacy } = { ...newGame(5), day: 3 };
    const loaded = deserialize(JSON.stringify(legacy));
    expect(loaded).toMatchObject({ orchard: 'quiet', fate: null });
  });

  it('drops a chapter or a fate it does not know, and a fate with no orchard behind it', () => {
    const state = newGame(5);
    expect(deserialize(JSON.stringify({ ...state, orchard: 'eaten', fate: 'bored' }))).toMatchObject({ orchard: 'quiet', fate: null });
    expect(deserialize(JSON.stringify({ ...state, phase: 'lost', fate: 'throat' }))).toMatchObject({ phase: 'lost', fate: null });
  });

  it('gives an old night report no lost camera', () => {
    const state = newGame(5);
    const report = { night: 1, survived: true, kills: {}, breaches: 0, houseDamage: 0, devicesBroken: 0, barricadeDamage: { portail: 0, grange: 0, arriere: 0, verger: 0 }, triggers: 0, autoTriggers: 0, bossDefeated: null, durationSeconds: 90 };
    const loaded = deserialize(JSON.stringify({ ...state, phase: 'morning', lastNight: report }));
    expect(loaded?.lastNight?.cameraLost).toBeNull();
  });
});
