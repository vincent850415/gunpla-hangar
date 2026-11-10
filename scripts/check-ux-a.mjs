import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

// Isolated dev server allows controlled OCR failures without production hooks.
// Real sample OCR remains covered separately by check-ui.mjs against dist.
const server = await createServer({ server: { host: '127.0.0.1', port: 4174, strictPort: true, preTransformRequests: false }, optimizeDeps: { entries: [], noDiscovery: true, holdUntilCrawlEnd: false, include: ['react', 'react-dom/client', 'lucide-react', 'idb-keyval', 'tesseract.js'] } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
await fs.mkdir('test-results', { recursive: true });
const origin = 'http://127.0.0.1:4174';
const image = `data:image/jpeg;base64,${(await fs.readFile('public/sample.jpg')).toString('base64')}`;
const fixture = ['A', 'B', 'C', 'D'].map((id, index) => ({ id, name: `模型 ${id}`, grade: 'HG', series: 'UC 宇宙世紀', productLine: 'HGUC', scale: '1/144', price: '', location: '原位置', confirmed: index === 3, image, warnings: ['原提醒'], evidence: '原辨識', ocrEngine: '原引擎', status: 'ready', createdAt: '2026-11-10T00:00:00.000Z' }));
const errors = [];
async function setup(viewport = { width: 1440, height: 1080 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/src/recognition.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    export { imageData } from '/src/tesseract-recognition.js';
    export async function recognize(image, progress) {
      const mode = window.ocrMode;
      progress?.({ status: 'recognizing text', progress: .5 });
      await new Promise(resolve => setTimeout(resolve, mode === 'delayed' ? 1000 : 80));
      if (mode === 'fail') throw new Error('controlled failure');
      return { name: '新辨識名稱', series: '鋼彈創鬥者', productLine: 'HGBF', grade: 'HG', scale: '1/100', warnings: ['新提醒'], evidence: '新辨識證據', ocrEngine: '測試引擎', price: 999, location: '不可覆寫' };
    }` }));
  await context.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { if (window.failWrites) throw new DOMException('Test quota', 'QuotaExceededError'); return original.apply(this, args); };
    const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window), listeners = new Set();
    window.addEventListener = (type, listener, options) => { if (type === 'beforeunload') listeners.add(listener); window.unloadListeners = listeners.size; return add(type, listener, options); };
    window.removeEventListener = (type, listener, options) => { if (type === 'beforeunload') listeners.delete(listener); window.unloadListeners = listeners.size; return remove(type, listener, options); };
    window.clearUnloadListeners = () => { for (const listener of listeners) remove('beforeunload', listener); listeners.clear(); };
  });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.getByText('已儲存至這台裝置', { exact: true }).waitFor({ state: 'attached' });
  await page.evaluate(async rows => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('keyval-store', 1); request.onupgradeneeded = () => request.result.createObjectStore('keyval'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction('keyval', 'readwrite'); tx.objectStore('keyval').put(rows, 'hangar-records-v1'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
  }, fixture);
  await page.reload(); await expect(page.locator('.record')).toHaveCount(4);
  return { page, context };
}
async function stored(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('keyval-store', 1);
    request.onsuccess = () => { const db = request.result; const get = db.transaction('keyval').objectStore('keyval').get('hangar-records-v1'); get.onsuccess = () => { resolve(get.result); db.close(); }; get.onerror = () => reject(get.error); };
    request.onerror = () => reject(request.error);
  }));
}
const button = (page, name) => page.getByRole('button', { name, exact: true });
try {
  const { page, context } = await setup();
  const unloadBaseline = await page.evaluate(() => window.unloadListeners || 0); // Vite also owns a listener.
  await page.screenshot({ path: 'test-results/ux-a-desktop-list.png', fullPage: true });
  await page.locator('.sidebar nav button').filter({ hasText: '待確認' }).click(); await button(page, '開始確認').click();
  await expect(page.locator('.queue-progress')).toHaveText('第 1／共 3 筆');
  await page.getByLabel('購入價格').fill('-1'); await button(page, '確認並開啟下一筆').click();
  await expect(page.getByLabel('購入價格')).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('零或正數');
  await page.getByLabel('購入價格').fill('0');
  assert.ok(await page.evaluate(baseline => window.unloadListeners > baseline, unloadBaseline));
  await page.keyboard.press('Escape'); await expect(page.locator('.leave-modal')).toBeVisible();
  await button(page, '繼續編輯').click(); await expect(page.getByLabel('購入價格')).toHaveValue('0');
  await button(page, '下一筆').click(); await button(page, '捨棄修改').click();
  await expect(page.locator('.queue-progress')).toHaveText('第 2／共 3 筆');
  await button(page, '上一筆').click(); await expect(page.getByLabel('購入價格')).toHaveValue('');
  await page.getByLabel('購入價格').fill('0'); await button(page, '確認並開啟下一筆').click();
  await expect(page.locator('.queue-progress')).toHaveText('第 2／共 3 筆');
  assert.equal((await stored(page)).find(r => r.id === 'A').price, '0');
  await page.getByLabel('商品名稱', { exact: false }).fill('修改 B');
  await button(page, '下一筆').click(); await button(page, '儲存為待確認後離開').click();
  await expect(page.locator('.queue-progress')).toHaveText('第 3／共 3 筆');
  await button(page, '上一筆').click(); await expect(page.getByLabel('商品名稱', { exact: false })).toHaveValue('修改 B');
  await button(page, '下一筆').click();
  await page.evaluate(() => { window.failWrites = true; });
  await button(page, '確認並開啟下一筆').click();
  await expect(page.locator('.editor .form-error')).toContainText('草稿仍保留');
  await expect(page.locator('.queue-progress')).toHaveText('第 3／共 3 筆');
  assert.equal((await stored(page)).find(r => r.id === 'C').confirmed, false);
  const backupEvent = page.waitForEvent('download'); await button(page, '下載含草稿的備份').click();
  await (await backupEvent).saveAs('test-results/ux-a-draft-backup.json');
  await page.evaluate(() => { window.failWrites = false; });
  await button(page, '確認並開啟下一筆').click();
  await expect(page.locator('.editor')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('本輪已確認 2 筆，仍待確認 1 筆');
  await page.reload(); await expect(page.locator('.record .confirmed')).toHaveCount(3);
  console.log('PASS: queue navigation and durable save failure/retry.');
  // Save-and-leave failure cannot dismiss the guard or the draft.
  await page.locator('.record').filter({ hasText: '修改 B' }).click();
  await page.getByLabel('存放位置', { exact: true }).fill('草稿位置');
  await button(page, '關閉編輯').click(); await page.evaluate(() => { window.failWrites = true; });
  await button(page, '儲存為待確認後離開').click();
  await expect(page.locator('.leave-modal')).toBeVisible();
  await button(page, '繼續編輯').click(); await expect(page.getByLabel('存放位置', { exact: true })).toHaveValue('草稿位置');
  await page.evaluate(() => { window.failWrites = false; });
  await page.keyboard.press('Escape'); await button(page, '儲存為待確認後離開').click();
  await expect(page.locator('.editor')).toHaveCount(0);
  // Confirmed records stay untouched on OCR failure, cancellation and comparison dismissal.
  console.log('PASS: save-and-leave failure retains the draft.');
  await page.locator('.record').filter({ hasText: '模型 D' }).click();
  const original = (await stored(page)).find(r => r.id === 'D');
  await page.getByLabel('購入價格').fill('123');
  await page.evaluate(() => { window.ocrMode = 'fail'; }); await button(page, '重新辨識').click();
  await expect(page.getByRole('alert')).toContainText('重新辨識失敗');
  assert.deepEqual((await stored(page)).find(r => r.id === 'D'), original);
  await page.evaluate(() => { window.ocrMode = 'delayed'; }); await button(page, '重新辨識').click(); await button(page, '取消本次辨識').click();
  await page.waitForTimeout(1100); await expect(page.locator('.comparison-modal')).toHaveCount(0);
  assert.deepEqual((await stored(page)).find(r => r.id === 'D'), original);
  await page.evaluate(() => { window.ocrMode = 'success'; }); await button(page, '重新辨識').click();
  await expect(page.locator('.comparison-modal')).toBeVisible();
  await expect(page.locator('.comparison-modal input:checked')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/ux-a-recognition-comparison.png', fullPage: true });
  await page.keyboard.press('Escape'); await expect(page.locator('.editor')).toBeVisible();
  await expect(page.locator('.leave-modal')).toHaveCount(0);
  await expect(page.getByLabel('購入價格')).toHaveValue('123');
  await button(page, '重新辨識').click(); await page.getByLabel('採用新系列／商品線', { exact: true }).check();
  await button(page, '採用勾選欄位').click();
  await expect(page.getByLabel('作品系列', { exact: false })).toHaveValue('HGBF 鋼彈創鬥者');
  await expect(page.getByLabel('商品名稱', { exact: false })).toHaveValue('模型 D');
  await expect(page.getByLabel('購入價格')).toHaveValue('123'); await expect(page.getByLabel('存放位置', { exact: true })).toHaveValue('原位置');
  assert.deepEqual((await stored(page)).find(r => r.id === 'D'), original);
  await page.screenshot({ path: 'test-results/ux-a-desktop-editor.png', fullPage: true });
  // Native top-layer focus / Escape behavior and mouse panning.
  await button(page, '放大商品盒照').click(); await button(page, '放大').click(); await button(page, '放大').click();
  await button(page, '關閉大圖').focus(); await page.keyboard.press('Shift+Tab'); await expect(button(page, '適合畫面')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(button(page, '關閉大圖')).toBeFocused();
  const viewport = page.locator('.photo-viewport'), bounds = await viewport.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 80, bounds.y + bounds.height / 2 + 40); await page.mouse.up();
  assert.match(await viewport.locator('img').getAttribute('style'), /translate\(80px, 40px\)/);
  await page.screenshot({ path: 'test-results/ux-a-desktop-photo.png', fullPage: true });
  await button(page, '適合畫面').click(); await expect(page.locator('.photo-controls output')).toHaveText('100%');
  await page.keyboard.press('Escape'); await expect(page.locator('.photo-viewer')).toHaveCount(0); await expect(page.locator('.leave-modal')).toHaveCount(0);
  await expect(button(page, '放大商品盒照')).toBeFocused();
  await page.keyboard.press('Escape'); await button(page, '繼續編輯').click();
  await button(page, '儲存為待確認').click();
  const adopted = (await stored(page)).find(r => r.id === 'D');
  assert.equal(adopted.confirmed, false); assert.equal(adopted.productLine, 'HGBF'); assert.equal(adopted.evidence, '新辨識證據'); assert.equal(adopted.price, '123');
  await expect.poll(() => page.evaluate(() => window.unloadListeners)).toBe(unloadBaseline);
  await page.locator('.record').filter({ hasText: '模型 D' }).click();
  await button(page, '重新辨識').click(); await button(page, '全部採用').click();
  await expect(page.getByLabel('商品名稱', { exact: false })).toHaveValue('新辨識名稱');
  await expect(page.getByLabel('比例', { exact: true })).toHaveValue('1/100');
  await expect(page.getByLabel('購入價格')).toHaveValue('123');
  await page.keyboard.press('Escape'); await button(page, '捨棄修改').click();
  assert.deepEqual((await stored(page)).find(r => r.id === 'D'), adopted);
  await page.locator('.record').filter({ hasText: '修改 B' }).click();
  await page.evaluate(() => { window.failWrites = true; }); page.once('dialog', dialog => dialog.accept());
  await button(page, '刪除收藏').click(); await expect(page.locator('.editor .form-error')).toContainText('刪除儲存失敗');
  assert.equal((await stored(page)).length, 4);
  await page.evaluate(() => { window.failWrites = false; }); await button(page, '關閉編輯').click();
  await context.close();
  console.log('PASS: OCR candidate safety, desktop viewer, focus and Escape.');
  for (const [width, height] of [[390, 844], [360, 800]]) {
    const { page: mobile, context: mobileContext } = await setup({ width, height });
    const noOverflow = () => mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.ok(await noOverflow()); await mobile.screenshot({ path: `test-results/ux-a-mobile-${width}-list.png`, fullPage: true });
    await mobile.locator('.record').first().click();
    await mobile.getByLabel('存放位置', { exact: true }).fill('手機草稿');
    await mobile.getByLabel('存放位置', { exact: true }).scrollIntoViewIfNeeded();
    const locationBox = await mobile.getByLabel('存放位置', { exact: true }).boundingBox(), footerBox = await mobile.locator('.editor-footer').boundingBox();
    assert.ok(locationBox.y + locationBox.height <= footerBox.y, 'Editor footer must not cover the location input');
    await mobile.screenshot({ path: `test-results/ux-a-mobile-${width}-editor.png`, fullPage: true });
    await button(mobile, '放大商品盒照').click(); await button(mobile, '放大').click();
    const session = await mobileContext.newCDPSession(mobile), box = await mobile.locator('.photo-viewport').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 25, y: y + 30 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.match(await mobile.locator('.photo-viewport img').getAttribute('style'), /translate\(25px, 30px\)/);
    assert.ok(await noOverflow()); await mobile.screenshot({ path: `test-results/ux-a-mobile-${width}-photo.png`, fullPage: true });
    await mobile.keyboard.press('Escape'); await expect(button(mobile, '放大商品盒照')).toBeFocused();
    await expect(mobile.getByLabel('存放位置', { exact: true })).toHaveValue('手機草稿');
    await button(mobile, '重新辨識').click(); await expect(mobile.locator('.comparison-modal')).toBeVisible();
    assert.ok(await noOverflow()); await mobile.screenshot({ path: `test-results/ux-a-mobile-${width}-comparison.png`, fullPage: true });
    await button(mobile, '保留目前值').click();
    await mobile.keyboard.press('Escape'); await mobile.screenshot({ path: `test-results/ux-a-mobile-${width}-guard.png`, fullPage: true });
    await button(mobile, '捨棄修改').click(); await expect(mobile.locator('.editor')).toHaveCount(0);
    await expect(mobile.locator('.record').first()).toBeFocused(); await mobileContext.close();
  }
  assert.deepEqual(errors, []);
  console.log('PASS: UX-01 queue snapshot, navigation, validation, durable save failure/retry; UX-02 guard, save-and-leave failure, OCR failure/cancel/comparison/adoption and evidence; UX-03 focus, Escape, mouse and touch pan; desktop and 390/360px screenshots.');
} catch (error) {
  console.error(error);
  for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) {
    await page.screenshot({ path: `test-results/ux-a-failure-${index}.png`, fullPage: true }).catch(() => {});
    console.error('Failure UI:', (await page.locator('dialog[open]').allTextContents()).map(text => text.slice(-1400)));
  }
  throw error;
} finally {
  for (const context of browser.contexts()) for (const page of context.pages()) await page.evaluate(() => window.clearUnloadListeners?.()).catch(() => {});
  await browser.close(); await server.close();
}
