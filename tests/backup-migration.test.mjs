import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_KEY, BACKUP_KEY, LEGACY_KEY, WORKSPACE_KEY, loadWorkspaceFrom } from '../src/storage-migration.mjs';
import { backupStatus, emptyMetadata, migrateRecords, reviseWorkspace } from '../src/workspace-model.mjs';
import { createCollectionStore } from '../src/collection-store.mjs';

const now = '2026-11-10T00:00:00.000Z';
const legacy = [{ id: 'valid-id', name: 'old', price: 0, confirmed: true, createdAt: '2026-01-01T00:00:00Z' }, { name: 'manual', createdAt: 'invalid' }];
function adapter(failKey) {
  const data = new Map([[LEGACY_KEY, structuredClone(legacy)]]);
  return { data, get: async key => structuredClone(data.get(key)), set: async (key, value) => { if (key === failKey) throw new Error('QuotaExceededError'); data.set(key, structuredClone(value)); } };
}
test('legacy migration preserves original backup, IDs, zero and stable generated timestamps across reloads', async () => {
  const io = adapter(), workspace = await loadWorkspaceFrom(io, now);
  assert.deepEqual(io.data.get(BACKUP_KEY), legacy); assert.deepEqual(io.data.get(LEGACY_KEY), legacy);
  assert.equal(workspace.records[0].id, 'valid-id'); assert.equal(workspace.records[0].price, 0); assert.equal(workspace.records[0].confirmed, true);
  assert.equal(workspace.records[0].updatedAt, legacy[0].createdAt); assert.equal(workspace.records[1].updatedAt, now); assert.equal(workspace.records[1].deletedAt, null);
  assert.equal(io.data.get(ACTIVE_KEY), 2);
  assert.deepEqual(await loadWorkspaceFrom(io, '2027-01-01'), workspace);
});
test('every migration failure retains a readable legacy source and never switches early', async () => {
  for (const key of [BACKUP_KEY, WORKSPACE_KEY, ACTIVE_KEY]) {
    const io = adapter(key), workspace = await loadWorkspaceFrom(io, now);
    assert.match(workspace.migrationError, /未完成/); assert.deepEqual(io.data.get(LEGACY_KEY), legacy); assert.notEqual(io.data.get(ACTIVE_KEY), 2);
    assert.equal(workspace.records[0].name, 'old');
  }
  const io = adapter(), actualGet = io.get;
  io.get = async key => key === WORKSPACE_KEY ? { corrupted: true } : actualGet(key);
  assert.match((await loadWorkspaceFrom(io, now)).migrationError, /驗證失敗/);
  assert.equal(io.data.has(ACTIVE_KEY), false);
});
test('metadata and records publish atomically on durable success, backup revisions count each record once', async () => {
  let fail = false, published, publishedMeta, disk;
  const store = createCollectionStore(async (records, metadata) => { if (fail) throw new Error('Quota'); disk = structuredClone({ records, metadata }); }, (rows, meta) => { published = rows; publishedMeta = meta; }, () => {});
  store.hydrate(migrateRecords(legacy, now), emptyMetadata());
  await store.update(rows => rows.map(row => ({ ...row, location: 'A' })));
  const snapshot = structuredClone(store.snapshot());
  await store.update(rows => rows, meta => ({ ...meta, lastBackupAt: now, backupBaseline: snapshot.metadata.revisions }));
  assert.equal(backupStatus(publishedMeta, now).changes, 0);
  await store.update(rows => rows.map((row, index) => index === 0 ? { ...row, location: 'B' } : row));
  await store.update(rows => rows.map((row, index) => index === 0 ? { ...row, location: 'C' } : row));
  assert.equal(backupStatus(publishedMeta, now).changes, 1);
  const before = structuredClone(disk); fail = true;
  await assert.rejects(store.update(rows => rows.slice(1), meta => ({ ...meta, lastBackupAt: '2027-01-01' })), /Quota/);
  assert.deepEqual(disk, before); assert.deepEqual(published, before.records); assert.deepEqual(publishedMeta, before.metadata);
  assert.equal(backupStatus(publishedMeta, '2026-11-18').remind, true);
  assert.equal(backupStatus({ ...publishedMeta, reminderDismissedAt: '2026-11-18' }, '2026-11-18').remind, false);
  fail = false; await store.update(rows => rows.slice(1)); assert.equal(backupStatus(publishedMeta, now).changes, 1);
});
test('unchanged content does not reset updatedAt or change backup revision', () => {
  const rows = migrateRecords(legacy, now), metadata = emptyMetadata();
  const same = reviseWorkspace(rows, rows.map(row => ({ ...row })), metadata, '2027-01-01');
  assert.equal(same.records[0], rows[0]); assert.equal(same.metadata.revision, 0);
});
