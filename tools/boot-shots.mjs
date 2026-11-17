#!/usr/bin/env node
// Dev aid: what a visitor meets before the game, and whether the keys shown are the keys they have.
//   node tools/boot-shots.mjs <outDir> [baseUrl]
// Shots: the content warning on a first visit and the title behind it, the title straight away on a
// second visit, "you need a keyboard" on a phone, and the night desk before and after the keyboard
// gives its layout away (a key pressed on an AZERTY keyboard, then on a QWERTY one).
// PS_BROWSER=chrome|firefox|webkit, PS_LANG=en for English.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER, launch } from './browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? 'shots');
const URL = process.argv[3] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const LANG = process.env.PS_LANG ?? 'fr';
mkdirSync(OUT, { recursive: true });

const T =
  LANG === 'fr'
    ? { understood: 'J’ai compris', cont: 'Continuer', night: 'Attendre la nuit', begin: 'Prendre le poste', anyway: 'Continuer quand même' }
    : { understood: 'Understood', cont: 'Continue', night: 'Wait for night', begin: 'Take the desk', anyway: 'Continue anyway' };
const locale = LANG === 'fr' ? 'fr-FR' : 'en-GB';

const saves = JSON.parse(execFileSync('npx', ['tsx', 'tools/orchard-saves.ts'], { cwd: ROOT, encoding: 'utf8' }));
const browser = await launch();
const errors = [];
const watch = (page) => {
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
};
const wait = (page, ms) => page.waitForTimeout(ms);
const shot = async (page, name) => {
  await page.screenshot({ path: join(OUT, `${BROWSER}-${name}.png`) });
  console.log(`shot ${BROWSER}-${name}`);
};

// ── A first visit, then a second ──
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale });
  const page = await context.newPage();
  watch(page);
  await page.goto(URL);
  // Let the first load finish: a reload in the middle of it aborts its fetches, which some browsers report.
  await page.getByText(/J’ai compris|Understood/).waitFor({ timeout: 90000 });
  await page.evaluate((lang) => {
    localStorage.clear();
    localStorage.setItem('putrid-swarm.lang', lang);
    localStorage.setItem('putrid-swarm.sound', 'off');
  }, LANG);
  await page.reload();
  await page.getByText(T.understood, { exact: true }).waitFor({ timeout: 60000 });
  await wait(page, 600);
  await shot(page, '01-warning');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.crt', { timeout: 15000 });
  await wait(page, 1500);
  await shot(page, '02-title');
  await page.reload();
  await page.waitForSelector('.crt', { timeout: 60000 });
  console.log('second visit: warning shown =', (await page.getByText(T.understood, { exact: true }).count()) > 0);

  // ── The night desk, and the letters on its keys ──
  await page.evaluate((save) => localStorage.setItem('putrid-swarm.save.v1', save), saves.evening);
  await page.reload();
  await page.waitForSelector('.crt', { timeout: 60000 });
  await wait(page, 1200);
  await page.getByText(T.cont, { exact: false }).first().click();
  await page.getByText(T.night, { exact: true }).click({ timeout: 15000 });
  await wait(page, 1200);
  await page.getByText(T.begin, { exact: true }).click();
  await wait(page, 1800);
  const labels = () => page.evaluate(() => [...document.querySelectorAll('.key b')].map((b) => b.textContent).join(''));
  // What the key types, as the keyboard would send it: Playwright's own keyboard is always a US one.
  const type = (code, key) =>
    page.evaluate(
      ([c, k]) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: k }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: k }));
      },
      [code, key],
    );
  console.log('labels, guessed       :', await labels());
  await shot(page, '03-night-guessed');
  await type('KeyW', 'z');
  await wait(page, 300);
  console.log('labels, after AZERTY Z:', await labels());
  await shot(page, '04-night-azerty');
  await type('KeyQ', 'q');
  await wait(page, 300);
  console.log('labels, after QWERTY Q:', await labels());
  await type('KeyY', 'z');
  await wait(page, 300);
  console.log('labels, after QWERTZ Z:', await labels());
  await context.close();
}

// ── On a phone ──
if (BROWSER === 'firefox') console.log('(phone emulation is not available in Firefox: the keyboard notice is not shot)');
else {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale });
  const page = await context.newPage();
  watch(page);
  const fetched = [];
  page.on('request', (request) => fetched.push(request.url()));
  await page.goto(URL);
  await page.getByText(T.anyway, { exact: true }).waitFor({ timeout: 30000 });
  await wait(page, 400);
  await shot(page, '05-phone-keyboard');
  // Nothing heavy may have been asked for yet.
  console.log('fetched before going on:', fetched.filter((url) => /\/assets\//.test(url)).length, 'asset file(s)');
  await page.getByText(T.anyway, { exact: true }).tap();
  await page.getByText(T.understood, { exact: true }).waitFor({ timeout: 90000 });
  console.log('went on anyway: the game loads');
  await context.close();
}

console.log(errors.length === 0 ? 'no console issues' : `${errors.length} console issue(s):\n${errors.join('\n')}`);
await browser.close();
