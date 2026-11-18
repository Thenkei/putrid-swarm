// Dev aid: which voice files the game fetches in each language, and which recording a line plays.
//   node tools/dub-probe.mjs [baseUrl]
import { launch } from './browser.mjs';

const URL = process.argv[2] ?? process.env.PS_URL ?? 'http://localhost:5173/';
const browser = await launch();
for (const lang of ['fr', 'en']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((l) => {
    localStorage.setItem('putrid-swarm.warned', '1');
    localStorage.setItem('putrid-swarm.lang', l);
  }, lang);
  const fetched = { fr: 0, en: 0, other: 0, failed: 0 };
  page.on('response', (r) => {
    const m = /assets\/audio\/(en\/)?([^/]+)\.mp3/.exec(r.url());
    if (!m) return;
    if (r.status() >= 400) fetched.failed++;
    else if (m[1]) fetched.en++;
    else if (/^(vo_|bark_)/.test(m[2])) fetched.fr++;
    else fetched.other++;
  });
  await page.goto(URL);
  await page.waitForFunction(() => window.__app, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.mouse.click(40, 700);
  await page.waitForTimeout(800);
  const said = await page.evaluate(async () => {
    const { audio } = await import('/src/engine/audio.ts');
    const sample = audio.voiceSample('vo_car');
    return { file: sample?.entry.file, decoded: Boolean(sample?.buffer), seconds: audio.say('vo_car', true) };
  });
  console.log(lang, JSON.stringify(fetched), JSON.stringify(said));
  if (lang === 'fr') {
    // Switching language in the options fetches the other voices.
    await page.evaluate(async () => {
      const i18n = await import('/src/engine/i18n.ts');
      const { audio } = await import('/src/engine/audio.ts');
      i18n.setLang('en');
      audio.syncVoices();
    });
    await page.waitForTimeout(3000);
    const after = await page.evaluate(async () => {
      const { audio } = await import('/src/engine/audio.ts');
      const sample = audio.voiceSample('vo_car');
      return { file: sample?.entry.file, decoded: Boolean(sample?.buffer) };
    });
    console.log('fr → en', JSON.stringify(fetched), JSON.stringify(after));
  }
  await page.close();
}
await browser.close();
