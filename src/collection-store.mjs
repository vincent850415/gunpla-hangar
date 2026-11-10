// Every mutation is evaluated against the latest successful write. A failed
// transaction never publishes optimistic data or poisons the next operation.
export function createCollectionStore(write, publish, state) {
  let records = [], pending = Promise.resolve(), count = 0;
  return {
    hydrate(value) { records = value; publish(records); },
    update(change) {
      count++; state('saving');
      const operation = pending.catch(() => {}).then(async () => {
        const next = typeof change === 'function' ? change(records) : change;
        await write(next);
        records = next; publish(next);
        return next;
      });
      pending = operation;
      return operation.then(value => { if (--count === 0) state('saved'); return value; }, error => {
        if (--count === 0) state('error'); throw error;
      });
    },
  };
}
