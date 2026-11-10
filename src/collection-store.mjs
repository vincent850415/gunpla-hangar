import { emptyMetadata, reviseWorkspace } from './workspace-model.mjs';
// Every mutation is evaluated against the latest successful write. A failed
// transaction never publishes optimistic data or poisons the next operation.
export function createCollectionStore(write, publish, state) {
  let records = [], metadata = emptyMetadata(), pending = Promise.resolve(), count = 0;
  return {
    hydrate(value, meta = emptyMetadata()) { records = value; metadata = meta; publish(records, metadata); },
    snapshot() { return { records, metadata }; },
    update(change, changeMetadata) {
      count++; state('saving');
      const operation = pending.catch(() => {}).then(async () => {
        const incoming = typeof change === 'function' ? change(records) : change;
        const revised = reviseWorkspace(records, incoming, metadata, new Date().toISOString());
        const nextMetadata = changeMetadata ? changeMetadata(revised.metadata) : revised.metadata;
        await write(revised.records, nextMetadata);
        records = revised.records; metadata = nextMetadata; publish(records, metadata);
        return records;
      });
      pending = operation;
      return operation.then(value => { if (--count === 0) state('saved'); return value; }, error => {
        if (--count === 0) state('error'); throw error;
      });
    },
  };
}
