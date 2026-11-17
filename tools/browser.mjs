// Which browser a tour drives. PS_BROWSER=chrome (default, the Chrome installed on this machine),
// firefox or webkit (Playwright's own builds: `npx playwright-core install firefox webkit`).
// WebKit is the closest thing to Safari that can be scripted.
import { chromium, firefox, webkit } from 'playwright-core';

const ENGINES = {
  chrome: () => chromium.launch({ channel: 'chrome', headless: true }),
  firefox: () => firefox.launch({ headless: true }),
  webkit: () => webkit.launch({ headless: true }),
};

export const BROWSER = process.env.PS_BROWSER ?? 'chrome';

export async function launch() {
  const start = ENGINES[BROWSER];
  if (!start) throw new Error(`PS_BROWSER must be one of ${Object.keys(ENGINES).join(', ')}; got "${BROWSER}"`);
  return start();
}
