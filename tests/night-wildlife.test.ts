import { describe, expect, it } from 'vitest';
import { NightWildlife } from '../src/scenes/night-wildlife';

describe('the night watch wildlife', () => {
  it('calls once in a three-second lull, leaves at the first enemy and waits between visits', () => {
    const yard = new NightWildlife(() => .5);
    const sounds = Array.from({ length: 179 }, (_, i) => yard.step(1 / 60, 0, 3 - i / 60, false));
    expect(sounds.filter(sound => sound === 'owl_call')).toHaveLength(1);
    expect(yard.owl?.opacity).toBeLessThan(.2);
    yard.step(1 / 60, 1, null, false);
    expect(yard.owl).toBeNull();
    expect(yard.step(.6, 0, 2, false)).not.toBe('owl_call');
    expect(yard.owl).toBeNull();
    for (let i = 0; i < 24; i++) expect(yard.step(1, 1, null, false)).not.toBe('owl_call');
    expect(yard.step(.6, 0, 2, false)).toBe('owl_call');
  });

  it('keeps the hedge quiet during speech and crowds, and spaces the little sounds apart', () => {
    const yard = new NightWildlife(() => 0);
    for (let i = 0; i < 30; i++) expect(yard.step(1, 1, null, true)).toBeUndefined();
    for (let i = 0; i < 30; i++) expect(yard.step(1, 6, null, false)).toBeUndefined();
    const heard = Array.from({ length: 30 }, () => yard.step(1, 1, null, false)).filter(Boolean);
    expect(heard).toContain('hedge_twig');
    expect(heard).toContain('hedge_leaves');
    expect(heard.length).toBeLessThanOrEqual(5);
    expect(yard.hush()).toBe(true);
    expect(yard.hush()).toBe(false);
  });
});
