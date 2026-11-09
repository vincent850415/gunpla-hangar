import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { makeWorkbook, sheetName } from '../src/export.mjs';
test('Excel roundtrip uses franchise tabs, exactly four headers, numeric price and blank unknowns', async () => {
  const base = { confirmed: true, grade: 'HG', name: 'RX-78-2 GUNDAM', series: 'UC 宇宙世紀', scale: '1/144', price: '', location: '' };
  const workbook = await makeWorkbook([base, { ...base, name: '=1+1', price: 0 }, { ...base, series: 'SEED', grade: 'MG', price: '1600', location: '書房 A 櫃' }, { ...base, confirmed: false, series: '水星的魔女' }]);
  const restored = new ExcelJS.Workbook(); await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.deepEqual(restored.worksheets.map(s => s.name), ['UC 宇宙世紀', 'SEED']);
  const sheet = restored.worksheets[0];
  assert.deepEqual(sheet.getRow(1).values.slice(1), ['比例', '商品名稱', '價格', '存放位置']);
  assert.equal(sheet.getCell('B2').value, '[HG] RX-78-2 GUNDAM'); assert.equal(sheet.getCell('C2').value, null); assert.equal(sheet.getCell('C3').value, 0);
  assert.equal(restored.worksheets[1].getCell('C2').value, 1600); assert.equal(sheet.getCell('B3').type, ExcelJS.ValueType.String);
  assert.equal(sheet.views[0].ySplit, 1); assert.equal(sheet.autoFilter, 'A1:D3');
});
test('custom sheet names remain valid and cannot collide case-insensitively', () => {
  const used = new Set();
  const names = ['a/b', 'a?b', 'A B', 'History', "'test'", '', 'x'.repeat(50), 'x'.repeat(50)].map(s => sheetName(s, used));
  assert.equal(new Set(names.map(s => s.toLowerCase())).size, names.length);
  for (const name of names) { assert.ok(name.length <= 31); assert.doesNotMatch(name, /[\\/*?:\[\]]/); }
  assert.equal(names[3], 'History 收藏');
});
test('empty/unconfirmed export is rejected', async () => { await assert.rejects(() => makeWorkbook([{ confirmed: false }]), /確認/); });

test('product-line abbreviation belongs to the sheet title, not the product name', async () => {
  const base = { confirmed: true, grade: 'HG', productLine: 'HGUC', name: 'RX-78-2 GUNDAM', series: 'UC 宇宙世紀', scale: '1/144' };
  const workbook = await makeWorkbook([base, { ...base, productLine: 'HGBF', name: 'HI-MOCK', series: '鋼彈創鬥者' }]);
  const restored = new ExcelJS.Workbook(); await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.deepEqual(restored.worksheets.map(s => s.name), ['HGUC 宇宙世紀', 'HGBF 鋼彈創鬥者']);
  assert.equal(restored.worksheets[0].getCell('B2').value, '[HG] RX-78-2 GUNDAM');
  assert.equal(restored.worksheets[1].getCell('B2').value, '[HG] HI-MOCK');
});
