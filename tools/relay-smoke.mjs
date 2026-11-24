// node --import tsx tools/relay-smoke.mjs
// The last-watch presets arrive while the player can already be turning either dial.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { newGame } from '../src/core/game.ts';
import { launch } from './browser.mjs';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await launch();
try {
  const p = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'en-GB' });
  const errors = [];
  p.on('pageerror', error => errors.push(error.message));
  const state = { ...newGame(11), day: 7, hoursLeft: 0, orchard: 'spared', flags: { 'epic.neighbor': 1, 'epic.cub': 1 } };
  for (const gate of Object.values(state.yard.barricades)) gate.hp = 100000;
  state.yard.houseHp = 100000;
  await p.addInitScript(save => {
    for (const [key, value] of Object.entries({ warned:'1', coach:'1', lang:'en', sound:'off', 'save.v1':JSON.stringify(save) }))
      localStorage.setItem('putrid-swarm.' + key, value);
  }, state);
  await p.goto(server.resolvedUrls.local[0]);
  const button = name => p.getByRole('button', { name, exact: true });
  await button('Continue').click();
  await button('Wait for night').click();
  await button('Take the desk').click();
  await p.locator('.night-alert').waitFor({ state: 'attached' });
  await p.keyboard.press('F4'); // Built-in development speed-up for the waves leading to the relay.
  const frequency = p.getByRole('slider', { name:'Frequency' });
  const phase = p.getByRole('slider', { name:'Phase' });
  await frequency.waitFor({ timeout: 170000 });
  assert.equal(await frequency.inputValue(), '1');
  assert.equal(await phase.inputValue(), '0');
  await frequency.press('ArrowRight');
  const clue = p.locator('.relay-clue');
  await clue.filter({ hasText: 'Frequency 4' }).waitFor();
  assert.equal(await frequency.inputValue(), '2', 'the third flash moved the dial out of the player’s hand');
  await clue.filter({ hasText: 'Phase 2' }).waitFor();
  assert.equal(await phase.inputValue(), '2', 'the cub should tune an untouched phase dial');
  assert.equal(await p.locator('.last-watch-state').getAttribute('data-locked'), 'false');
  await frequency.press('ArrowRight');
  await frequency.press('ArrowRight');
  await button('Engage relay').click();
  await p.locator('.last-watch-state').filter({ hasText: 'Relay connected' }).waitFor();
  await button('Back to the desk').click();
  await p.locator('.epic-night').waitFor({ state:'detached' });
  assert.deepEqual(errors, []);
  console.log('Passed: a delayed relay preset preserves a manual turn, the other preset arrives, and the desk reconnects.');
} finally {
  await browser.close();
  await server.close();
}
