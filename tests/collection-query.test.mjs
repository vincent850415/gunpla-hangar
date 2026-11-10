import test from 'node:test';
import assert from 'node:assert/strict';
import { exportPreview, locationSuggestions, planBatch, queryCollection } from '../src/collection-query.mjs';
import { makeWorkbook } from '../src/export.mjs';

const row = (id, extra = {}) => ({ id, name: id, series: 'SEED', grade: 'HG', productLine: '', scale: '', location: '', price: '', confirmed: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...extra });
test('query combines filters and stable nonmutating sorts, empty money follows zero in both directions', () => {
  const rows = [row('b', { price: 0 }), row('a', { price: '' }), row('c', { price: 25, location: ' A ' }), row('d', { price: null, createdAt: 'bad' }), row('gone', { deletedAt: 'today', price: 500 })];
  const original = structuredClone(rows);
  assert.deepEqual(queryCollection(rows, { sort: 'price-asc' }).map(r => r.id), ['b', 'c', 'a', 'd']);
  assert.deepEqual(queryCollection(rows, { sort: 'price-desc' }).map(r => r.id), ['c', 'b', 'a', 'd']);
  assert.deepEqual(queryCollection(rows, { series: 'SEED', grade: 'HG', location: 'value:A', confirmation: 'confirmed', search: 'c' }).map(r => r.id), ['c']);
  assert.equal(queryCollection(rows, { location: '__empty__' }).length, 3);
  assert.deepEqual(queryCollection(rows, { sort: 'oldest' }).map(r => r.id), ['d', 'a', 'b', 'c']);
  assert.deepEqual(rows, original);
});
test('location suggestions trim, dedupe exactly and prefer recent nondeleted usage', () => {
  const rows = [row('a', { location: ' A ' }), row('b', { location: 'A', updatedAt: '2026-02-01' }), row('c', { location: 'a', updatedAt: '2026-03-01' }), row('d', { location: 'deleted', deletedAt: 'today' })];
  assert.deepEqual(locationSuggestions(rows), ['a', 'A']);
  assert.equal(queryCollection([row('x', { location: '__empty__' })], { location: 'value:__empty__' }).length, 1);
});
test('batch changes only selected rows, keeps confirmation for position, blocks all incompatible series', () => {
  const rows = Array.from({ length: 6 }, (_, index) => row(String(index), { grade: index === 4 ? 'MG' : 'HG' }));
  const selected = rows.slice(0, 5).map(r => r.id);
  const plan = planBatch(rows, selected, { locationMode: 'set', location: ' Shelf ', seriesMode: 'keep' });
  assert.equal(plan.errors.length, 0); assert.equal(plan.records.filter(r => r.location === 'Shelf').length, 5);
  assert.ok(plan.records.every(r => r.confirmed)); assert.equal(plan.records[5], rows[5]);
  const cleared = planBatch(plan.records, selected, { locationMode: 'clear', seriesMode: 'keep' });
  assert.ok(cleared.records.every(r => r.location === ''));
  const incompatible = planBatch(rows, selected, { locationMode: 'keep', seriesMode: 'set', series: 'HGUC 宇宙世紀' });
  assert.equal(incompatible.records, rows); assert.match(incompatible.errors[0], /4.*MG.*不相容/);
  const compatible = planBatch(rows, ['0'], { locationMode: 'keep', seriesMode: 'set', series: 'HGUC 宇宙世紀' });
  assert.equal(compatible.records[0].confirmed, false); assert.equal(compatible.records[0].productLine, 'HGUC'); assert.equal(compatible.records[0].grade, 'HG');
});
test('export scopes use frozen ordered snapshots, roundtrip four columns, zero/blank and exclude deleted', async () => {
  const rows = [row('pending', { confirmed: false }), row('zero', { price: 0 }), row('blank', { series: '水星的魔女' }), row('deleted', { deletedAt: 'today' })];
  const all = exportPreview(queryCollection(rows, { sort: 'name' })), filtered = exportPreview(queryCollection(rows, { series: 'SEED' }));
  assert.equal(all.records.length, 2); assert.equal(all.excluded, 1); assert.equal(filtered.records.length, 1); assert.equal(filtered.excluded, 1);
  rows[1].price = 900;
  for (const preview of [all, filtered]) {
    const book = await makeWorkbook(preview.records);
    const bytes = await book.xlsx.writeBuffer(), workbook = new book.constructor(); await workbook.xlsx.load(bytes);
    assert.equal(workbook.getWorksheet('SEED').getCell('C2').value, 0);
    assert.equal(workbook.getWorksheet('SEED').columnCount, 4);
    if (preview === all) { assert.equal(workbook.worksheets.length, 2); assert.equal(workbook.getWorksheet('水星的魔女').getCell('C2').value, null); }
    else assert.equal(workbook.worksheets.length, 1);
  }
  const direct = await makeWorkbook(rows); assert.equal(direct.getWorksheet('SEED').rowCount, 2);
});
