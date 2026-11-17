import { describe, expect, it } from 'vitest';
import { ONE_HAND } from '../src/core/data/desk';
import { DAY_HOURS } from '../src/core/data/locations';
import { newGame } from '../src/core/game';
import { NightSim, type DeskPress, type OneHand, type SimEvent } from '../src/core/night';
import { ORCHARD, deskFor } from '../src/core/orchard';
import type { GameState, SectorId } from '../src/core/types';
import { daylightOfDays, layout, operateDesk, yardBy } from './operator';

const STEP = 1 / 60;
const HAND: OneHand = { crossSeconds: 1, queueLimit: 3 };

/** A yard with a log on the portail, grange and arriere lanes, and nothing walking yet. */
const yard = () => layout(newGame(1), 2).yard;

/** A night at the desk, with what it said happened. */
class Desk {
  readonly sim: NightSim;
  readonly events: SimEvent[] = [];

  constructor(hand: OneHand | null) {
    this.sim = new NightSim(1, yard(), 1, null, hand);
  }

  press(...presses: DeskPress[]): this {
    for (const press of presses) this.sim.act(press);
    this.events.push(...this.sim.drainEvents());
    return this;
  }

  wait(seconds: number): this {
    for (let t = 0; t < Math.round(seconds / STEP); t++) {
      this.sim.step(STEP);
      this.events.push(...this.sim.drainEvents());
    }
    return this;
  }

  log(sector: SectorId): number {
    const device = this.sim.manualDevicesIn(sector)[0];
    if (!device) throw new Error(`no hand-fired trap on ${sector}`);
    return device.id;
  }

  fired(): number[] {
    return this.events.flatMap((e) => (e.type === 'trigger' && !e.auto ? [e.deviceId] : []));
  }

  looked(): SectorId[] {
    return this.events.flatMap((e) => (e.type === 'look' ? [e.sector] : []));
  }
}

const look = (sector: SectorId): DeskPress => ({ kind: 'look', sector });
const key = (slot: number): DeskPress => ({ kind: 'key', slot });

describe('the desk with two hands', () => {
  it('does everything at once, and has no hand to show', () => {
    const desk = new Desk(null);
    const portail = desk.log('portail');
    const grange = desk.log('grange');
    desk.press(key(0), look('grange'), key(0));
    expect(desk.fired()).toEqual([portail, grange]);
    expect(desk.looked()).toEqual(['grange']);
    expect(desk.sim.camera).toBe('grange');
    expect(desk.sim.handView()).toBeNull();
  });

  it('does not announce a camera that is already on screen', () => {
    const desk = new Desk(null).press(look('portail'));
    expect(desk.looked()).toEqual([]);
  });
});

describe('the desk with one hand', () => {
  it('lets the first press through, whichever row it is on', () => {
    expect(new Desk(HAND).sim.act(look('grange'))).toBe('done');
    expect(new Desk(HAND).sim.act(key(0))).toBe('done');
  });

  it('never makes a press on the same row wait', () => {
    const desk = new Desk(HAND);
    expect([look('grange'), look('arriere'), look('verger')].map((p) => desk.sim.act(p))).toEqual(['done', 'done', 'done']);
    const traps = new Desk(HAND);
    expect([key(0), key(1), key(0)].map((p) => traps.sim.act(p))).toEqual(['done', 'done', 'done']);
  });

  it('makes a press on the other row wait for the hand, then carries it out by itself', () => {
    const desk = new Desk(HAND).press(key(0));
    expect(desk.sim.act(look('grange'))).toBe('waiting');
    desk.press();
    expect(desk.events).toContainEqual({ type: 'hand_wait', row: 'cameras', seconds: HAND.crossSeconds });
    desk.wait(HAND.crossSeconds - 0.1);
    expect(desk.sim.camera).toBe('portail');
    expect(desk.sim.handView()).toMatchObject({ row: 'traps', queue: [look('grange')] });
    desk.wait(0.15);
    expect(desk.sim.camera).toBe('grange');
    expect(desk.looked()).toEqual(['grange']);
    expect(desk.sim.handView()).toMatchObject({ row: 'cameras', queue: [] });
  });

  it('only charges for the part of the way the hand has not already covered', () => {
    const desk = new Desk(HAND).press(key(0)).wait(0.6);
    desk.press(look('grange'));
    const wait = desk.events.find((e) => e.type === 'hand_wait');
    expect(wait && wait.type === 'hand_wait' ? wait.seconds : null).toBeCloseTo(0.4, 1);
  });

  it('is free again for either row once it has rested long enough', () => {
    const desk = new Desk(HAND).press(key(0)).wait(HAND.crossSeconds + 0.05);
    expect(desk.sim.handView()?.ready).toBe(1);
    expect(desk.sim.act(look('arriere'))).toBe('done');
  });

  it('keeps the order of the presses: a trap key pressed after a camera key fires on that camera', () => {
    const desk = new Desk(HAND);
    const portail = desk.log('portail');
    const grange = desk.log('grange');
    desk.press(key(0), look('grange'), key(0));
    expect(desk.fired()).toEqual([portail]);
    expect(desk.sim.handView()?.queue).toEqual([look('grange'), key(0)]);
    desk.wait(HAND.crossSeconds + 0.05);
    expect(desk.looked()).toEqual(['grange']);
    expect(desk.fired()).toEqual([portail]);
    desk.wait(HAND.crossSeconds + 0.05);
    expect(desk.fired()).toEqual([portail, grange]);
  });

  it('carries out only the last of several cameras chosen while it was on its way', () => {
    const desk = new Desk(HAND).press(key(0), look('grange'), look('arriere'), look('verger'));
    expect(desk.sim.handView()?.queue).toEqual([look('verger')]);
    desk.wait(HAND.crossSeconds + 0.05);
    expect(desk.looked()).toEqual(['verger']);
  });

  it('counts a key hammered while it waits once', () => {
    const desk = new Desk(HAND).press(look('grange'));
    for (let i = 0; i < 6; i++) expect(desk.sim.act(key(0))).toBe('waiting');
    expect(desk.sim.handView()?.queue).toEqual([key(0)]);
    desk.wait(HAND.crossSeconds + 0.05);
    expect(desk.fired()).toEqual([desk.log('grange')]);
  });

  it('refuses a press when too much is already waiting, and says so', () => {
    const desk = new Desk(HAND);
    desk.press(look('grange'), key(0), key(1), { kind: 'fire', deviceId: desk.log('arriere') });
    expect(desk.sim.handView()?.queue).toHaveLength(HAND.queueLimit);
    expect(desk.sim.act(key(2))).toBe('refused');
    desk.press();
    expect(desk.events).toContainEqual({ type: 'hand_full' });
  });

  it('still lets the trap refuse what it would refuse anyway, once the hand gets there', () => {
    const desk = new Desk(HAND);
    const portail = desk.log('portail');
    desk.press(key(0), look('grange'), { kind: 'fire', deviceId: portail });
    desk.wait(2 * HAND.crossSeconds + 0.1);
    expect(desk.fired()).toEqual([portail]);
    expect(desk.events).toContainEqual({ type: 'trigger_denied', deviceId: portail, reason: 'rearming' });
  });

  it('is the same night for the same presses at the same moments', () => {
    const SECTORS: readonly SectorId[] = ['grange', 'portail', 'arriere', 'verger'];
    const play = () => {
      const desk = new Desk(HAND);
      for (let second = 0; second < 40; second++) {
        desk.press(second % 3 === 0 ? look(SECTORS[(second / 3) % SECTORS.length] as SectorId) : key(second % 2));
        desk.wait(0.5);
      }
      return { fired: desk.fired(), looked: desk.looked(), house: desk.sim.houseHp };
    };
    expect(play()).toEqual(play());
  });
});

describe('the desk in the campaign', () => {
  it('is worked with two hands until the orchard takes one', () => {
    const state: GameState = newGame(1);
    expect(deskFor(state)).toBeNull();
    expect(deskFor({ ...state, orchard: 'cut' })).toBeNull();
    expect(deskFor({ ...state, orchard: 'spared' })).toBeNull();
    expect(deskFor({ ...state, orchard: 'maimed' })).toBe(ONE_HAND);
  });

  it('gives a one-armed run less daylight from the day of the orchard on', () => {
    const two = daylightOfDays(2, 7);
    const one = daylightOfDays(1, 7);
    expect(two).toEqual(Array(7).fill(DAY_HOURS));
    expect(one.slice(0, ORCHARD.night)).toEqual(two.slice(0, ORCHARD.night));
    expect(one[ORCHARD.night]).toBe(DAY_HOURS - ORCHARD.faintHours - ORCHARD.dressingHours);
    expect(one.slice(ORCHARD.night + 1)).toEqual(Array(7 - ORCHARD.night - 1).fill(DAY_HOURS - ORCHARD.dressingHours));
  });

  it('pays for a poorer yard with less daylight, and never for a richer one', () => {
    for (let night = 1; night <= 7; night++) {
      const two = yardBy(newGame(1), daylightOfDays(2, 7), night);
      const one = yardBy(newGame(1), daylightOfDays(1, 7), night);
      expect(one.steps).toBeLessThanOrEqual(two.steps);
      if (night > ORCHARD.night && night < 6) expect(one.steps).toBeLessThan(two.steps);
    }
  });
});

describe('the desk operator', () => {
  const night = (n: number, arms: 1 | 2, seed: number): NightSim => {
    const sim = new NightSim(n, yardBy(newGame(seed), daylightOfDays(arms, 7), n).state.yard, seed, null, arms === 1 ? ONE_HAND : null);
    for (let t = 0; t < 900 * 60 && sim.outcome === 'ongoing'; t++) {
      // It waits for its hand like the player does: nothing more is pressed while a press is waiting.
      const waiting = sim.handView()?.queue.length ?? 0;
      operateDesk(sim);
      if (waiting > 0) expect(sim.handView()?.queue.length).toBe(waiting);
      sim.step(STEP);
    }
    return sim;
  };

  it('fires only through the camera on screen', () => {
    const sim = new NightSim(3, layout(newGame(5), 3).yard, 5);
    const fired = new Set<SectorId>();
    for (let t = 0; t < 900 * 60 && sim.outcome === 'ongoing'; t++) {
      operateDesk(sim);
      for (const e of sim.drainEvents()) {
        if (e.type === 'trigger' && !e.auto) {
          const device = sim.device(e.deviceId);
          if (device) expect(sim.manualDevicesIn(sim.camera).map((d) => d.id)).toContain(device.id);
          fired.add(sim.camera);
        }
      }
      sim.step(STEP);
    }
    expect(fired.size).toBeGreaterThan(1);
  });

  it('costs a one-armed run house it would have kept with two, and still sees it through', () => {
    let two = 0;
    let one = 0;
    for (const n of [5, 7]) {
      for (const seed of [11, 22, 33]) {
        const a = night(n, 2, seed);
        const b = night(n, 1, seed);
        expect(b.outcome).toBe('survived');
        two += a.houseHp;
        one += b.houseHp;
      }
    }
    expect(one).toBeLessThan(two);
  });
});
