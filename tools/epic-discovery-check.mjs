// Run with node --import tsx tools/epic-discovery-check.mjs [screenshot-directory].
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';
import { launch } from './browser.mjs';
import { newGame } from '../src/core/game.ts';
const output = process.argv[2];
if (output) await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error' });
await server.listen();
const b = await launch();
const errors = [];
async function open(day, where, phone, flags = {}, hoursLeft = 0) {
  const p = await b.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: phone, isMobile: phone, locale: 'fr-FR', reducedMotion: 'reduce' });
  p.setDefaultTimeout(9500);
  p.on('pageerror', e => errors.push(e.message));
  const state = { ...newGame(54), day, where, hoursLeft, orchard: 'spared', flags };
  await p.addInitScript(s => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [k, v] of Object.entries({ warned: '1', coach: '1', sound: 'off', lang: 'fr', 'save.v1': JSON.stringify(s) })) localStorage.setItem('putrid-swarm.' + k, v);
  }, state);
  await p.goto(server.resolvedUrls.local[0]);
  if (phone) await p.locator('.gate button').tap();
  await p.getByRole('button', { name: 'Continuer', exact: true }).click();
  await p.locator('.topbar').waitFor();
  await p.waitForTimeout(700);
  return p;
}
async function shot(p, name) { if (output) await p.screenshot({ path: join(output, name + '.png') }); }
async function dayFind(day, where, kind, phone) {
  const p = await open(day, 'home', phone, {}, 12);
  await p.getByRole('button', { name: 'Prendre le break', exact: true }).click();
  await p.locator('[data-pin="' + where + '"]').click();
  await p.locator('.map-actions .btn-primary').click();
  await p.locator('.btn.skip').click();
  if (where !== 'shed') await p.locator('[data-route=wait]').click();
  await p.locator('.epic-find').waitFor();
  if (await p.getByRole('button', { name: 'OK', exact: true }).isVisible()) await p.getByRole('button', { name: 'OK', exact: true }).click();
  await p.waitForTimeout(550);
  const spot = p.locator('.epic-find');
  await shot(p, 'jour-' + day + '-vue-' + (phone ? 'mobile' : 'bureau'));
  await spot.click();
  const d = p.locator('.find-dialog');
  const first = d.locator('.find-left'), second = d.locator('.find-right');
  await first.click();
  await d.getByRole('button', { name: 'Carnet de terrain' }).click();
  const book = p.locator('.field-notebook');
  assert.equal(await book.locator('.notebook-leaf p').count(), 1);
  await book.getByRole('button', { name: 'Refermer' }).press('Enter');
  await book.waitFor({ state: 'detached' });
  await second.focus();
  await p.keyboard.press('Enter');
  const act = d.locator('.find-actions button').first();
  const label = await act.innerText();
  await p.keyboard.press('Escape');
  await d.waitFor({ state: 'detached' });
  assert.ok(await spot.evaluate(e => e === document.activeElement));
  await spot.press('Enter');
  await second.click();
  await act.click();
  await p.waitForFunction(k => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).flags['epic.' + k] === 1, kind);
  assert.equal(await d.locator('.find-actions button').count(), 1);
  await shot(p, 'jour-' + day + '-resultat-' + (phone ? 'mobile' : 'bureau'));
  await p.keyboard.press('Escape');
  await p.reload();
  if (phone) await p.locator('.gate button').tap();
  await p.getByRole('button', { name: 'Continuer', exact: true }).click();
  await spot.click();
  await second.press('Enter');
  assert.equal(await d.locator('.find-actions button').count(), 1);
  await d.getByRole('button', { name: 'Carnet de terrain' }).click();
  assert.equal(await book.locator('.notebook-leaf p').count(), 3);
  assert.equal(await book.locator('.notebook-index button').count(), 1);
  if (kind === 'trail') await shot(p, 'carnet-cabanon-' + (phone ? 'mobile' : 'bureau'));
  await book.getByRole('button', { name: 'Refermer' }).click();
  console.log('Day', day, phone ? 'phone' : 'desktop', label);
  await p.close();
}
async function refuge(day, phone) {
  const stove = day === 2;
  const p = await open(day, 'home', phone, { [stove ? 'epic.menu' : 'epic.photo']: 1 });
  await p.locator('summary').filter({ hasText: stove ? 'Gazinière' : 'Cendrier et lampe' }).click();
  await p.getByRole('button', { name: stove ? 'Entrer dans la cuisine' : 'Regarder par la fenêtre', exact: true }).click();
  const d = p.locator('.refuge-room'), pts = d.locator('.room-point');
  await pts.first().click();
  await d.getByText('Vue d’ensemble').click();
  await pts.last().press('Enter');
  await d.getByRole('button', { name: stove ? 'Réserver la gazinière pour le perron' : 'Poser la lampe à la fenêtre' }).click();
  await p.waitForFunction(k => JSON.parse(localStorage.getItem('putrid-swarm.save.v1')).flags['epic.' + k] === 1, stove ? 'stove' : 'lamp');
  await shot(p, 'refuge-' + day + '-' + (phone ? 'mobile' : 'bureau'));
  await p.keyboard.press('Escape');
  await p.getByRole('button', { name: stove ? 'Entrer dans la cuisine' : 'Regarder par la fenêtre' }).click();
  assert.equal(await d.locator('.room-point').count(), stove ? 1 : 2);
  await p.close();
}
try {
  for (const phone of [false, true]) {
    for (const [day, place, kind] of [[2, 'grocery', 'menu'], [4, 'post', 'vhs'], [5, 'shed', 'trail'], [6, 'grocery', 'photo']]) await dayFind(day, place, kind, phone);
    await refuge(2, phone);
    await refuge(6, phone);
  }
  assert.deepEqual(errors, []);
} finally {
  await b.close();
  await server.close();
}
