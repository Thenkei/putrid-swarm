import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';

const people = (table: typeof fr): string[] => [...table.credits.sofa.names, ...table.credits.roll.flatMap((entry) => entry.names)];

describe('the credits', () => {
  it('name the three who were on the sofa, and whose game it is', () => {
    expect([...fr.credits.sofa.names].sort()).toEqual(['Alexandre Guillamier', 'Alexis Lafont', 'Morgan Perre']);
    expect(fr.credits.roll[0]?.names).toEqual(['Morgan Perre']);
    expect(fr.credits.roll[1]?.names).toEqual(['Alexis Lafont', 'Alexandre Guillamier']);
  });

  it('spell every name the same in both languages', () => {
    expect(en.credits.sofa.names).toEqual(fr.credits.sofa.names);
    expect(en.credits.roll.map((entry) => entry.names.length)).toEqual(fr.credits.roll.map((entry) => entry.names.length));
    for (const name of ['Morgan Perre', 'Alexis Lafont', 'Alexandre Guillamier']) {
      expect(people(en).filter((n) => n === name).length).toBe(people(fr).filter((n) => n === name).length);
    }
    expect(en.credits.sign).toBe(fr.credits.sign);
  });

  it('give nothing of the story away', () => {
    const text = [fr, en].map((table) => JSON.stringify(table.credits).toLowerCase()).join(' ');
    for (const word of ['lapin', 'rabbit', 'tondeuse', 'mower', 'scie', 'saw', 'bras', 'arm ', 'boulanger', 'baker', 'guitar']) expect(text).not.toContain(word);
  });
});
