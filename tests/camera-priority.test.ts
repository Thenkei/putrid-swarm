import { describe, expect, it } from 'vitest';
import { cameraPriority } from '../src/core/camera-priority';
import type { SectorId } from '../src/core/types';

type Camera = Parameters<typeof cameraPriority>[0][number];

function camera(sector: SectorId, status: Partial<Omit<Camera, 'sector' | 'threat'>> = {}, threat: Partial<Camera['threat']> = {}): Camera {
  return { sector, doorRatio: 1, dark: false, cue: false, ...status, threat: { count: 0, atDoor: 0, boss: null, breached: false, ...threat } };
}

describe('night camera priority', () => {
  it('checks an endangered door before a large crowd, and a breach under pressure first', () => {
    const crowd = camera('grange', { cue: true }, { count: 24, boss: 'mower' });
    const weak = camera('arriere', { doorRatio: 0.2 }, { count: 1, atDoor: 1 });
    const breach = camera('verger', { doorRatio: 0 }, { count: 1, breached: true });
    expect(cameraPriority([crowd, weak], 'portail')).toEqual({ sector: 'arriere', reason: 'critical' });
    expect(cameraPriority([crowd, breach, weak], 'portail')).toEqual({ sector: 'verger', reason: 'breached' });
  });

  it('uses audible pressure on a dead feed and ignores its hidden crowd and trap cue', () => {
    const dead = camera('verger', { dark: true, doorRatio: 0.1, cue: true }, { count: 20, boss: 'mower' });
    const live = camera('grange', {}, { count: 1 });
    expect(cameraPriority([dead, live], 'portail')?.sector).toBe('grange');
    expect(cameraPriority([{ ...dead, threat: { ...dead.threat, atDoor: 1 } }, live], 'portail')).toEqual({ sector: 'verger', reason: 'critical' });
  });

  it('holds the current feed on a tie and avoids jumping when nothing is happening', () => {
    const gate = camera('portail', {}, { count: 3 });
    const barn = camera('grange', {}, { count: 3 });
    expect(cameraPriority([gate, barn], 'grange')?.sector).toBe('grange');
    expect(cameraPriority([camera('portail'), camera('verger', { doorRatio: 0 }, { breached: true })], 'grange')).toBeNull();
  });
});
