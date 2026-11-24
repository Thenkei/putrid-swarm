// node --import tsx tools/camper-door-smoke.mjs
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { newGame } from '../src/core/game.ts';
import { BARRICADE } from '../src/core/data/devices.ts';
import { launch } from './browser.mjs';

const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const browser = await launch();
try {
  for (const branch of ['bitten', 'healthy', 'absent', 'broken-bitten', 'broken-healthy', 'last-plank', 'broken-absent']) {
    const state = { ...newGame(11), day: 7, hoursLeft: 0, orchard: 'spared' };
    const bitten = branch.endsWith('bitten') || branch === 'last-plank';
    const absent = branch.endsWith('absent'), broken = branch.startsWith('broken');
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'en-GB', reducedMotion: branch.endsWith('healthy') ? 'reduce' : 'no-preference' });
    const errors = [];
    p.on('pageerror', err => errors.push(err.message));
    if (!absent) {
      state.radio = { ...state.radio, stage: 'done', ending: 'trusted', answer: 'shelter',
        call: { caller: 'camper_owes', secret: bitten, at: .66, phase: .8, news: .27, baker: null } };
    }
    for (const door of Object.keys(state.yard.barricades)) state.yard.barricades[door] = { level: 1, hp: BARRICADE.maxHp[1] };
    if (broken || branch === 'last-plank') state.yard.barricades.arriere.hp = broken ? 0 : 73;
    await p.addInitScript(save => {
      for (const [key, val] of Object.entries({ warned: '1', coach: '1', lang: 'en', sound: 'off', 'save.v1': JSON.stringify(save) })) {
        localStorage.setItem('putrid-swarm.' + key, val);
      }
    }, state);
    await p.goto(server.resolvedUrls.local[0]);
    const button = name => p.getByRole('button', { name, exact: true });
    await button('Continue').click();
    await button('Wait for night').click();
    await button('Take the desk').click();
    await p.locator('.night-alert').waitFor({ state: 'attached' });
    await p.evaluate(async () => {
      const { audio } = await import('/src/engine/audio.ts');
      const original = audio.play.bind(audio);
      window.knocks = 0;
      window.doorFrames = {};
      const remember = () => {
        const feed = document.querySelector('.camper-door');
        if (feed) window.doorFrames[feed.dataset.door + '/' + feed.dataset.pose] = feed.getAttribute('aria-label');
      };
      new MutationObserver(remember).observe(document.querySelector('.night-top').parentElement, {
        attributes: true, subtree: true, attributeFilter: ['data-pose', 'data-door'],
      });
      remember();
      audio.play = (id, ...args) => {
        if (id === 'camper_inside_knock') window.knocks++;
        return original(id, ...args);
      };
    });
    const feed = p.locator('.camper-door');
    const first = broken ? 'watching' : 'holding';
    if (!absent) await p.locator('.mini .camper-door[data-pose=' + first + ']').waitFor();
    await p.keyboard.press('Digit3');
    if (!absent) {
      await p.locator('.cam-frame .camper-door[data-pose=' + first + ']').waitFor();
      assert.equal(await feed.count(), 1);
      await p.keyboard.press('Escape');
      const still = () => feed.locator('canvas').evaluate(c => c.toDataURL());
      const before = await still();
      await p.waitForTimeout(650);
      assert.equal(await still(), before);
      await button('Resume').click();
    } else assert.equal(await feed.count(), 0);
    await p.keyboard.press('F4');
    if (!absent) await p.waitForFunction(key => key in window.doorFrames, broken ? 'broken/stepping' : 'boarded/bracing', { timeout: 60000 });
    await p.locator('.night-top').filter({ hasText: /Wave 2/i }).waitFor({ timeout: 90000 });
    if (bitten) {
      await p.getByText(/strikes from inside/i).waitFor();
      if (broken || branch === 'last-plank') {
        await p.waitForFunction(() => 'broken/inside' in window.doorFrames);
        assert.match(await p.evaluate(() => window.doorFrames['broken/inside']), /splintered jamb/);
      }
      await feed.waitFor({ state: 'detached' });
    } else if (!absent) {
      assert.equal(await feed.count(), 1);
      assert.ok((broken ? ['watching', 'stepping'] : ['holding', 'bracing']).includes(await feed.getAttribute('data-pose')));
    } else assert.equal(await feed.count(), 0);
    await p.keyboard.press('Digit1');
    await p.keyboard.press('Digit3');
    assert.equal(await p.evaluate(() => window.knocks), bitten ? 1 : 0);
    assert.deepEqual(errors, []);
    console.log(branch + ': correct rear door feed, camera switching and inside knock count');
    await p.close();
  }
} finally {
  await browser.close();
  await server.close();
}
