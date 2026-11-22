#!/usr/bin/env node
// Regression tour of every scavenging puzzle in town: opens each spot of /puzzles.html in French then English,
// checks that the panel fits the stage and that no text overflows or is clipped, collects page errors,
// console errors and failed requests, saves one screenshot per spot per language, and exits 1 on any failure.
//   node tools/puzzle-shots.mjs [outDir] [baseUrl]
// outDir defaults to <tmp>/putrid-swarm-puzzle-shots; baseUrl to PS_URL, then http://localhost:5173/.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launch } from './browser.mjs';

const OUT = resolve(process.argv[2] ?? join(tmpdir(), 'putrid-swarm-puzzle-shots'));
const BASE = process.argv[3] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const LAB_URL = new URL('puzzles.html', BASE).href;
const LANGS = ['fr', 'en'];
// The lab's sidebar is 340px wide; this viewport leaves the 1280×720 stage at scale 1, so screenshots are 1:1.
const VIEWPORT = { width: 340 + 1280, height: 720 };
mkdirSync(OUT, { recursive: true });

/** One line per problem: `[where] message`. */
const failures = [];
let context = 'boot';
const fail = (message, where = context) => failures.push(`[${where}] ${message}`);

const browser = await launch();
// Reduced motion parks the few animated pieces (a record in flight), so screenshots are comparable run to run.
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'fr-FR', reducedMotion: 'reduce' });
page.on('pageerror', (e) => fail(`page error: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const source = m.location()?.url ?? '';
  // puzzles.html declares no icon, so the browser's own favicon probe 404s; that is not the lab failing.
  if (/\/favicon\.ico$/.test(source)) return;
  fail(`console error: ${m.text()}${source ? ` (${source})` : ''}`);
});
page.on('response', (r) => {
  if (r.status() >= 400) fail(`http ${r.status()} ${r.url()}`);
});
page.on('requestfailed', (r) => {
  // A request cut short by our own navigation is not a broken asset.
  if (r.failure()?.errorText !== 'net::ERR_ABORTED') fail(`request failed (${r.failure()?.errorText}) ${r.url()}`);
});

/**
 * Measures the open panel against the stage. Returns its layout problems (empty when clean) and the room left
 * between the case and the nearer of the stage's top and bottom edges. Runs in the page. Lengths are in stage pixels, so the checks hold whatever the stage scale.
 */
function measure() {
  const TOLERANCE = 1; // sub-pixel rounding of fractional line heights and borders
  const problems = [];
  const stage = document.getElementById('stage');
  const modal = document.querySelector('.modal.scavenge:not([data-tour-old])');
  const box = modal?.querySelector('.salvage-case');
  if (!stage || !box) return { problems: ['no .salvage-case in the open panel'], spare: null };
  const scale = stage.getBoundingClientRect().width / stage.offsetWidth;
  const origin = stage.getBoundingClientRect();
  const local = (el) => {
    const r = el.getBoundingClientRect();
    return {
      left: (r.left - origin.left) / scale, top: (r.top - origin.top) / scale,
      right: (r.right - origin.left) / scale, bottom: (r.bottom - origin.top) / scale,
      width: r.width / scale, height: r.height / scale,
    };
  };
  const describe = (el) => {
    const cls = [...el.classList].filter((c) => !c.startsWith('board-')).join('.');
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
    return `<${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}>${text ? ` "${text.length > 40 ? `${text.slice(0, 40)}…` : text}"` : ''}`;
  };
  const round = (n) => Math.round(n);

  // 1. The case sits inside the 1280×720 stage.
  const c = local(box);
  if (c.left < -TOLERANCE || c.top < -TOLERANCE || c.right > stage.offsetWidth + TOLERANCE || c.bottom > stage.offsetHeight + TOLERANCE) {
    problems.push(`case ${round(c.width)}×${round(c.height)} at (${round(c.left)},${round(c.top)}) does not fit the ${stage.offsetWidth}×${stage.offsetHeight} stage`);
  }

  // 2. Nothing is clipped by the case (it hides its overflow): its columns (the photo, the sheet) stay inside it,
  //    and everything in a column stays inside that column, so the sheet cannot spill into the photo either.
  if (box.scrollHeight > box.clientHeight + TOLERANCE || box.scrollWidth > box.clientWidth + TOLERANCE) {
    problems.push(`case content ${box.scrollWidth}×${box.scrollHeight} is clipped to ${box.clientWidth}×${box.clientHeight}`);
  }
  const sheet = box.querySelector(':scope > .salvage-sheet');
  if (!sheet) problems.push('no .salvage-sheet in the case');
  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // Absolutely positioned pieces (a record in flight, the vachette cow) move by design; their containers are checked instead.
  const inFlow = (el) => getComputedStyle(el).position !== 'absolute';
  const contain = (el, frame, frameName) => {
    const r = local(el);
    const past = [
      r.left < frame.left - TOLERANCE && `left by ${round(frame.left - r.left)}px`,
      r.top < frame.top - TOLERANCE && `top by ${round(frame.top - r.top)}px`,
      r.right > frame.right + TOLERANCE && `right by ${round(r.right - frame.right)}px`,
      r.bottom > frame.bottom + TOLERANCE && `bottom by ${round(r.bottom - frame.bottom)}px`,
    ].filter(Boolean);
    if (past.length) problems.push(`${describe(el)} runs past the ${frameName} (${past.join(', ')})`);
  };
  const columns = [...box.children].filter(visible);
  for (const column of columns) {
    contain(column, c, 'case');
    const frame = local(column);
    const name = column.classList.contains('salvage-sheet') ? 'sheet' : 'photo';
    for (const el of column.querySelectorAll('*')) if (visible(el) && inFlow(el)) contain(el, frame, name);
  }

  // 3. Text is never wider or taller than its own box: a clue, instruction, title or label that overflows, wraps out
  //    or is cut off. Checked on every block-level box that holds text of its own, plus the sheet's main blocks.
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
  const TEXT_BOXES = 'h2, .salvage-clue, .salvage-danger, .salvage-instruction, .salvage-status, .salvage-board, .salvage-back, .vachette-cost';
  for (const el of box.querySelectorAll('*')) {
    if (!visible(el) || el.clientWidth === 0) continue; // inline boxes have no client size; their block parent is checked
    if (!ownText(el) && !el.matches(TEXT_BOXES)) continue;
    const overX = el.scrollWidth - el.clientWidth;
    const overY = el.scrollHeight - el.clientHeight;
    if (overX > TOLERANCE) problems.push(`${describe(el)} overflows its width by ${overX}px`);
    if (overY > TOLERANCE) problems.push(`${describe(el)} overflows its height by ${overY}px`);
  }

  return { problems, spare: Math.floor(Math.min(c.top, stage.offsetHeight - c.bottom)) };
}

/** Waits until the page has painted twice, so measurements see the settled layout. */
const settle = async () => {
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))));
  await page.waitForTimeout(150);
};

const slug = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

await page.goto(LAB_URL);
await page.evaluate(() => {
  localStorage.setItem('putrid-swarm.sound', 'off');
  localStorage.setItem('putrid-swarm.lang', 'fr');
});
await page.reload();
// The lab reopens the open panel once every asset is in: start after that, so a reopen cannot race a measurement.
await page.waitForLoadState('networkidle');
await page.locator('#lab section').first().waitFor();

const langButton = (lang) => page.locator('#lab button', { hasText: new RegExp(`^${lang.toUpperCase()}$`) });
const sections = page.locator('#lab section');
const spotButton = (location, index) => sections.nth(location).locator('button').nth(index);

// The spots, read once in French: their names give stable screenshot file names.
await langButton('fr').click();
const spots = [];
for (let location = 0; location < (await sections.count()); location++) {
  const place = (await sections.nth(location).locator('h3').textContent()).trim();
  const count = await sections.nth(location).locator('button').count();
  for (let index = 0; index < count; index++) {
    const button = spotButton(location, index);
    spots.push({
      location, index, place,
      name: (await button.locator('span').textContent()).trim(),
      kind: (await button.locator('small').textContent()).trim(),
    });
  }
}
if (!spots.length) fail('the lab lists no spots');

let checks = 0;
let tightest = null; // the opening with the least vertical room left between the case and the stage edge

/** Opens one spot in one language, checks it and saves its screenshot. */
async function check(spot, lang, file) {
  await langButton(lang).click();
  await page.waitForFunction((l) => document.documentElement.lang === l, lang);
  // Tag the panel already open so the wait below only accepts the one this click deals.
  await page.evaluate(() => document.querySelectorAll('.modal.scavenge').forEach((m) => m.setAttribute('data-tour-old', '')));
  await spotButton(spot.location, spot.index).click();
  const title = page.locator('.modal.scavenge:not([data-tour-old]) h2');
  try {
    await title.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    fail('the panel did not open (.modal.scavenge h2)');
    return;
  }
  if (!(await title.textContent())?.trim()) fail('the panel opened with an empty title');
  await settle();
  const { problems, spare } = await page.evaluate(measure);
  for (const problem of problems) fail(problem);
  if (spare !== null && (!tightest || spare < tightest.spare)) tightest = { spare, where: context };
  await page.locator('#stage').screenshot({ path: join(OUT, file) });
}

for (const [n, spot] of spots.entries()) {
  for (const lang of LANGS) {
    context = `${spot.place} / ${spot.name} (${spot.kind}, ${lang})`;
    checks++;
    // One broken spot must not hide the others: record it and carry on.
    await check(spot, lang, `${String(n + 1).padStart(2, '0')}-${slug(spot.place)}-${slug(spot.name)}-${lang}.png`)
      .catch((error) => fail(`the tour broke: ${error.message.split('\n')[0]}`));
  }
}
context = 'teardown';
await browser.close();

console.log(`screenshots in ${OUT}`);
for (const line of failures) console.log(`FAIL ${line}`);
if (tightest) console.log(`tightest fit: ${tightest.spare}px to spare above and below the case, ${tightest.where}`);
console.log(`${spots.length} spots × ${LANGS.length} languages = ${checks} checks, ${failures.length} failure${failures.length === 1 ? '' : 's'}`);
process.exit(failures.length ? 1 : 0);
