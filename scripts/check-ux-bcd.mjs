import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

const origin = 'http://127.0.0.1:4175';
const server = await createServer({ cacheDir: 'node_modules/.vite-ux-bcd', server: { host: '127.0.0.1', port: 4175, strictPort: true, preTransformRequests: false }, optimizeDeps: { entries: [], noDiscovery: true, holdUntilCrawlEnd: false, include: ['react', 'react-dom/client', 'lucide-react', 'idb-keyval', 'tesseract.js', 'exceljs'] } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
await fs.mkdir('test-results', { recursive: true });
const sample = await fs.readFile('public/sample.jpg'), image = `data:image/jpeg;base64,${sample.toString('base64')}`;
const date = '2026-11-10T00:00:00.000Z';
const row = (id, extra = {}) => ({ id, name: `模型 ${id}`, grade: 'HG', series: 'SEED', productLine: '', scale: '1/144', price: '', location: '', image, confirmed: true, status: 'ready', warnings: ['請核對'], evidence: 'saved evidence', ocrEngine: 'local', createdAt: date, updatedAt: date, deletedAt: null, ...extra });
const fixture = [row('A', { series: 'UC 宇宙世紀', productLine: 'HGUC', price: 0, hash: 'a'.repeat(64) }), row('B', { grade: 'MG', price: 50, hash: 'b'.repeat(64) }), row('C', { confirmed: false, price: 10 }), row('D', { series: 'UC 宇宙世紀', productLine: 'HGUC' }), row('E', { price: 99 }), row('F', { location: '只保留 F' }), row('trash', { name: '已刪模型', deletedAt: date, price: 123 })];
const errors = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
async function setup(rows = fixture, viewport = { width: 1440, height: 1080 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    window.failWrites = location.search.includes('failMigration');
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) { if (window.failWrites) throw new DOMException('Test quota', 'QuotaExceededError'); return put.apply(this, args); };
    const add = window.addEventListener.bind(window), remove = window.removeEventListener.bind(window), listeners = new Set();
    window.addEventListener = (name, fn, options) => { if (name === 'beforeunload') listeners.add(fn); return add(name, fn, options); };
    window.removeEventListener = (name, fn, options) => { listeners.delete(fn); return remove(name, fn, options); };
    window.clearUnloadListeners = () => { for (const fn of listeners) remove('beforeunload', fn); listeners.clear(); };
  });
  await context.route('**/src/recognition.js', route => route.fulfill({ contentType: 'application/javascript', body: `
    export { imageData } from '/src/tesseract-recognition.js';
    export async function recognize(image, progress) {
      window.ocrCalls = (window.ocrCalls || 0) + 1;
      const call = window.ocrCalls, delay = window.ocrDelay || 50;
      progress?.({ status: 'recognizing text', progress: .5 });
      await new Promise(resolve => setTimeout(resolve, delay));
      if (window.failOCRAt === call) throw new Error('controlled recognition failure');
      return { name: '辨識商品 ' + call, series: 'UC 宇宙世紀', productLine: 'HGUC', grade: 'HG', scale: '1/144', warnings: [], evidence: 'new evidence', ocrEngine: 'stub' };
    }` }));
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin); await page.getByText('已儲存至這台裝置', { exact: true }).waitFor({ state: 'attached' });
  await page.evaluate(async rows => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('keyval-store'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise((resolve, reject) => { const tx = db.transaction('keyval', 'readwrite'), store = tx.objectStore('keyval'); for (const key of ['hangar-workspace-v2', 'hangar-active-schema', 'hangar-records-v1-original']) store.delete(key); store.put(rows, 'hangar-records-v1'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
  }, rows);
  await page.reload(); await expect(page.locator('.record')).toHaveCount(rows.filter(row => !row.deletedAt).length);
  return { page, context };
}
async function disk(page, key = 'hangar-workspace-v2') {
  return page.evaluate(key => new Promise((resolve, reject) => { const request = indexedDB.open('keyval-store'); request.onsuccess = () => { const db = request.result, get = db.transaction('keyval').objectStore('keyval').get(key); get.onsuccess = () => { resolve(get.result); db.close(); }; get.onerror = () => reject(get.error); }; request.onerror = () => reject(request.error); }), key);
}
async function select(page, ids) { for (const id of ids) await page.getByLabel(`選取 模型 ${id}`, { exact: true }).check(); }
async function restoreFile(page, object) { await page.getByLabel('還原備份檔案', { exact: true }).setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(object)) }); await expect(page.locator('.restore-modal')).toBeVisible(); }
async function download(page, trigger, path) { const event = page.waitForEvent('download'); await trigger(); await (await event).saveAs(path); }
async function screenshot(page, name) { await page.screenshot({ path: `test-results/${name}.png`, fullPage: true }); }
try {
  const { page, context } = await setup();
  assert.equal((await disk(page, 'hangar-records-v1-original')).length, 7);
  assert.equal((await disk(page)).records.find(row => row.id === 'A').price, 0);
  await page.getByLabel('排序收藏').selectOption('price-asc');
  assert.deepEqual(await page.locator('.record strong').allTextContents(), ['模型 A', '模型 C', '模型 B', '模型 E', '模型 D', '模型 F']);
  await select(page, ['A']); await page.getByLabel('篩選規格').selectOption('HG');
  await expect(page.getByRole('status').filter({ hasText: '已清除選取' })).toBeVisible(); await expect(page.locator('.record-selection input:checked')).toHaveCount(0);
  await button(page, '清除全部').click(); await select(page, ['A', 'B', 'C', 'D', 'E']); await button(page, '批次設定').click();
  await page.getByLabel('系列操作', { exact: true }).selectOption('set'); await page.getByLabel('批次作品系列').fill('HGUC 宇宙世紀');
  await expect(page.locator('.action-modal [role=alert]')).toContainText('模型 B：MG'); await expect(button(page, '套用批次設定')).toBeDisabled();
  await screenshot(page, 'ux-b-batch-incompatible'); await button(page, '取消').click();
  await button(page, '批次設定').click(); await page.getByLabel('位置操作').selectOption('set'); await page.getByLabel('批次存放位置').fill('收藏 A 櫃'); await button(page, '套用批次設定').click();
  await expect(page.locator('.action-modal')).toHaveCount(0);
  let workspace = await disk(page); assert.equal(workspace.records.filter(row => row.location === '收藏 A 櫃').length, 5); assert.equal(workspace.records.find(row => row.id === 'F').location, '只保留 F'); assert.equal(workspace.records.filter(row => row.confirmed && !row.deletedAt).length, 5);
  await select(page, ['A', 'B', 'C', 'D', 'E']); await button(page, '批次設定').click(); await page.getByLabel('位置操作').selectOption('clear'); await button(page, '套用批次設定').click();
  await expect(page.locator('.action-modal')).toHaveCount(0); assert.ok((await disk(page)).records.filter(row => ['A', 'B', 'C', 'D', 'E'].includes(row.id)).every(row => row.location === ''));
  await select(page, ['E']); await button(page, '批次設定').click(); await page.getByLabel('系列操作', { exact: true }).selectOption('set'); await page.getByLabel('批次作品系列').fill('HGUC 宇宙世紀'); await button(page, '套用批次設定').click();
  await expect(page.locator('.action-modal')).toHaveCount(0); assert.equal((await disk(page)).records.find(row => row.id === 'E').confirmed, false);
  await page.reload(); await expect(page.locator('.record')).toHaveCount(6);
  await page.getByLabel('篩選作品系列', { exact: true }).selectOption('HGUC 宇宙世紀'); await button(page, '匯出 Excel').click();
  await expect(page.getByRole('radio', { name: /目前篩選結果/ })).toBeChecked(); await expect(page.locator('.export-count')).toContainText('可匯出 2 筆；未確認排除 1 筆');
  await screenshot(page, 'ux-b-export-filtered'); await download(page, () => button(page, '下載 Excel').click(), 'test-results/ux-b-filtered.xlsx');
  let book = new ExcelJS.Workbook(); await book.xlsx.readFile('test-results/ux-b-filtered.xlsx'); assert.equal(book.worksheets.length, 1); assert.equal(book.worksheets[0].rowCount, 3); assert.equal(book.worksheets[0].columnCount, 4); assert.equal(book.worksheets[0].getCell('C2').value, 0); assert.equal(book.worksheets[0].getCell('C3').value, null);
  await button(page, '匯出 Excel').click(); await page.getByRole('radio', { name: /全部已確認/ }).check(); await download(page, () => button(page, '下載 Excel').click(), 'test-results/ux-b-all.xlsx');
  book = new ExcelJS.Workbook(); await book.xlsx.readFile('test-results/ux-b-all.xlsx'); assert.equal(book.worksheets.length, 2); assert.equal(book.worksheets.reduce((sum, sheet) => sum + sheet.rowCount - 1, 0), 4);
  await button(page, '清除全部').click(); await page.getByLabel('篩選確認狀態').selectOption('pending'); await button(page, '匯出 Excel').click(); await expect(button(page, '下載 Excel')).toBeDisabled(); await button(page, '取消').click(); await button(page, '清除全部').click();
  await screenshot(page, 'ux-b-desktop-list');
  console.log('PASS: B batch compatibility/position/clearing, filters/sorts, selected reset, two export scopes and XLSX readback.');
  // Soft delete persists, undo works, full backup contains trash, permanent delete stays deleted.
  await page.locator('.record').filter({ hasText: '模型 F' }).click(); await button(page, '刪除收藏').click(); await expect(page.locator('.record')).toHaveCount(5); await button(page, '復原').click(); await expect(page.locator('.record')).toHaveCount(6);
  await page.locator('.record').filter({ hasText: '模型 F' }).click(); await button(page, '刪除收藏').click(); await page.reload(); await expect(page.locator('.record')).toHaveCount(5);
  await download(page, () => button(page, '備份收藏').click(), 'test-results/ux-c-backup.json');
  const savedBackup = JSON.parse(await fs.readFile('test-results/ux-c-backup.json', 'utf8')); assert.equal(savedBackup.version, 2); assert.equal(savedBackup.records.length, 7); assert.equal(savedBackup.records.filter(row => row.deletedAt).length, 2);
  await expect(page.locator('.backup-status')).toContainText('0 筆變更尚未備份');
  await page.getByRole('button', { name: /回收桶（/ }).click(); await screenshot(page, 'ux-c-trash'); await button(page, '復原 模型 F').click(); await expect(page.locator('.action-modal h2')).toContainText('1 筆');
  page.once('dialog', dialog => dialog.accept()); await button(page, '永久刪除 已刪模型').click(); await expect(page.locator('.action-modal h2')).toContainText('0 筆'); await button(page, '關閉回收桶').click();
  await page.reload(); await expect(page.locator('.record')).toHaveCount(6); assert.equal((await disk(page)).records.length, 6); assert.equal((await disk(page)).records.find(row => row.id === 'F').confirmed, true);
  await context.close();
  const restored = await setup([]);
  await restoreFile(restored.page, savedBackup); await expect(restored.page.locator('.restore-counts')).toHaveText('新增 7／相同 0／衝突 0／無效 0'); await screenshot(restored.page, 'ux-c-restore-preview'); assert.equal((await disk(restored.page)).records.length, 0);
  await button(restored.page, '確認合併還原').click(); await expect(restored.page.locator('.restore-modal')).toHaveCount(0); assert.equal((await disk(restored.page)).records.length, 7); assert.equal((await disk(restored.page)).records.filter(row => row.confirmed).length, 5);
  await restoreFile(restored.page, savedBackup); await expect(restored.page.locator('.restore-counts')).toHaveText('新增 0／相同 7／衝突 0／無效 0'); await button(restored.page, '確認合併還原').click(); await expect(restored.page.locator('.restore-modal')).toHaveCount(0); assert.equal((await disk(restored.page)).records.length, 7);
  const conflict = { ...savedBackup, records: [row('A', { name: '備份 A', hash: 'a'.repeat(64) }), row('other-B', { hash: 'b'.repeat(64), deletedAt: date })] };
  await restoreFile(restored.page, conflict); await expect(restored.page.locator('.restore-counts')).toContainText('衝突 2'); await expect(restored.page.locator('.restore-modal input:checked[type=checkbox]')).toHaveCount(0); await screenshot(restored.page, 'ux-c-restore-conflict');
  await restored.page.getByLabel('採用備份 備份 A', { exact: true }).check(); await button(restored.page, '確認合併還原').click(); await expect(restored.page.locator('.restore-modal')).toHaveCount(0); workspace = await disk(restored.page); assert.equal(workspace.records.find(row => row.id === 'A').name, '備份 A'); assert.equal(workspace.records.some(row => row.id === 'other-B'), false);
  const invalid = { ...savedBackup, records: [row('bad', { price: -1 }), row('new-good')] };
  await restoreFile(restored.page, invalid); await expect(button(restored.page, '確認合併還原')).toBeDisabled(); await expect(restored.page.locator('.restore-modal [role=alert]')).toContainText('價格'); await button(restored.page, '取消').click(); assert.equal((await disk(restored.page)).records.length, 7);
  await restoreFile(restored.page, { ...savedBackup, records: [row('new-after-failure')] }); await restored.page.evaluate(() => { window.failWrites = true; }); await button(restored.page, '確認合併還原').click(); await expect(restored.page.locator('.restore-modal')).toBeVisible(); assert.equal((await disk(restored.page)).records.length, 7);
  await restored.page.evaluate(() => { window.failWrites = false; }); await button(restored.page, '確認合併還原').click(); await expect(restored.page.locator('.restore-modal')).toHaveCount(0); assert.equal((await disk(restored.page)).records.length, 8); await restored.context.close();
  const external = await setup([]); await restoreFile(external.page, savedBackup); await external.page.getByRole('radio', { name: /作為外部資料匯入/ }).check(); await button(external.page, '確認合併還原').click(); await expect(external.page.locator('.restore-modal')).toHaveCount(0); assert.ok((await disk(external.page)).records.every(row => !row.confirmed)); await external.context.close();
  const migration = await setup(fixture); await migration.page.goto(`${origin}/?failMigration=1`);
  // Reset the active schema to simulate an interrupted first upgrade, then reload with writes rejected.
  await migration.page.evaluate(async () => { window.failWrites = false; const request = indexedDB.open('keyval-store'); await new Promise(resolve => { request.onsuccess = () => { const tx = request.result.transaction('keyval', 'readwrite'); for (const key of ['hangar-active-schema', 'hangar-workspace-v2', 'hangar-records-v1-original']) tx.objectStore('keyval').delete(key); tx.oncomplete = () => { request.result.close(); resolve(); }; }; }); });
  await migration.page.reload(); await expect(migration.page.getByRole('alert')).toContainText('資料升級未完成'); await expect(migration.page.locator('.record')).toHaveCount(6); assert.deepEqual(await disk(migration.page, 'hangar-records-v1'), fixture); assert.notEqual(await disk(migration.page, 'hangar-active-schema'), 2);
  await migration.page.evaluate(() => { window.failWrites = false; }); await button(migration.page, '重試資料升級').click(); await migration.page.getByText('已儲存至這台裝置', { exact: true }).waitFor(); assert.equal(await disk(migration.page, 'hangar-active-schema'), 2); await migration.context.close();
  console.log('PASS: C migration failure/retry, trash/undo/permanent deletion, v2 full/external restore, repeat dedup, conflict/default keep, validation and quota failure.');
  // Mixed import and retry use the original record ID, including a trash duplicate.
  const trashBytes = Buffer.concat([sample, Buffer.from('trash-duplicate')]), failedBytes = Buffer.concat([sample, Buffer.from('recognition-failure')]);
  const imports = await setup([row('import-trash', { hash: crypto.createHash('sha256').update(trashBytes).digest('hex'), deletedAt: date })]);
  await imports.page.evaluate(() => { window.failOCRAt = 2; });
  await imports.page.getByLabel('匯入照片', { exact: true }).setInputFiles([
    { name: 'ok.jpg', mimeType: 'image/jpeg', buffer: sample }, { name: 'retry.jpg', mimeType: 'image/jpeg', buffer: failedBytes }, { name: 'duplicate.jpg', mimeType: 'image/jpeg', buffer: sample }, { name: 'trash.jpg', mimeType: 'image/jpeg', buffer: trashBytes }, { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) }, { name: 'unsupported.heic', mimeType: 'image/heic', buffer: Buffer.from('heic') }, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid png') },
  ]);
  await expect(imports.page.locator('.import-summary')).toContainText('已處理 7／7 張；已建立紀錄 2 筆，辨識成功 1 張'); await expect(imports.page.locator('.import-report')).toContainText('重複 2'); await expect(imports.page.locator('.import-report')).toContainText('檔案過大 1'); await screenshot(imports.page, 'ux-d-import-results');
  const before = (await disk(imports.page)).records.map(row => row.id).sort();
  await button(imports.page, '重試辨識 retry.jpg').click(); await expect(imports.page.locator('.import-summary')).toContainText('辨識成功 2 張'); assert.deepEqual((await disk(imports.page)).records.map(row => row.id).sort(), before);
  await button(imports.page, '復原既有收藏 trash.jpg').click(); await expect(imports.page.locator('.record')).toHaveCount(3);
  await imports.page.evaluate(() => { window.ocrDelay = 800; });
  await imports.page.getByLabel('匯入照片', { exact: true }).setInputFiles(['stop1', 'stop2', 'stop3'].map(name => ({ name: `${name}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.concat([sample, Buffer.from(name)]) })));
  await button(imports.page, '完成此張後停止').click(); await expect(imports.page.locator('.import-report')).toContainText('已取消 2'); await expect(imports.page.locator('.import-summary')).toContainText('已建立紀錄 1 筆，辨識成功 1 張');
  await imports.page.evaluate(() => { window.ocrDelay = 4000; });
  await imports.page.getByLabel('匯入照片', { exact: true }).setInputFiles({ name: 'interrupted.jpg', mimeType: 'image/jpeg', buffer: Buffer.concat([sample, Buffer.from('interrupted')]) });
  await expect.poll(async () => (await disk(imports.page)).records.some(row => row.status === 'processing')).toBe(true); await imports.page.reload(); await expect(imports.page.getByRole('status').filter({ hasText: '上次匯入／辨識中斷' })).toBeVisible();
  const interrupted = (await disk(imports.page)).records.find(row => row.fileName === 'interrupted.jpg'); assert.equal(interrupted.status, 'error');
  await imports.page.locator('.record').filter({ hasText: 'interrupted.jpg' }).click(); await button(imports.page, '重新辨識').click(); await expect(imports.page.locator('.comparison-modal')).toBeVisible(); await button(imports.page, '全部採用').click(); await button(imports.page, '儲存為待確認').click(); assert.equal((await disk(imports.page)).records.length, 5); await imports.context.close();
  console.log('PASS: D mixed import statuses/counts, retry preserves ID, trash duplicate recovery, finish-current stop and interrupted import recovery.');
  for (const [width, height] of [[390, 844], [360, 800]]) {
    const mobile = await setup(fixture, { width, height });
    await mobile.page.getByLabel('篩選作品系列', { exact: true }).selectOption('HGUC 宇宙世紀'); await expect(mobile.page.locator('.record')).toHaveCount(2); await expect(mobile.page.locator('.record .location-cell').first()).toBeVisible();
    assert.equal(await mobile.page.locator('.record .location-cell').first().textContent(), '位置未填'); assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await screenshot(mobile.page, `ux-bcd-mobile-${width}-list`);
    await button(mobile.page, '匯出 Excel').click(); await screenshot(mobile.page, `ux-bcd-mobile-${width}-export`); await button(mobile.page, '取消').click();
    await restoreFile(mobile.page, savedBackup); await screenshot(mobile.page, `ux-bcd-mobile-${width}-restore`); assert.ok(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await button(mobile.page, '取消').click(); await mobile.context.close();
  }
  assert.deepEqual(errors, []); console.log('PASS: desktop and 390/360px mobile layout, series/location access, export/restore screenshots; no browser errors.');
} catch (error) {
  console.error(error);
  for (const [index, context] of browser.contexts().entries()) for (const page of context.pages()) { await screenshot(page, `ux-bcd-failure-${index}`).catch(() => {}); console.error((await page.locator('dialog[open]').allTextContents()).map(text => text.slice(-1600))); }
  throw error;
} finally {
  for (const context of browser.contexts()) for (const page of context.pages()) await page.evaluate(() => window.clearUnloadListeners?.()).catch(() => {});
  await browser.close(); await server.close();
}
