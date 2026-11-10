export const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
export const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
// Dates track revision history; equivalence concerns the saved collection fields.
export function recordContent(row) {
  return canonical({ id: row.id, name: row.name || '', grade: row.grade || '待確認', series: row.series || '待確認', productLine: row.productLine || '',
    scale: row.scale || '', price: row.price === '' || row.price == null ? '' : Number(row.price), location: row.location || '', image: row.image || '',
    evidence: row.evidence || '', warnings: row.warnings || [], ocrEngine: row.ocrEngine || '', ocrConfidence: row.ocrConfidence ?? null, fileName: row.fileName || '', hash: row.hash || '',
    confirmed: Boolean(row.confirmed), status: row.status || 'ready', error: row.error || '', createdAt: row.createdAt, deletedAt: row.deletedAt || null });
}
export const emptyMetadata = () => ({ revision: 0, revisions: {}, backupBaseline: {}, lastBackupAt: null, reminderDismissedAt: null });
export function migrateRecords(rows, now) {
  if (!Array.isArray(rows)) throw new Error('收藏格式異常，舊資料已保留。');
  const ids = new Set();
  return rows.map(row => {
    if (!row || typeof row !== 'object') throw new Error('收藏格式異常，舊資料已保留。');
    let id = row.id;
    if (!validId(id) || ids.has(id)) id = crypto.randomUUID();
    ids.add(id);
    return { ...row, id, productLine: row.productLine || '', price: row.price === '' || row.price == null ? '' : Number(row.price), createdAt: validDate(row.createdAt) ? row.createdAt : now,
      updatedAt: validDate(row.updatedAt) ? row.updatedAt : validDate(row.createdAt) ? row.createdAt : now,
      deletedAt: validDate(row.deletedAt) ? row.deletedAt : null };
  });
}
export function reviseWorkspace(previous, incoming, metadata, now) {
  const old = new Map(previous.map(row => [row.id, row]));
  const revisions = { ...metadata.revisions };
  let revision = metadata.revision || 0;
  const records = incoming.map(row => {
    const before = old.get(row.id); old.delete(row.id);
    if (before && recordContent(before) === recordContent(row)) return before;
    revisions[row.id] = ++revision;
    return { ...row, updatedAt: now, deletedAt: row.deletedAt || null };
  });
  for (const id of old.keys()) revisions[id] = ++revision; // Keep tombstone revisions for backup status.
  return { records, metadata: { ...metadata, revision, revisions } };
}
export function backupStatus(metadata, now = new Date().toISOString()) {
  const changes = Object.entries(metadata.revisions || {}).filter(([id, revision]) => metadata.backupBaseline?.[id] !== revision).length;
  const last = validDate(metadata.lastBackupAt) ? Date.parse(metadata.lastBackupAt) : 0;
  const dismissed = validDate(metadata.reminderDismissedAt) ? Date.parse(metadata.reminderDismissedAt) : 0;
  return { changes, remind: changes > 0 && (!last || Date.parse(now) - last >= 7 * 86400000) && Date.parse(now) - dismissed >= 7 * 86400000 };
}
