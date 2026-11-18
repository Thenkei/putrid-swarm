// The hardware-shop tours take the timber order through the same tags a player sees.
export async function fillTimberOrder(page) {
  const target = parseInt(await page.locator('.scale-target').innerText(), 10);
  const tags = page.locator('.salvage-weights button');
  const values = (await tags.allTextContents()).map(tag => parseInt(tag, 10));
  for (const [i, value] of values.entries()) {
    const j = values.findIndex((other, index) => index > i && other + value === target);
    if (j >= 0) {
      await tags.nth(i).click();
      await tags.nth(j).click();
      return;
    }
  }
  throw new Error(`No pair of timber tags adds up to ${target}`);
}
