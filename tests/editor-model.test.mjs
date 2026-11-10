import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRecognition, asDraft, confirmationIds, confirmationSummary, draftSignature, queueTarget, validateDraft } from '../src/editor-model.mjs';

const record = { id: 'one', name: 'RX-78-2', series: 'UC 宇宙世紀', productLine: 'HGUC', grade: 'HG', scale: '1/144', price: 0, location: 'A 櫃', confirmed: true, evidence: 'old', warnings: ['old warning'], ocrEngine: 'old engine' };
test('dirty compares editable content, including zero vs blank, rather than object identity', () => {
  const draft = asDraft(record);
  assert.equal(draftSignature(draft), draftSignature({ ...draft, price: '0', status: 'ready' }));
  assert.notEqual(draftSignature(draft), draftSignature({ ...draft, price: '' }));
  assert.notEqual(draftSignature(draft), draftSignature({ ...draft, location: 'B' }));
  assert.equal(draft.series, 'HGUC 宇宙世紀');
});
test('recognition adoption updates only selected fields, coherent series and evidence; source stays intact', () => {
  const draft = asDraft(record), signature = draftSignature(draft);
  const candidate = { name: 'new', grade: 'MG', series: 'SEED', productLine: '', scale: '1/100', price: 999, location: 'wrong', evidence: 'new evidence', ocrEngine: 'new engine', warnings: ['new warning'] };
  assert.equal(applyRecognition(draft, candidate, []), draft);
  const next = applyRecognition(draft, candidate, ['name', 'series']);
  assert.equal(next.name, 'new'); assert.equal(next.series, 'SEED'); assert.equal(next.grade, 'HG');
  assert.equal(next.price, 0); assert.equal(next.location, 'A 櫃'); assert.equal(next.confirmed, false);
  assert.equal(next.evidence, 'new evidence'); assert.equal(next.ocrEngine, 'new engine');
  assert.ok(!next.warnings.includes('old warning')); assert.ok(next.warnings.length === 2);
  assert.equal(validateDraft(next, true).record.productLine, '');
  assert.equal(draftSignature(draft), signature); assert.equal(record.confirmed, true);
});
test('validation locates missing fields and incompatible HG product lines; drafts allow unresolved OCR', () => {
  const draft = asDraft(record);
  assert.equal(validateDraft({ ...draft, name: '' }, true).field, 'name');
  assert.equal(validateDraft({ ...draft, series: '待確認' }, true).field, 'series');
  assert.equal(validateDraft({ ...draft, grade: 'MG' }, true).field, 'grade');
  assert.equal(validateDraft({ ...draft, price: -1 }, false).field, 'price');
  assert.equal(validateDraft({ ...draft, name: '', grade: '待確認' }, false).record.confirmed, false);
  assert.equal(validateDraft(draft, true).record.price, 0);
});
test('queue snapshots visible order and survives confirmation, deletion and missing IDs', () => {
  const rows = [{ id: 'a' }, { id: 'done', confirmed: true }, { id: 'b' }, { id: 'processing', status: 'processing' }, { id: 'c' }, { id: 'deleted', deletedAt: 'today' }];
  const ids = confirmationIds(rows); assert.deepEqual(ids, ['a', 'b', 'c']);
  rows[0].confirmed = true;
  assert.equal(queueTarget(ids, 0, 1, rows), 1);
  assert.equal(queueTarget(ids, 1, -1, rows), 0);
  assert.equal(queueTarget(ids, 0, 1, rows.filter(r => r.id !== 'b')), 2);
  assert.equal(queueTarget(ids, 2, 1, rows), -1);
  assert.deepEqual(ids, ['a', 'b', 'c']);
});
test('summary reflects revisiting a confirmed item and saving it as pending, plus removed items', () => {
  const ids = ['a', 'b', 'c'];
  const rows = [{ id: 'a', confirmed: true }, { id: 'b', confirmed: true }, { id: 'c', confirmed: true }];
  assert.deepEqual(confirmationSummary(ids, rows), { confirmed: 3, pending: 0, removed: 0 });
  rows[0].confirmed = false; rows[1].deletedAt = 'today';
  assert.deepEqual(confirmationSummary(ids, rows), { confirmed: 1, pending: 1, removed: 1 });
  assert.deepEqual(confirmationSummary(ids, rows.slice(0, 2)), { confirmed: 0, pending: 1, removed: 2 });
});
