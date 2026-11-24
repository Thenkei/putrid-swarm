import { expect, it } from 'vitest';
import { COMBAT, DEVICES } from '../src/core/data/devices';
import { BOSS } from '../src/core/data/enemies';
import { newGame } from '../src/core/game';
import { NightSim, type Enemy, type SimEvent } from '../src/core/night';
import { SECTOR_IDS } from '../src/core/types';
import { build } from '../src/core/yard';

const STEP = 1 / 60;

function approach() {
  let state = newGame(44);
  state = { ...state, inventory: { wood: 30, wire: 30, scrap: 30, springs: 30, battery: 30 }, hoursLeft: 8 };
  for (const [kind, x, y] of [['horn', 7, 18], ['floodlight', 12, 18], ['log', 11, 19]] as const) {
    const result = build(state, kind, x, y);
    if (!result.ok) throw Error(kind + ': ' + result.error.code);
    state = result.value;
  }
  const sim = new NightSim(6, state.yard, state.seed);
  while (!sim.enemies.some(e => e.type === 'chief') && sim.outcome === 'ongoing') {
    // Clear the opening waves so every manual device is available for the encounter.
    for (const sector of SECTOR_IDS) sim.epicStrike(sector, 'pack');
    sim.step(STEP);
  }
  const chief = sim.enemies.find(e => e.type === 'chief')!;
  expect(chief).toBeDefined();
  sim.drainEvents();
  return { sim, chief };
}

function until(sim: NightSim, ready: () => boolean) {
  while (!ready() && sim.outcome === 'ongoing') sim.step(STEP);
  expect(ready()).toBe(true);
}

function dist(a: Enemy, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

it('keeps the ordered ranks behind the shield while the horn draws the verge towards its real cell', () => {
  const { sim, chief } = approach();
  const horn = sim.devices.find(d => d.type === 'horn' && d.x === 7)!;
  const bell = { x: horn.x + 0.5, y: horn.y + 0.5 };
  const ranks = () => sim.enemies.filter(e => e.alive && e.fileRank && e.shielded);
  const loose = () => sim.enemies.filter(e => e.alive && e.type === 'shambler' && e.target === 'portail' &&
    !e.shielded && dist(e, bell) < DEVICES.horn.radius);
  until(sim, () => ranks().length === 3 && loose().length >= 2 && chief.boss!.ability < 1.5);
  const file = ranks();
  expect(file.map(e => e.fileRank)).toEqual([1, 2, 3]);
  for (let i = 0; i < file.length; i++) {
    const e = file[i]!, previous = i === 0 ? chief : file[i - 1]!;
    expect(Math.abs(e.x - chief.x)).toBeLessThan(0.7);
    expect(e.y).toBeGreaterThan(previous.y + 0.25);
    expect(dist(e, chief)).toBeLessThan(BOSS.chief.auraRadius);
  }
  const strays = loose().map(e => ({ e, start: dist(e, bell) }));
  expect(sim.trigger(horn.id).ok).toBe(true);
  for (let i = 0; i < 45; i++) sim.step(STEP);
  expect(file.every(e => e.shielded && e.lureDevice === null)).toBe(true);
  expect(strays.some(({ e, start }) => e.lureDevice === horn.id && dist(e, bell) < start - 0.2)).toBe(true);
});

it('closes the watch once before the whistle and gives the marching ranks the actual haste', () => {
  const { sim, chief } = approach();
  sim.act({ kind: 'look', sector: 'grange' });
  const cues: { kind: string; t: number }[] = [];
  until(sim, () => {
    for (const e of sim.drainEvents()) if (e.type === 'telegraph' && e.enemyId === chief.id) cues.push({ kind: e.kind, t: sim.time });
    return cues.some(e => e.kind === 'whistle');
  });
  expect(cues.map(e => e.kind)).toEqual(['watch', 'whistle']);
  expect(Math.abs(cues[1]!.t - cues[0]!.t - BOSS.chief.watchLead)).toBeLessThanOrEqual(STEP);
  expect(sim.enemies.filter(e => e.fileRank).every(e => e.hasteFor > 0)).toBe(true);
  expect(sim.camera).toBe('grange');
  expect(sim.report().chiefFellAt).toBeUndefined();
});

it('turns the light cue into real damage against the exposed Chief', () => {
  const { sim, chief } = approach();
  const lamp = sim.devices.find(d => d.type === 'floodlight' && d.x === 12)!;
  until(sim, () => dist(chief, { x: lamp.x + 0.5, y: lamp.y + 0.5 }) < DEVICES.floodlight.radius - 0.1);
  const ids = new Set([chief.id]), before = chief.hp;
  expect(sim.epicStrike('portail', 'pack', ids)).toBe(1);
  expect(before - chief.hp).toBeCloseTo(95 * BOSS.chief.selfDamageTaken);
  expect(sim.trigger(lamp.id).ok).toBe(true);
  sim.step(STEP);
  expect(chief.lit).toBe(true);
  const exposed = chief.hp;
  expect(sim.epicStrike('portail', 'pack', ids)).toBe(1);
  expect(exposed - chief.hp).toBeCloseTo(95 * COMBAT.litDamageMultiplier);
});

it('leaves the whistle at the corpse landing after a fatal log, including fractional coordinates', () => {
  const { sim, chief } = approach();
  const log = sim.devices.find(d => d.type === 'log' && d.x === 11 && d.y === 19)!;
  until(sim, () => dist(chief, { x: log.x + 0.5, y: log.y + 0.5 }) < DEVICES.log.radius - 0.1);
  const ids = new Set([chief.id]);
  const lethal = DEVICES.log.damage * BOSS.chief.selfDamageTaken;
  while (chief.hp > lethal) expect(sim.epicStrike('portail', 'flame', ids)).toBe(1);
  expect(sim.report().chiefFellAt).toBeUndefined();
  sim.drainEvents();
  expect(sim.trigger(log.id).ok).toBe(true);
  const events = sim.drainEvents();
  const death = events.find((e): e is Extract<SimEvent, { type: 'enemy_dead' }> => e.type === 'enemy_dead' && e.id === chief.id)!;
  const release = events.find(e => e.type === 'log_release');
  const sweep = release?.sweeps.find(e => e.before.id === chief.id)!;
  expect(death).toBeDefined();
  expect([death.x, death.y]).toEqual([sweep.landingX, sweep.landingY]);
  expect([death.x, death.y]).not.toEqual([sweep.before.x, sweep.before.y]);
  expect(sim.report().chiefFellAt).toEqual({ x: death.x, y: death.y });
});
