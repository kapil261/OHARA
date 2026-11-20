import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5173/patient?dev=patient', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const text = await page.textContent('body');
const html = await page.content();

console.log('=== page text ===');
console.log(text?.slice(0, 800));
console.log('\n=== console errors ===');
console.log(errors.length ? errors.join('\n') : '(none)');

await browser.close();