import { describe, expect, it } from 'vitest';
import { touchOnly } from '../src/engine/device';
import { NO_LABELS, learn, rowOf, type KeyLabels } from '../src/engine/keys';

const press = (labels: KeyLabels, ...keys: readonly (readonly [string, string])[]): KeyLabels => keys.reduce((known, [code, key]) => learn(known, code, key), labels);
const shown = (labels: KeyLabels, lang: 'fr' | 'en' = 'fr'): string => rowOf(labels, lang).join('');

describe('the letters shown on the trap keys', () => {
  it('guesses from the language until the keyboard says otherwise', () => {
    expect(shown(NO_LABELS, 'fr')).toBe('AZERTY');
    expect(shown(NO_LABELS, 'en')).toBe('QWERTY');
  });

  it('believes the browser over everything else', () => {
    const mapped: KeyLabels = { ...NO_LABELS, mapped: ['Q', 'W', 'F', 'P', 'G', 'J'] };
    expect(shown(press(mapped, ['KeyQ', 'a']), 'fr')).toBe('QWFPGJ');
  });

  it('knows the whole row from one telling key', () => {
    expect(shown(press(NO_LABELS, ['KeyQ', 'q']), 'fr')).toBe('QWERTY');
    expect(shown(press(NO_LABELS, ['KeyW', 'z']), 'en')).toBe('AZERTY');
    expect(shown(press(NO_LABELS, ['KeyY', 'z']), 'fr')).toBe('QWERTZ');
  });

  it('learns nothing from a key that every layout shares, nor from other keys', () => {
    expect(press(NO_LABELS, ['KeyE', 'e'])).not.toBe(NO_LABELS);
    expect(shown(press(NO_LABELS, ['KeyE', 'e']), 'fr')).toBe('AZERTY');
    expect(press(NO_LABELS, ['Space', ' '])).toBe(NO_LABELS);
    expect(press(NO_LABELS, ['KeyQ', 'Shift'])).toBe(NO_LABELS);
    expect(press(NO_LABELS, ['KeyQ', 'Dead'])).toBe(NO_LABELS);
    expect(press(NO_LABELS, ['KeyQ', '1'])).toBe(NO_LABELS);
  });

  it('shows a key as it was typed on a layout it does not know', () => {
    // Dvorak: the top-left row types ' , . p y f; only the letters can be shown.
    expect(shown(press(NO_LABELS, ['KeyR', 'p'], ['KeyT', 'y'], ['KeyY', 'f']), 'en')).toBe('QWEPYF');
  });

  it('forgets one keyboard when another answers', () => {
    const azerty = press(NO_LABELS, ['KeyQ', 'a'], ['KeyW', 'z']);
    expect(shown(azerty, 'en')).toBe('AZERTY');
    expect(shown(press(azerty, ['KeyQ', 'q']), 'fr')).toBe('QWERTY');
    expect(shown(press(azerty, ['KeyQ', 'q'], ['KeyY', 'z']), 'fr')).toBe('QWERTZ');
  });

  it('returns the same labels when a press says nothing new', () => {
    const known = press(NO_LABELS, ['KeyQ', 'a']);
    expect(learn(known, 'KeyQ', 'A')).toBe(known);
  });
});

describe('a screen with no keyboard in front of it', () => {
  it('is a touch screen with nothing finer and nothing to hover with', () => {
    expect(touchOnly({ touch: true, finePointer: false, hover: false })).toBe(true);
  });

  it('is not a desk, a touch laptop or a tablet with a mouse', () => {
    expect(touchOnly({ touch: false, finePointer: true, hover: true })).toBe(false);
    expect(touchOnly({ touch: true, finePointer: true, hover: true })).toBe(false);
    expect(touchOnly({ touch: true, finePointer: true, hover: false })).toBe(false);
    expect(touchOnly({ touch: false, finePointer: false, hover: false })).toBe(false);
  });
});
