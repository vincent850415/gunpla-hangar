import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRestore, planRestore, readBackup } from '../src/backup-model.mjs';

const date = '2026-11-10T00:00:00.000Z';
const row = (id, extra = {}) => ({ id, name: 'GUNDAM', grade: 'HG', productLine: 'HGUC', series: 'UC 宇宙世紀', scale: '1/144', price: 0, location: 'A', confirmed: true, image: '', fileName: '', hash: '', evidence: 'evidence', ocrEngine: 'local', warnings: ['verify'], status: 'ready', error: '', deletedAt: null, createdAt: date, updatedAt: date, ...extra });
const backup = records => ({ version: 2, exportedAt: date, records });
test('v2 full restore retains complete status and repeating it adds nothing; external imports are pending', async () => {
  const parsed = await readBackup(backup([row('a', { ocrConfidence: 97 }), row('deleted', { deletedAt: date, price: '' }), row('manual', { image: '', hash: '', confirmed: false })]));
  assert.deepEqual(parsed.errors, []);
  const initial = mergeRestore([], planRestore([], parsed)); assert.equal(initial[0].confirmed, true); assert.equal(initial[1].deletedAt, date); assert.equal(initial[1].price, '');
  assert.deepEqual(initial[0].warnings, ['verify']); assert.equal(initial[0].evidence, 'evidence');
  assert.equal(initial[0].ocrConfidence, 97);
  const repeated = planRestore(initial, parsed); assert.deepEqual(repeated.counts, { new: 0, same: 3, conflict: 0, invalid: 0 });
  assert.equal(mergeRestore(initial, repeated).length, 3);
  assert.ok(mergeRestore([], planRestore([], parsed, 'external')).every(row => !row.confirmed));
});
test('same ID, same hash different ID and deleted-state conflicts default to keeping current and preserve stable IDs when adopted', async () => {
  const existing = [row('a'), row('hash-target', { hash: 'a'.repeat(64) }), row('deleted', { deletedAt: date })];
  const parsed = await readBackup(backup([row('a', { name: 'new name' }), row('different-id', { hash: 'a'.repeat(64) }), row('deleted', { deletedAt: null })]));
  const plan = planRestore(existing, parsed); assert.equal(plan.counts.conflict, 3); assert.deepEqual(mergeRestore(existing, plan), existing);
  const adopted = mergeRestore(existing, plan, ['0', '1', '2']); assert.equal(adopted[0].name, 'new name'); assert.equal(adopted[1].id, 'hash-target'); assert.equal(adopted[2].deletedAt, null); assert.equal(adopted.length, 3);
});
test('v1 retains IDs, deterministically maps missing IDs per source and never merges manual records by name', async () => {
  const source = { version: 1, records: [row('known'), { name: 'same name' }, { name: 'same name' }] };
  const parsed = await readBackup(source), again = await readBackup(source);
  assert.deepEqual(parsed.errors, []); assert.equal(parsed.records[0].id, 'known'); assert.ok(parsed.records.every(row => !row.confirmed));
  assert.deepEqual(parsed.records.map(row => row.id), again.records.map(row => row.id));
  assert.notEqual(parsed.records[1].id, parsed.records[2].id);
  const restored = mergeRestore([], planRestore([], parsed)); assert.equal(planRestore(restored, again).counts.same, 3);
});
test('damaged input, invalid confirmed rows, duplicate IDs and same-batch hash conflicts block whole preview', async () => {
  for (const bad of [row('x', { price: -1 }), row('x', { price: true }), row('x', { price: ' ' }), row('x', { image: 'https://remote/photo' }), row('x', { image: 'data:image/jpeg;base64,YmFk' }), row('x', { warnings: [42] }), row('x', { ocrConfidence: 101 }), row('x', { confirmed: true, grade: 'MG' }), row('x', { name: 'x'.repeat(201) }), row('x', { deletedAt: 'bad' }), row('__proto__')]) {
    const parsed = await readBackup(backup([row('good'), bad])); assert.equal(parsed.errors.length, 1);
    assert.throws(() => mergeRestore([], planRestore([], parsed)), /無效/);
  }
  assert.equal((await readBackup(backup([row('x'), row('x')]))).errors.length, 1);
  assert.equal((await readBackup(backup([row('a', { hash: 'a'.repeat(64) }), row('b', { hash: 'a'.repeat(64) })]))).errors.length, 1);
  await assert.rejects(readBackup({ version: 3, records: [] }), /支援/);
});
