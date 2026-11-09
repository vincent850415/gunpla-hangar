import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/check-low-resolution.mjs <HI-MOCK WebP fixture path>');
await fs.mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173');
  await page.getByText('已儲存至這台裝置', { exact: true }).waitFor();
  await page.locator('input[type=file][multiple]').setInputFiles(file);
  await page.getByRole('status').filter({ hasText: '新增 1 筆' }).waitFor({ timeout: 180000 });
  await page.locator('.record').click();
  const read = async () => ({
    name: await page.getByLabel('商品名稱', { exact: false }).inputValue(),
    series: await page.getByLabel('作品系列', { exact: false }).inputValue(),
    grade: await page.locator('.editor-fields select').inputValue(),
    scale: await page.getByLabel('比例', { exact: true }).inputValue(),
  });
  const result = await read();
  assert.deepEqual(result, { name: 'HI-MOCK', series: 'HGBF 鋼彈創鬥者', grade: 'HG', scale: '1/144' });
  assert.match(await page.locator('.editor pre').textContent(), /左上規格與系列標誌/);
  assert.match(await page.getByRole('note', { name: '辨識提醒' }).textContent(), /解析度較低/);
  await page.screenshot({ path: 'test-results/low-resolution-review.png', fullPage: true });
  await page.getByLabel('購入價格').fill('250');
  await page.getByLabel('存放位置', { exact: true }).fill('B 櫃');
  await page.getByRole('button', { name: '儲存為待確認' }).click();
  await page.locator('.record').click();
  await page.getByRole('button', { name: '重新辨識', exact: true }).click();
  await page.getByRole('dialog', { name: '確認收藏資料' }).waitFor({ timeout: 180000 });
  assert.deepEqual(await read(), result);
  assert.equal(await page.getByLabel('購入價格').inputValue(), '250');
  assert.equal(await page.getByLabel('存放位置', { exact: true }).inputValue(), 'B 櫃');
  await page.getByRole('button', { name: '確認並儲存' }).click();
  await page.getByText('已儲存至這台裝置', { exact: true }).waitFor();
  await page.reload(); await page.locator('.record .confirmed').waitFor();
  await page.locator('.record').click();
  assert.equal((await read()).grade, 'HG'); assert.equal((await read()).scale, '1/144');
  assert.deepEqual(errors, []);
  console.log('PASS: real low-resolution WebP, name/franchise/HG/scale recognition, regional reread, retry, retained price/location, confirmation persistence.');
} finally { await browser.close(); }
