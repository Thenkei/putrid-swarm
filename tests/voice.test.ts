import { describe, expect, it } from 'vitest';
import { LINES, linesFor, type Moment } from '../src/engine/voice';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';

/** What has a recording: the audio pipeline's own list of processed files. */
const recorded: Record<string, unknown> = Object.values(import.meta.glob<Record<string, unknown>>('../public/assets/audio/manifest.json', { eager: true, import: 'default' }))[0] ?? {};
const MOMENTS = Object.keys(LINES) as Moment[];

it('ships the daily episodes with recorded action cues and both subtitle languages', () => {
  for (const id of ['epic_flare', 'moped_door', 'moped_blade_contact', 'epic_mob', 'epic_mob_blast', 'epic_tape', 'vhs_eject', 'epic_pack']) {
    expect(recorded[id]).toMatchObject({ kind: 'sfx', file: id + '.mp3' });
  }
  for (const id of ['vo_epic_stove', 'vo_moped_alibi', 'vo_epic_pack', 'vo_epic_neighbor'] as const) {
    expect(recorded[id]).toMatchObject({ kind: 'voice', file: id + '.mp3' });
    expect(fr.voice[id]).toBeTruthy();
    expect(en.voice[id]).toBeTruthy();
  }
});

describe('what the protagonist says once the arm is gone', () => {
  it('keeps every moment as it was while he has both arms', () => {
    for (const moment of MOMENTS) expect(linesFor(moment)).toEqual(LINES[moment]);
  });

  it('mixes lines about the arm into the moments heard every day, and only once it is gone', () => {
    for (const moment of ['car', 'home', 'nightfall', 'dawn'] as const) {
      const about = linesFor(moment, true).filter((line) => line.includes('_arm'));
      expect(about.length).toBeGreaterThanOrEqual(3);
      expect(linesFor(moment).some((line) => line.includes('_arm'))).toBe(false);
      // Still mostly the usual lines: the arm comes up now and then, not every time.
      expect(about.length).toBeLessThan(linesFor(moment, true).length / 2);
    }
  });

  it('no longer comes home "in one piece"', () => {
    expect(linesFor('home')).toContain('vo_home_3');
    expect(linesFor('home', true)).not.toContain('vo_home_3');
  });

  it('has several variants of anything heard repeatedly, in both languages and recorded', () => {
    for (const moment of MOMENTS) {
      for (const oneArmed of [false, true]) {
        const lines = linesFor(moment, oneArmed);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        for (const line of lines) {
          expect(fr.voice[line]).toBeTruthy();
          expect(en.voice[line]).toBeTruthy();
          expect(recorded[line], `${line} is not recorded`).toBeDefined();
        }
      }
    }
    expect(recorded['vo_one_hand']).toBeDefined();
  });
});
