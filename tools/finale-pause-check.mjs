// node tools/finale-pause-check.mjs <preview URL> [capture directory]
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { launch } from './browser.mjs';

const [url, out] = process.argv.slice(2);
if (!url) throw new Error('Pass the URL of the game preview.');
if (out) await mkdir(out, { recursive: true });
const { newGame } = await tsImport('../src/core/game.ts', import.meta.url);
const { FINALE } = await tsImport('../src/core/finale.ts', import.meta.url);
const viewport = { width: 1280, height: 720 };
const browser = await launch();

async function leaveWindow(page) {
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    frame.contentWindow.focus();
    frame.remove();
  });
}

async function run(sound, touch = false) {
  const page = await browser.newPage({ viewport: touch ? { width: 390, height: 844 } : viewport,
    hasTouch: touch, isMobile: touch, locale: sound ? 'fr-FR' : 'en-GB' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = { ...newGame(17), day: 7, phase: 'held', hoursLeft: 0 };
  await page.addInitScript(({ state, sound, w, h, duration }) => {
    localStorage.setItem('putrid-swarm.save.v1', JSON.stringify(state));
    localStorage.setItem('putrid-swarm.warned', '1');
    localStorage.setItem('putrid-swarm.sound', sound ? 'on' : 'off');
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function() {
      if (this.src.endsWith('/mus_finale.mp3')) window.song = this;
      return play.call(this);
    };
    // Read the same playhead the player sees at the bottom of the stage.
    const paint = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function(x, y, width, height) {
      if (this.canvas.id === 'game' && x === 0 && y === h - 5 && height === 5 && this.fillStyle === '#f2a531') {
        window.beatTime = duration * width / w;
      }
      return paint.call(this, x, y, width, height);
    };
  }, { state, sound, w: viewport.width, h: viewport.height, duration: FINALE.seconds });

  try {
    await page.goto(url);
    if (touch) await page.locator('.gate button').tap();
    await page.locator('[data-menu-item="continue"]').click();
    const encore = page.getByRole('button', { name: sound ? 'Rejouer le morceau' : 'Play the song again' });
    const dialog = page.getByRole('dialog');
    await encore.click();
    await page.locator('.jam-modes').waitFor();
    await page.locator('#subtitle.on').waitFor();
    const cue = await page.locator('#subtitle').textContent();
    await leaveWindow(page);
    await dialog.waitFor();
    assert.ok(await page.locator('.finale').evaluate(node => node.inert));
    await dialog.getByRole('button').first().click();
    assert.equal(await page.locator('#subtitle.on').textContent(), cue);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.beatTime > 0.8);
    if (sound) await page.waitForFunction(() => window.song?.currentTime > 0.3);

    await page.keyboard.down('KeyQ');
    await page.locator('.jam-keys .held').waitFor();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => Number(document.querySelector('.jam-count b')?.textContent) > 0);
    if (touch) {
      const pause = page.locator('.jam-pause');
      const box = await pause.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      await pause.tap();
    } else await leaveWindow(page);
    await page.keyboard.up('KeyQ');
    await dialog.waitFor();
    assert.equal(await page.locator('.pause-reason').count(), sound ? 1 : 0);
    assert.equal(await page.locator('.jam-keys .held').count(), 0);
    await page.keyboard.press('KeyW');
    await page.keyboard.press('Tab');
    const leave = dialog.getByRole('button').last();
    assert.ok(await leave.evaluate(node => document.activeElement === node));
    const read = () => page.evaluate(() => ({
      beat: window.beatTime,
      song: window.song?.currentTime ?? null,
      halted: window.song?.paused ?? true,
      tally: document.querySelector('.jam-count b')?.textContent,
    }));
    const frozen = await read();
    assert.ok(frozen.halted);
    await page.waitForTimeout(1500);
    assert.deepEqual(await read(), frozen);
    if (out) await page.screenshot({ path: join(out, touch ? 'pause-touch.png' : 'pause.png') });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await page.waitForFunction(t => window.beatTime > t + 0.45, frozen.beat);
    const resumed = await read();
    assert.ok(resumed.beat < frozen.beat + 1, 'The first beats after resume must not include the pause');
    if (sound) {
      assert.ok(resumed.song > frozen.song && !resumed.halted);
      assert.ok(Math.abs(resumed.beat - resumed.song) < 0.2, 'Song and notes should still agree');
    }

    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.jam-keys > :not(.space)').count(), 6);
    await page.keyboard.press('Escape');
    if (touch) {
      const box = await leave.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44);
      await leave.tap();
    } else await leave.click();
    await encore.waitFor();
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('jam.record')).length), 0);
    assert.deepEqual(errors, []);
    console.log((sound ? 'FR with music' : 'EN muted') + ': shed cue, held chord, pause, resume, mode switch and exit verified');
  } finally { await page.close(); }
}

try { await run(true); await run(false, true); } finally { await browser.close(); }
