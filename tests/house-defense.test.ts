import { describe, expect, it } from 'vitest';
import { ONE_HAND } from '../src/core/data/desk';
import { newGame } from '../src/core/game';
import { ENTRIES } from '../src/core/map';
import { HOUSE_RETURN_SECONDS, NightSim, type SimEvent } from '../src/core/night';

const tick = 1 / 60;
function advance(sim: NightSim, seconds: number, outside = false): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.ceil(seconds / tick); i++) {
    sim.step(tick, outside);
    events.push(...sim.drainEvents());
  }
  return events;
}

function atOpenDoor(count: number, hp = 100) {
  const sim = new NightSim(1, { ...newGame(3).yard, houseHp: hp }, 3, null, ONE_HAND);
  advance(sim, (sim.secondsToNextSpawn() ?? 0) + tick);
  const actor = sim.enemies[0]!;
  sim.enemies.length = 0;
  const sector = 'verger';
  sim.barricades[sector].hp = 0;
  const { x, y } = ENTRIES[sector];
  for (let id = 0; id < count; id++) {
    sim.enemies.push({ ...actor, id: 100 + id, target: sector, x: x + .5, y: y + .5 });
  }
  sim.drainEvents();
  return sim;
}

describe('inside the house', () => {
  it('records a working feed when the entry camera is dark and assigns sound only to a real shot', () => {
    const sim = atOpenDoor(1);
    sim.cameraLost = 'verger';
    sim.act({ kind: 'look', sector: 'grange' });
    advance(sim, tick);
    const take = sim.firstHouseDefense!;
    expect(take.sector).toBe('verger');
    expect(take.feed).toBe(sim.camera);
    expect(take.feed).not.toBe('verger');
    const shots = advance(sim, HOUSE_RETURN_SECONDS + tick).filter(event => event.type === 'house_shot');
    expect(shots).toHaveLength(1);
    expect(shots[0]!.showAt! - take.started).toBeCloseTo(2.5, 1);
  });

  it('stops three entrants with three timed shots, holds the manual controls and returns them', () => {
    const sim = atOpenDoor(3);
    const log = sim.devices.find(d => d.type === 'log')!;
    const damage = sim.enemies[0]!.def.houseDamage;
    sim.act({ kind: 'look', sector: 'grange' });
    expect(sim.act({ kind: 'key', slot: 0 })).toBe('waiting');
    const start = advance(sim, tick);
    expect(start.filter(e => e.type === 'house_defense')).toHaveLength(1);
    expect(sim.houseHp).toBe(100 - damage);
    expect(sim.camera).toBe('verger');
    expect(sim.firstHouseDefense).toEqual({ kind: 'defense', sector: 'verger', feed: 'verger', started: sim.time });
    expect(sim.handView()?.queue).toHaveLength(0);
    expect(sim.act({ kind: 'fire', deviceId: log.id })).toBe('refused');
    expect(sim.trigger(log.id)).toEqual({ ok: false, error: 'away' });
    expect(sim.launchMoped('portail')).toBe(false);
    expect(advance(sim, 2).filter(e => e.type === 'house_shot')).toHaveLength(0);
    const rest = advance(sim, HOUSE_RETURN_SECONDS - 2 + tick);
    expect(rest.filter(e => e.type === 'house_shot')).toHaveLength(3);
    expect(rest.filter(e => e.type === 'desk_return')).toHaveLength(1);
    expect(sim.awayFromDesk).toBe(false);
    expect(sim.trigger(log.id).ok).toBe(true);
    expect(sim.report().indoorKills).toBe(3);
    expect(sim.report().kills.shambler).toBe(3);
    expect(sim.report().traps[log.id]?.kills).toBe(0);
  });

  it('keeps damage for excess entrants and lets automatic traps run during the sortie', () => {
    const sim = atOpenDoor(4);
    const actor = sim.enemies[0]!;
    const spikes = sim.devices.find(d => d.type === 'spikes')!;
    advance(sim, tick);
    expect(sim.houseHp).toBe(100 - 2 * actor.def.houseDamage);
    for (let id = 0; id < 4; id++) {
      sim.enemies.push({ ...actor, alive: true, id: 200 + id, target: 'portail', x: spikes.x + .5, y: spikes.y + .5 });
    }
    expect(advance(sim, .15).some(e => e.type === 'trigger' && e.auto)).toBe(true);
    expect(sim.awayFromDesk).toBe(true);
  });

  it('gives the operator time at the desk between groups, then responds to a fresh intrusion', () => {
    const sim = atOpenDoor(1);
    const entrant = { ...sim.enemies[0]! };
    advance(sim, HOUSE_RETURN_SECONDS + .1);
    expect(sim.report().indoorKills).toBe(1);
    sim.enemies.push({ ...entrant, id: 300 });
    expect(advance(sim, tick).some(event => event.type === 'house_defense')).toBe(false);
    expect(sim.awayFromDesk).toBe(false);
    advance(sim, 12);
    sim.enemies.push({ ...entrant, id: 301 });
    expect(advance(sim, tick).some(event => event.type === 'house_defense')).toBe(true);
  });

  it('keeps a fatal intrusion and a hero already outside on their own paths', () => {
    const fatal = atOpenDoor(1, 1);
    expect(advance(fatal, tick).some(e => e.type === 'house_defense')).toBe(false);
    expect(fatal.outcome).toBe('overrun');
    const outside = atOpenDoor(2);
    const damage = outside.enemies[0]!.def.houseDamage;
    expect(advance(outside, tick, true).some(e => e.type === 'house_defense')).toBe(false);
    expect(outside.houseHp).toBe(100 - 2 * damage);
  });
});
