import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollectionStore } from '../src/collection-store.mjs';

test('mutations wait for successful durable writes before publishing', async () => {
  let finish, published = [], state;
  const store = createCollectionStore(() => new Promise(resolve => { finish = resolve; }), rows => { published = rows; }, value => { state = value; });
  store.hydrate([{ id: 'a' }]);
  const saving = store.update(rows => [...rows, { id: 'b' }]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(published.map(r => r.id), ['a']); assert.equal(state, 'saving');
  finish(); await saving;
  assert.deepEqual(published.map(r => r.id), ['a', 'b']); assert.equal(state, 'saved');
});
test('capacity failure retains original data, queued edits rebase and retry recovers', async () => {
  let fail = true, published, state;
  const writes = [];
  const store = createCollectionStore(async rows => { if (fail) { fail = false; throw new Error('QuotaExceededError'); } writes.push(rows); }, rows => { published = rows; }, value => { state = value; });
  store.hydrate([{ id: 'a', price: '' }]);
  await assert.rejects(store.update(rows => rows.map(r => ({ ...r, price: 9 }))), /Quota/);
  assert.equal(published[0].price, ''); assert.equal(state, 'error');
  const first = store.update(rows => [...rows, { id: 'b' }]);
  const second = store.update(rows => rows.map(r => r.id === 'a' ? { ...r, price: 0 } : r));
  await Promise.all([first, second]);
  assert.equal(published.length, 2); assert.equal(published[0].price, 0); assert.equal(state, 'saved'); assert.equal(writes.length, 2);
});
