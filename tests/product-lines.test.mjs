import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecognition, validRecord } from '../src/catalog.mjs';
import { seriesLabel, parseSeriesLabel } from '../src/product-lines.mjs';

test('HGUC packaging keeps franchise, grade and series label separately', () => {
  const record = parseRecognition('HG\nUNIVERSALCENTURY\nRX-78-2 GUNDAM\n1/144');
  assert.equal(record.productLine, 'HGUC'); assert.equal(record.grade, 'HG');
  assert.equal(record.series, 'UC 宇宙世紀'); assert.equal(seriesLabel(record), 'HGUC 宇宙世紀');
  assert.equal(record.name, 'RX-78-2 GUNDAM');
});
test('model names alone never imply a product line', () => {
  for (const grade of ['HG', 'RG', 'MG', 'EG']) assert.equal(parseRecognition(`${grade}\nRX-78-2 GUNDAM`).productLine, '');
  assert.equal(parseRecognition('HG\nGUNDAM SEED').productLine, '');
});
test('explicit codes and Build Fighters packaging map to Chinese series', () => {
  assert.equal(seriesLabel(parseRecognition('HG\nBUILD FIGHTERS\nHI-MOCK')), 'HGBF 鋼彈創鬥者');
  assert.equal(seriesLabel(parseRecognition('HGCE\nDESTINY GUNDAM')), 'HGCE SEED');
  assert.equal(parseRecognition('HGBF\nHI-MOCK').grade, 'HG');
  assert.equal(parseRecognition('HGBD:R').productLine, 'HGBD:R');
});
test('conflicting or low confidence branding remains unresolved', () => {
  const record = parseRecognition('HGUC\nHGBF');
  assert.equal(record.productLine, ''); assert.ok(record.warnings.some(w => w.includes('簡寫線索衝突')));
  assert.equal(parseRecognition('HGUC\nHG', { gradeText: 'HG' }).productLine, '');
});
test('editing a combined series roundtrips and removal clears the code', () => {
  assert.deepEqual(parseSeriesLabel('HGUC 宇宙世紀'), { series: 'UC 宇宙世紀', productLine: 'HGUC' });
  assert.equal(seriesLabel(parseSeriesLabel('hgbf 鋼彈創鬥者')), 'HGBF 鋼彈創鬥者');
  assert.deepEqual(parseSeriesLabel('自訂作品'), { series: '自訂作品', productLine: '' });
  assert.equal(seriesLabel({ series: 'UC 宇宙世紀' }), 'UC 宇宙世紀');
  assert.equal(validRecord({ name: 'RX-78-2', series: 'UC 宇宙世紀', grade: 'MG', productLine: 'HGUC' }), false);
});
