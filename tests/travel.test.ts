import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from '../src/engine/app';
import { audio } from '../src/engine/audio';
import { TravelScene } from '../src/scenes/travel';

function leavingLocation() {
  const clock = { time: 12 };
  const next = vi.fn();
  const play = vi.spyOn(audio, 'play').mockImplementation(() => {});
  const travel = new TravelScene(clock as App, { plate: 'plate_return', title: '', sub: '', ignitionAt: 12.35, next });
  return { clock, travel, next, play };
}

describe('the return starter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stays silent when the player skips before ignition', () => {
    const { clock, travel, next, play } = leavingLocation();
    travel.onKeyDown('Space');
    clock.time = 13;
    travel.update(0.1);
    expect(play).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('starts once on a continued trip and stops once at the destination', () => {
    const { clock, travel, next, play } = leavingLocation();
    travel.update(0.1);
    expect(play).not.toHaveBeenCalled();
    clock.time = 12.36;
    travel.update(0.1);
    travel.update(0.1);
    travel.onPointerDown();
    travel.onKeyDown('Enter');
    expect(play.mock.calls.map(([effect]) => effect)).toEqual(['engine', 'engine_stop']);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
