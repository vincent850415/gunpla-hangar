import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDetectedText } from '../src/detected-text.mjs';
const item = (text, y = 650, height = 50, score = .99) => ({ text, score, poly: [[100, y], [700, y], [700, y + height], [100, y + height]] });
const pass = items => ({ kind: 'full', label: 'test', image: { width: 1000, height: 1000 }, items });
test('position and text size distinguish product title from franchise and captions', () => {
  const result = parseDetectedText([pass([item('HG', 100), item('BUILD FIGHTERS', 160, 15), item('GUNDAM', 190, 30), item('GUNDAM EZ-SR'), item('TEAM SRSC MOBILE SUIT', 710, 25), item('1/144ガンダムEz-SR', 740, 15), item('TOY WORLD', 850)])]);
  assert.equal(result.name, 'GUNDAM EZ-SR'); assert.equal(result.grade, 'HG'); assert.equal(result.scale, '1/144'); assert.equal(result.series, '鋼彈創鬥者');
});
test('Japanese scale labels support glued grade and model text without guessing', () => {
  const result = parseDetectedText([pass([item('HG1/144RX-79[G]Ez-8「ガンダム」HG', 740, 15), item('UNIVERSALCENTURY', 180, 20), item('RX-79[G]Ez-8 GUNDAM Ez8')])]);
  assert.equal(result.grade, 'HG'); assert.equal(result.scale, '1/144'); assert.equal(result.series, 'UC 宇宙世紀');
  assert.equal(result.name, 'RX-79[G]Ez-8 GUNDAM Ez8');
});
test('unknown product titles and variants remain evidence, not a hardcoded catalog answer', () => {
  const result = parseDetectedText([pass([item('RG', 100), item('CUSTOM ROBOT Ver. BLUE MOON'), item('1/100', 740, 15)])]);
  assert.equal(result.name, 'CUSTOM ROBOT Ver. BLUE MOON'); assert.equal(result.series, '待確認'); assert.equal(result.price, '');
  assert.ok(result.warnings.some(w => w.includes('版本')));
});
test('low-confidence background cannot introduce a grade or product', () => {
  const result = parseDetectedText([pass([item('RG', 300, 50, .4), item('BACKGROUND WORDS', 100, 50, .5), item('HI-MOCK')])]);
  assert.equal(result.grade, '待確認'); assert.equal(result.name, 'HI-MOCK'); assert.equal(result.scale, '');
});
test('minor franchise OCR normalization is disclosed and raw text retained', () => {
  const result = parseDetectedText([pass([item('BUILD FICHTERS', 100), item('HI-MOCK')])]);
  assert.equal(result.series, '鋼彈創鬥者'); assert.match(result.evidence, /FICHTERS/);
  assert.ok(result.warnings.some(w => w.includes('FICHTERS')));
});
test('Greek nu versus Latin V remains a visible uncertainty', () => {
  const result = parseDetectedText([pass([item('Hi-VGUNDAM TEST Ver.The Crimson Comet')])]);
  assert.equal(result.name, 'Hi-V GUNDAM TEST Ver.The Crimson Comet');
  assert.ok(result.warnings.some(w => w.includes('希臘字母')));
});
