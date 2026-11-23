import { expect, it } from 'vitest';
import { GardenEscort } from '../src/core/garden-escort';

it('keeps the walker safe while crouched, and delays a curtain signal', () => {
  const garden = new GardenEscort(false, 42);
  garden.position = garden.patrolAt(0);
  for (let i = 0; i < 60; i++) garden.step(1 / 60);
  expect(garden.alert).toBe(0);
  garden.signal();
  garden.step(.2);
  expect(garden.walking).toBe(false);
  garden.step(.21);
  expect(garden.walking).toBe(true);
});

it('can reach the kitchen by reading the patrols, even with an improvised signal', () => {
  for (const lamp of [true, false]) {
    const game = new GardenEscort(lamp, 42);
    for (let i = 0; i < 18000 && game.outcome === 'playing'; i++) {
      if (game.watched === game.advance) game.signal();
      game.step(1 / 60);
    }
    expect(game.outcome).toBe('home');
    expect(game.garden).toBe(2);
  }
});

it('costs a warning when seen moving and ends after the second sighting', () => {
  const game = new GardenEscort(true, 0);
  for (let scare = 0; scare < 2; scare++) {
    game.signal();
    for (let i = 0; i < 70 && game.strikes === scare; i++) {
      game.position = 4.5;
      game.time = game.layout.patrols[0].period * (0.75 - game.layout.patrols[0].phase);
      game.step(1 / 60);
    }
  }
  expect(game.outcome).toBe('fled');
});
