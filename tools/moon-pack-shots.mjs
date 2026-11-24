// node tools/moon-pack-shots.mjs <preview URL> <output directory>
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { launch } from './browser.mjs';

const [url, out] = process.argv.slice(2);
if (!url || !out) throw new Error('Pass the preview URL and an output directory.');
const { newGame } = await tsImport('../src/core/game.ts', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await launch();
const errors = [];
try {
  for (const outcome of ['reunion', 'impact', 'closed']) {
    const phone = outcome !== 'reunion';
    const page = await browser.newPage({
      locale: 'en-GB', viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 720 },
      hasTouch: phone, isMobile: phone, reducedMotion: phone ? 'reduce' : 'no-preference',
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(response.url()); });
    await page.addInitScript(save => {
      localStorage.setItem('putrid-swarm.save.v1', JSON.stringify(save));
      localStorage.setItem('putrid-swarm.warned', '1');
    }, { ...newGame(54), day: 5, hoursLeft: 0 });
    await page.goto(url);
    const button = name => page.getByRole('button', { name, exact: true });
    const click = target => phone ? target.tap() : target.click();
    const shot = name => page.screenshot({ path: join(out, 'moon-' + name + '.png') });
    if (phone) await click(page.locator('.gate button'));
    for (const label of ['Continue', 'Wait for night', 'Take the desk']) await click(button(label));
    const screen = page.locator('.moon-screen');
    await screen.waitFor();
    if (outcome === 'closed') {
      await click(button('Keep it closed'));
      await page.getByText(/leave the bolt in place/).waitFor();
    } else {
      const photograph = button('Photograph the trail');
      await click(photograph);
      await page.getByText(/Frame discarded/).waitFor();
      for (let stage = 0; stage < 3; stage++) {
        let found = false;
        for (const name of ['01 · Orchard', '02 · Barn', '03 · Gate']) {
          await click(button(name));
          if (!(await page.locator('.moon-caption').innerText()).includes('Four small prints')) continue;
          if (stage === 1) await shot(outcome + '-trail');
          await click(photograph);
          found = true;
          break;
        }
        assert.ok(found);
      }
      if (outcome === 'impact') {
        const warning = page.locator('#subtitle.on').filter({ hasText: 'cub under the gate' });
        assert.equal(await warning.count(), 1);
        assert.ok(await button('Lift the gate').evaluate(button => button === document.activeElement));
        await page.keyboard.press('Enter');
        await page.getByText(/slams the gate/).waitFor();
        assert.equal(await warning.count(), 0);
      } else {
        await click(button('Slow motion'));
        await page.locator('.moon-screen[data-passage="clear"]').waitFor();
        await click(button('Lift the gate'));
        assert.ok(await button('Keep it closed').isDisabled());
        await page.keyboard.press('Space');
        await page.getByText(/cub backs up/).waitFor();
        assert.ok(await button('Keep it closed').isEnabled());
        await click(button('Lift the gate'));
        await page.getByText(/Tail clear/).waitFor();
        await shot('winch');
        await click(button('Lower the gate'));
        await page.getByText(/just behind its tail/).waitFor();
      }
    }
    assert.equal(await screen.getAttribute('data-outcome'), outcome === 'reunion' ? 'reunion' : 'lost');
    await shot(outcome);
    await click(button('Back to the desk'));
    await screen.waitFor({ state: 'detached' });
    await page.close();
    console.log('Full moon passed: ' + outcome);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
