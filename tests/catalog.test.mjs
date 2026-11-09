import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecognition, validRecord } from '../src/catalog.mjs';
test('box evidence keeps grade, scale and franchise distinct', () => {
  const result = parseRecognition('HG UNIVERSALCENTURY\nRX-78-2 GUNDAM\n1/144 RX-78-2 HG');
  assert.equal(result.grade, 'HG'); assert.equal(result.scale, '1/144'); assert.equal(result.series, 'UC 宇宙世紀'); assert.equal(result.name, 'RX-78-2 GUNDAM'); assert.equal(result.price, '');
});
test('specialized grades must not be reduced to MG, SD or PG', () => {
  for (const grade of ['MGEX', 'MGSD', 'PG UNLEASHED', 'SD EX-STANDARD', 'FULL MECHANICS', 'RE/100']) assert.equal(parseRecognition(`${grade}\n1/100 GUNDAM`).grade, grade);
});
test('grade glued to Japanese OCR is recovered only from a scale label', () => {
  assert.equal(parseRecognition('1/144 RX-78-2[ AVF LIHG').grade, 'HG');
  assert.equal(parseRecognition('AVF LIHG').grade, '待確認');
});
test('HG is not automatically UC; scale is not inferred from grade', () => {
  const result = parseRecognition('HG\nGUNDAM AERIAL\nTHE WITCH FROM MERCURY');
  assert.equal(result.series, '水星的魔女'); assert.equal(result.scale, '');
  assert.equal(parseRecognition('HG GUNDAM').series, '待確認');
});
test('conflicting franchise evidence stays unresolved', () => { assert.equal(parseRecognition('HGUC\nGUNDAM AERIAL').series, '待確認'); });
test('unknown text is reviewable; price cannot be silently invented', () => {
  const result = parseRecognition('BANDAI\nMADE IN JAPAN\n¥2000');
  assert.equal(result.grade, '待確認'); assert.equal(result.name, ''); assert.equal(result.price, ''); assert.equal(validRecord(result), false);
});
test('confirmation accepts optional price/location but rejects invalid money', () => {
  const row = { name: 'Example', grade: '其他', series: '其他', price: '' };
  assert.equal(validRecord(row), true); assert.equal(validRecord({ ...row, price: 0 }), true);
  for (const price of [-10, 'NaN', Infinity]) assert.equal(validRecord({ ...row, price }), false);
});
test('generic names are not limited to the Gundam keyword list', () => {
  assert.equal(parseRecognition('== HI-MOCK').name, 'HI-MOCK');
  assert.equal(parseRecognition('=m HI-MOCK').name, 'HI-MOCK');
  assert.equal(parseRecognition('ARMORED TROOPER').name, 'ARMORED TROOPER');
  assert.equal(parseRecognition('BUILD FIGHTERS\nBATTLE SYSTEM SIMULATOR MOBILE SUIT').name, '');
});
test('lowercase art noise is not a grade; complete descriptors remain supported', () => {
  assert.equal(parseRecognition('rg\nHI-MOCK\nBUILD FIGHTERS').grade, '待確認');
  assert.equal(parseRecognition('High Grade\nHI-MOCK').grade, 'HG');
  assert.equal(parseRecognition('RG\nRX-78-2 GUNDAM').grade, 'RG');
});
test('prefer the dedicated title pass over noisy full-image candidates', () => {
  const nameSources = [{ text: '2 HI-MOEK', priority: 0 }, { text: '=m HI-MOCK', priority: 3 }];
  assert.equal(parseRecognition(nameSources.map(s => s.text).join('\n'), { nameSources }).name, 'HI-MOCK');
});
test('missing slash is a suggestion, never an automatic scale or price', () => {
  const result = parseRecognition('HI-MOCK\n1144 Nee\nBUILD FIGHTERS');
  assert.equal(result.scale, ''); assert.equal(result.price, '');
  assert.ok(result.warnings.some(warning => warning.includes('可能是 1/144')));
  assert.equal(parseRecognition('ITEM 1144').warnings.some(warning => warning.includes('可能是')), false);
});
test('conflicting scales require manual review', () => {
  const result = parseRecognition('1/144\n1/100');
  assert.equal(result.scale, ''); assert.ok(result.warnings.includes('讀到多個比例，請以盒面確認'));
});
