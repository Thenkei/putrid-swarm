import { describe, expect, it } from 'vitest';
import { BarnMoth, MOTH_CONTACT } from '../src/render/house-reactions';
import { NightWildlife } from '../src/scenes/night-wildlife';

describe('the night watch wildlife', () => {
  it('calls once in a three-second lull, leaves at the first enemy and waits between visits', () => {
    const yard = new NightWildlife(() => .5);
    const sounds = Array.from({ length: 179 }, (_, i) => yard.step(1 / 60, 0, 3 - i / 60, false));
    expect(sounds.filter(sound => sound === 'owl_call')).toHaveLength(1);
    expect(yard.owl?.opacity).toBe(1);
    const launchAge = yard.owl?.flightAge;
    expect(launchAge).toBeGreaterThan(0);
    yard.step(1 / 60, 1, null, false);
    expect(yard.owl?.flightAge).toBeGreaterThan(launchAge!);
    expect(yard.step(.6, 0, 2, false)).not.toBe('owl_call');
    yard.step(2, 0, 2, false);
    expect(yard.owl).toBeNull();
    for (let i = 0; i < 24; i++) expect(yard.step(1, 1, null, false)).not.toBe('owl_call');
    expect(yard.step(.6, 0, 2, false)).toBe('owl_call');
  });

  it('launches on an unexpected arrival and finishes its flight during a quieted watch', () => {
    const yard = new NightWildlife(() => .5);
    yard.step(.5, 0, null, false);
    expect(yard.owl?.flightAge).toBeNull();
    yard.step(.05, 1, null, false);
    expect(yard.owl?.flightAge).toBe(.05);
    yard.hush(.2);
    expect(yard.owl?.flightAge).toBe(.25);
    yard.hush(3);
    expect(yard.owl).toBeNull();
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

  it('times the rare fox to a twig snap and spaces out visits', () => {
    const yard = new NightWildlife(() => 0);
    expect(yard.step(4, 1, null, false)).toBe('hedge_twig');
    expect(yard.foxAge).toBe(0);
    yard.hush(.5);
    expect(yard.foxAge).toBe(.5);
    yard.hush(1.5);
    expect(yard.foxAge).toBeNull();
    for (let i = 0; i < 44; i++) {
      yard.step(1, 1, null, false);
      expect(yard.foxAge).toBeNull();
    }
    const busy = new NightWildlife(() => 0);
    expect(busy.step(4, 2, null, false)).toBe('hedge_twig');
    expect(busy.foxAge).toBeNull();
  });

  it('taps the glass once per visit and waits for the door to settle before returning', () => {
    const moth = new BarnMoth();
    expect(moth.step(MOTH_CONTACT - .01)).toBe(false);
    expect(moth.step(MOTH_CONTACT)).toBe(true);
    expect(moth.step(4)).toBe(false);
    moth.knock(5);
    moth.knock(6);
    expect(moth.flight).toBe(5);
    expect(moth.step(21)).toBe(false);
    expect(moth.flight).toBe(5);
    expect(moth.step(21.1)).toBe(false);
    expect(moth.flight).toBeNull();
    expect(moth.step(24)).toBe(true);
    const startled = new BarnMoth();
    startled.knock(.4);
    expect(startled.step(MOTH_CONTACT)).toBe(false);
  });
});
