import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/game';
import type { DeviceTypeId } from '../src/core/types';
import { HIT_REACTION_SECONDS, LOG_CONTACT_SECONDS, NightSim, type Enemy } from '../src/core/night';
import { build } from '../src/core/yard';
import { LogReactions } from '../src/render/log-sweep';

it('keeps the captured runner flat until nearby spikes rearm under the net', () => {
  let state = newGame(42);
  state = { ...state, hoursLeft: 12, inventory: { wood: 30, scrap: 30, wire: 30, battery: 30, springs: 30 }, yard: { ...state.yard, devices: [] } };
  const layout: [DeviceTypeId, number, number][] = [['log', 10, 17], ['net', 9, 17], ['spikes', 10, 16]];
  for (const [type, x, y] of layout) {
    const placed = build(state, type, x, y);
    if (!placed.ok) throw Error('Cannot place ' + type);
    state = placed.value;
  }
  const sim = new NightSim(5, state.yard, 42);
  const [log, , spikes] = sim.devices;
  // The stakes are resetting from a previous activation as the runner arrives.
  spikes!.state = 'rearming';
  spikes!.timer = 8.2;
  let caughtAt: number | undefined;
  for (let i = 0; i < 600; i++) {
    sim.step(1 / 60);
    const runner = sim.enemies.find(e => e.id === 1);
    if (runner && runner.nettedFor > 0) {
      caughtAt ??= sim.time;
      expect(runner.crawlDepth).toBe(1);
      expect(runner.crawlLog).toBe(log);
      expect(sim.opportunity(log!.id).targets).toBeGreaterThan(0);
    }
    const death = sim.drainEvents().find(e => e.type === 'enemy_dead' && e.id === 1);
    if (death?.type === 'enemy_dead') {
      expect(death.pose.crawlDepth).toBe(1);
      expect(death.pose.crawlLog).toEqual({ x: log!.x, y: log!.y });
      expect(sim.time - caughtAt!).toBeGreaterThan(0.5);
      return;
    }
  }
  throw Error('The stakes did not catch the netted runner');
});

describe('overlapping swings', () => {
  it('shows a brute surviving the first log before the second catches it in flight', () => {
    const game = newGame(42);
    const logs = [10, 12].map((x, i) => ({ id: i + 1, type: 'log' as const, x, y: 2, hp: 130, facing: 0 as const, broken: false }));
    const sim = new NightSim(6, { ...game.yard, devices: logs }, 42);
    while (sim.time < 30 && !sim.enemies.some(e => e.type === 'brute' && e.y >= 2.4)) sim.step(1 / 60);
    const brute = sim.enemies.find(e => e.type === 'brute')!;
    const reactions = new LogReactions();
    const hit = (id: number) => {
      expect(sim.trigger(id).ok).toBe(true);
      const events = sim.drainEvents();
      const release = events.find(e => e.type === 'log_release');
      if (release?.type !== 'log_release') throw Error('Missing log release');
      reactions.release(release.contactAt, release.sweeps, sim.time);
      return { contact: release.contactAt, death: events.find(e => e.type === 'enemy_dead' && e.id === brute.id) };
    };
    const first = hit(1);
    for (let i = 0; i < 5; i++) sim.step(1 / 60);
    const second = hit(2);
    if (second.death?.type !== 'enemy_dead') throw Error('Expected the second log to kill the brute');
    sim.step(1 / 60); // Remove the brute from the simulation before either log has visibly landed.

    const seen = (time: number) => reactions.enemies(sim.enemies, time).find(e => e.id === brute.id);
    expect(seen(first.contact - 0.001)).toMatchObject({ hp: 230, hitFlash: 0 });
    const struck = seen(first.contact)!;
    expect(struck).toMatchObject({ hp: 100, hitFlash: HIT_REACTION_SECONDS });
    const inFlight = seen(second.contact - 0.00001)!;
    expect(Math.hypot(inFlight.x - struck.x, inFlight.y - struck.y)).toBeGreaterThan(0.1);
    expect(seen(second.contact)).toBeUndefined();
    const body = { ...second.death.pose, id: brute.id, age: 0 };
    const fallen = reactions.bodies([body], second.contact)[0]!;
    expect(fallen.x).toBeCloseTo(inFlight.x, 3);
    expect(fallen.y).toBeCloseTo(inFlight.y, 3);
    expect(reactions.bodies([body], second.contact + 0.3)[0]).toMatchObject({ x: body.x, y: body.y });
  });
});

function crossing(type: 'runner' | 'dog') {
  const state = newGame(42);
  const strong = { level: 1, hp: 280 } as const;
  const barricades = { portail: { level: 0 as const, hp: 80 }, grange: strong, verger: strong, arriere: strong };
  const yard = build({ ...state, yard: { ...state.yard, devices: [], barricades } }, 'log', 10, 17);
  if (!yard.ok) throw Error('Cannot place crossing log');
  const side = build({ ...yard.value, inventory: state.inventory, hoursLeft: 12 }, 'log', 9, 17);
  if (!side.ok) throw Error('Cannot place side log');
  const sim = new NightSim(type === 'dog' ? 4 : 5, side.value.yard, 42);
  for (let i = 0; i < 1200; i++) {
    sim.step(1 / 60);
    const crawler = sim.enemies.find(e => e.type === type && e.crawlDepth === 1);
    if (crawler) return { sim, crawler };
  }
  throw Error('The first crawler did not reach the gate');
}

describe('log impact on camera', () => {
  it.each(['runner', 'dog'] as const)('keeps a %s under its own log, then carries its low pose through a fatal side impact', type => {
    const { sim, crawler } = crossing(type);
    expect(sim.trigger(sim.devices[0]!.id).ok).toBe(true);
    const clear = sim.drainEvents().find(e => e.type === 'log_release');
    expect(clear?.type === 'log_release' && clear.sweeps.every(s => s.before.id !== crawler.id)).toBe(true);
    expect(sim.trigger(sim.devices[1]!.id).ok).toBe(true);
    const events = sim.drainEvents();
    const release = events.find(e => e.type === 'log_release');
    const death = events.find(e => e.type === 'enemy_dead' && e.id === crawler.id);
    if (release?.type !== 'log_release' || death?.type !== 'enemy_dead') throw Error('Missing side impact');
    const contactAt = sim.time + LOG_CONTACT_SECONDS;
    expect(death.showAt).toBe(contactAt);
    expect(death.pose.crawlDepth).toBe(1);
    const effects = new LogReactions();
    effects.release(release.contactAt, release.sweeps, sim.time);
    sim.step(1 / 60);
    const before = effects.enemies(sim.enemies, contactAt - 0.001).find(e => e.id === crawler.id)!;
    expect(before.action).toBe('crawl');
    expect(effects.enemies(sim.enemies, contactAt).some(e => e.id === crawler.id)).toBe(false);
    const body = { ...death.pose, id: crawler.id, age: 0 };
    expect(effects.bodies([body], contactAt)[0]).toMatchObject({ x: before.x, y: before.y });
    expect(effects.bodies([body], contactAt + HIT_REACTION_SECONDS)[0]).toEqual(body);
  });

  it('recoils a surviving target at contact before its feet move', () => {
    const { sim, crawler } = crossing('runner');
    // Give this actor enough health to survive the second swing.
    crawler.hp = 200;
    sim.trigger(sim.devices[1]!.id);
    const release = sim.drainEvents().find(e => e.type === 'log_release');
    if (release?.type !== 'log_release') throw Error('Missing release');
    const effects = new LogReactions();
    effects.release(release.contactAt, release.sweeps, sim.time);
    const view = (age: number): Enemy => effects.enemies(sim.enemies, release.contactAt + age).find(e => e.id === crawler.id)!;
    const before = view(-0.01);
    expect(before).toMatchObject({ hp: 200, hitFlash: 0, crawlDepth: 1 });
    expect(view(0)).toMatchObject({ x: before.x, y: before.y, hp: crawler.hp, hitCrawlDepth: 1 });
    expect(view(0.12).y).not.toBeCloseTo(before.y, 3);
    effects.advance(release.contactAt + HIT_REACTION_SECONDS + 0.01);
    expect(view(1)).toBe(crawler);
  });
});
