import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 800 } });

page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

await page.goto('http://localhost:8899/_test-harness.html');
await page.waitForFunction(() => window.__ready === true);
await page.waitForTimeout(800); // let the data-loading useEffect + renders settle

await page.screenshot({ path: 'shot-1-list.png' });
console.log('shot 1: initial list view');

// Switch to "Мои признания" tab
await page.click('text=Мои признания');
await page.waitForTimeout(400);
await page.screenshot({ path: 'shot-2-received.png' });
console.log('shot 2: received tab');

// Open the (only) confession card -> RevealViewer
await page.click('.vl-confession-head');
await page.waitForTimeout(600);
await page.screenshot({ path: 'shot-3-viewer.png' });
console.log('shot 3: reveal viewer open');

const viewerBoxCount = await page.locator('.vl-viewer-box').count();
const pageCardCount = await page.locator('.vl-page-card').count();
const viewerBoxBox = viewerBoxCount ? await page.locator('.vl-viewer-box').boundingBox() : null;
console.log('viewer box count:', viewerBoxCount, 'page-card count:', pageCardCount, 'viewer box rect:', JSON.stringify(viewerBoxBox));

// Close viewer, go back to Create tab, open ComposeDrawer
await page.click('.vl-viewer-close');
await page.waitForTimeout(300);
await page.click('text=Создать');
await page.waitForTimeout(300);
await page.click('.vl-contact-card');
await page.waitForTimeout(600);
await page.screenshot({ path: 'shot-4-compose.png' });
console.log('shot 4: compose drawer open');

const drawerCount = await page.locator('.vl-drawer-content').count();
const drawerBox = drawerCount ? await page.locator('.vl-drawer-content').boundingBox() : null;
console.log('drawer count:', drawerCount, 'drawer rect:', JSON.stringify(drawerBox));

// Hearts bg check
const heartsCount = await page.locator('.vl-heart-particle').count();
console.log('ambient heart particles found:', heartsCount);

await browser.close();
