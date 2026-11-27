import { describe, expect, it } from 'vitest';
import { newGame, travelTo } from '../src/core/game';
import { epicFlag, markEpic } from '../src/core/epics';
import { forceGarageKey, garageModel, keyForGarageModel, tryGarageKey } from '../src/core/garage-ignition';
import { LOCATIONS } from '../src/core/data/locations';
import { deserialize, serialize } from '../src/core/save';

const trip = travelTo({ ...newGame(587), day: 2 }, 'garage');
if (!trip.ok) throw Error('Garage unreachable');
const start = trip.value.state;
const correct = keyForGarageModel(start.seed, garageModel(start.seed));
const take = (offset: number) => (correct + offset) % 5 + 1;

describe('Gérard’s ignition', () => {
  it('unlocks the ignition on day two', () => {
    const held = markEpic(start, 'garageHeldKey', take(0));
    expect(tryGarageKey({ ...held, day: 1 }).result).toBe('unavailable');
    expect(tryGarageKey(held).result).toBe('started');
  });

  it('charges each attempt and reserves daylight for the return trip', () => {
    const held = markEpic(start, 'garageHeldKey', take(0));
    const limit = LOCATIONS.garage.travelHours + .5;
    const late = { ...held, hoursLeft: limit - .25 };
    expect(tryGarageKey(late).state).toBe(late);
    const last = tryGarageKey({ ...held, hoursLeft: limit });
    expect(last.result).toBe('started');
    expect(last.state.hoursLeft).toBe(LOCATIONS.garage.travelHours);
    expect(tryGarageKey(last.state).state).toBe(last.state);
  });

  it('lets the player back out after two different wrong keys and later start the moped', () => {
    const first = tryGarageKey(markEpic(start, 'garageHeldKey', take(1)));
    expect(first.result).toBe('wrong');
    expect(forceGarageKey(first.state)).toBe(first.state);
    expect(tryGarageKey(first.state).result).toBe('wrong');
    const second = tryGarageKey(markEpic(first.state, 'garageHeldKey', take(2)));
    expect(second.result).toBe('resists');
    expect(second.state.hoursLeft).toBe(start.hoursLeft - 1);
    const success = tryGarageKey(markEpic(second.state, 'garageHeldKey', take(0)));
    expect(success.result).toBe('started');
    expect(success.state.hoursLeft).toBe(start.hoursLeft - 1.5);
    expect(epicFlag(success.state, 'garageKey')).toBe(1);
    const broken = forceGarageKey(second.state);
    expect(broken.hoursLeft).toBe(second.state.hoursLeft);
    const resumed = deserialize(serialize(broken))!;
    expect(epicFlag(resumed, 'garageStarterBroken')).toBe(1);
    expect(epicFlag(resumed, 'garageKey')).toBe(0);
    expect(tryGarageKey(markEpic(resumed, 'garageHeldKey', take(0))).result).toBe('unavailable');
  });
});
