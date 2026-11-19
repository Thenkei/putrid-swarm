import { expect, it } from 'vitest';
import { detectContact, hasDetector } from '../src/core/dead-channel';
import { LOCATIONS } from '../src/core/data/locations';
import { newGame, prepareSearch, travelTo } from '../src/core/game';
import { outageFor } from '../src/core/orchard';
import { deserialize, serialize } from '../src/core/save';

it('can recover the detector before the orchard outage and keeps it in the campaign save', () => {
  const outing = travelTo(newGame(12), 'hardware');
  if (!outing.ok) throw new Error('Hardware shop should be open');
  const index = LOCATIONS.hardware.spots.findIndex(spot => spot.key === 'detector');
  const attempt = prepareSearch(outing.value.state, index);
  if (!attempt.ok) throw new Error('Detector should be searchable');
  expect(hasDetector(attempt.value.failure)).toBe(false);
  const saved = deserialize(serialize(attempt.value.success.state))!;
  expect(hasDetector(saved)).toBe(true);
  expect(outageFor({ ...saved, day: 2 })?.sector).toBe('verger');
});

it('reads only the nearest living contact in range in the offline sector', () => {
  const dead = { alive: false, x: 8.5, y: 10.5 };
  const outside = { alive: true, x: 9.5, y: 7.5 };
  const far = { alive: true, x: 0.5, y: 16.5 };
  const approach = { alive: true, x: 5.5, y: 10.5 };
  expect(detectContact('verger', [dead, outside, far])).toBeNull();
  expect(detectContact('verger', [approach, dead, outside, far])).toBe(3);
});
