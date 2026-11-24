import { expect, it } from 'vitest';
import { GardenEscort } from '../src/core/garden-escort';

it('predicts the approaching gaze using the remaining curtain delay', () => {
  for (const alreadyWalking of [false, true]) {
    const game = new GardenEscort(false, 0);
    game.position = 9.79;
    game.time = 1.92;
    game.walking = game.advance = alreadyWalking;
    game.signal();
    const warning = game.closingIn;
    expect(game.watched).toBe(false);
    expect(warning).toBe(true);
    for (let i = 0; i < 55; i++) game.step(.01);
    expect(warning).toBe(game.watched);
  }
});

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

it('anchors the acknowledgement to the signal and releases the pose at the next gate', () => {
  const game = new GardenEscort(true, 42);
  game.position = game.layout.length - .1;
  game.step(.5);
  game.signal();
  expect(game.signalTime).toBe(.5);
  expect(game.signalPosition).toBe(game.position);
  expect(game.step(.05)).toBe('next');
  expect(game.signalTime).toBe(-Infinity);
  expect(game.advance).toBe(false);
  game.signal();
  expect(game.signalTime).toBe(0);
  expect(game.signalPosition).toBe(0);
});
