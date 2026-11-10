import { get, set } from 'idb-keyval';
import { loadWorkspaceFrom, WORKSPACE_KEY } from './storage-migration.mjs';
export const loadWorkspace = () => loadWorkspaceFrom({ get, set });
export const saveWorkspace = (records, metadata) => set(WORKSPACE_KEY, { version: 2, records, metadata });
export { readBackup } from './backup-model.mjs';
export function download(blob, name) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
