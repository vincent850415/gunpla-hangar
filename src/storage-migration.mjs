import { emptyMetadata, migrateRecords, canonical } from './workspace-model.mjs';
export const LEGACY_KEY = 'hangar-records-v1', BACKUP_KEY = 'hangar-records-v1-original', WORKSPACE_KEY = 'hangar-workspace-v2', ACTIVE_KEY = 'hangar-active-schema';

// The active marker is written only after read-back verification. Failed
// migrations keep reading the untouched legacy source and can be retried.
export async function loadWorkspaceFrom(adapter, now = new Date().toISOString()) {
  const active = await adapter.get(ACTIVE_KEY);
  if (active === 2) {
    const workspace = await adapter.get(WORKSPACE_KEY);
    if (workspace?.version !== 2 || !Array.isArray(workspace.records) || !workspace.metadata) throw new Error('新版資料格式異常，請勿清除網站資料；舊版原樣備援仍保留。');
    return workspace;
  }
  const legacy = await adapter.get(LEGACY_KEY) || [];
  const records = migrateRecords(legacy, now), metadata = emptyMetadata();
  records.forEach(row => { metadata.revisions[row.id] = ++metadata.revision; });
  const workspace = { version: 2, records, metadata };
  try {
    if (await adapter.get(BACKUP_KEY) === undefined) await adapter.set(BACKUP_KEY, legacy);
    if (canonical(await adapter.get(BACKUP_KEY)) !== canonical(legacy)) throw new Error('原樣備援與舊資料不一致，未切換來源。');
    await adapter.set(WORKSPACE_KEY, workspace);
    if (canonical(await adapter.get(WORKSPACE_KEY)) !== canonical(workspace)) throw new Error('新資料驗證失敗，未切換來源。');
    await adapter.set(ACTIVE_KEY, 2);
    return workspace;
  } catch (error) {
    return { ...workspace, migrationError: `資料升級未完成，舊資料仍可讀取：${error.message}` };
  }
}
