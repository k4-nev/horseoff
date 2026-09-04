import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:8899/_concept.html');
await page.waitForLoadState('networkidle');
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

for (const id of ['s1', 's2', 's3', 's4', 's5']) {
  await page.locator('#' + id).screenshot({ path: `concept-${id}.png` });
  console.log('shot', id);
}
await browser.close();
