import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/check-photo-regressions.mjs <directory containing 20261103_002 through _005> [RX-78-2 photo, defaults to public/sample.jpg]');
// Expected answers belong only to the regression test, never the application.
const fixtures = [
  ['20261103.jpg', 'RX-78-2 GUNDAM', 'HGUC 宇宙世紀'],
  ['20261103_002.webp', 'HI-MOCK', 'HGBF 鋼彈創鬥者'],
  ['20261103_003.jpg', 'GUNDAM EZ-SR', 'HGBF 鋼彈創鬥者'],
  ['20261103_004.jpg', 'RX-79[G]EZ-8 GUNDAM EZ8', 'HGUC 宇宙世紀'],
  ['20261103_005.jpeg', 'Hi-V GUNDAM VRABE AMAZING Ver.The Crimson Comet', 'HGBF 鋼彈創鬥者'],
];
const files = fixtures.map(([file], index) => index === 0 ? path.resolve(process.argv[3] || 'public/sample.jpg') : path.resolve(directory, file));
await Promise.all(files.map(file => fs.access(file)));
await fs.mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
  const errors = [], external = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4173' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    external.push(url.href); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173');
  await page.getByText('已儲存至這台裝置', { exact: true }).waitFor();
  await page.locator('input[type=file][multiple]').setInputFiles(files);
  await page.getByRole('status').filter({ hasText: '新增 5 筆' }).waitFor({ timeout: 300000 });
  assert.equal(await page.locator('.record').count(), 5);
  const results = [];
  for (const [index, [file, name, series]] of [...fixtures].reverse().entries()) {
    await page.locator('.record').nth(index).click();
    const result = {
      file,
      name: await page.getByLabel('商品名稱', { exact: false }).inputValue(),
      series: await page.getByLabel('作品系列', { exact: false }).inputValue(),
      grade: await page.locator('.editor-fields select').inputValue(),
      scale: await page.getByLabel('比例', { exact: true }).inputValue(),
    };
    assert.deepEqual(result, { file, name, series, grade: 'HG', scale: '1/144' });
    assert.match(await page.locator('.editor details').textContent(), /PaddleOCR PP-OCRv6/);
    assert.equal(await page.getByLabel('購入價格').inputValue(), '');
    assert.equal(await page.getByLabel('存放位置', { exact: true }).inputValue(), '');
    const warnings = await page.getByRole('note', { name: '辨識提醒' }).allTextContents();
    if (file.endsWith('005.jpeg')) {
      assert.match(warnings.join(' '), /希臘字母 ν/);
      assert.match(warnings.join(' '), /版本/);
      await page.screenshot({ path: 'test-results/limited-edition-review.png', fullPage: true });
    }
    results.push({ ...result, warnings, evidence: await page.locator('.editor pre').textContent() });
    console.log(`PASS ${file}: ${result.name} / ${result.series} / ${result.grade} / ${result.scale}`);
    await page.getByRole('button', { name: '關閉編輯' }).click();
  }
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  await fs.writeFile('test-results/photo-regressions.json', JSON.stringify(results, null, 2));
  console.log('PASS: five real photos, local engine, grade/scale/franchise/title, explicit Greek-letter uncertainty, no external requests.');
} finally { await browser.close(); }
