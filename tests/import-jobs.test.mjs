import test from 'node:test';
import assert from 'node:assert/strict';
import { runImportBatch, summarizeJobs } from '../src/import-jobs.mjs';

test('mixed batch reports every file, created records separately from recognition success and recoverable trash duplicates', async () => {
  const files = ['ok.jpg', 'duplicate.jpg', 'trash.jpg', 'huge.jpg', 'bad.heic', 'decode.png', 'ocr.jpg'].map(name => ({ name, type: '', size: name === 'huge.jpg' ? 21 * 1024 * 1024 : 10 }));
  const rows = [{ id: 'dup', hash: 'duplicate.jpg' }, { id: 'trash', hash: 'trash.jpg', deletedAt: 'today' }];
  const jobs = await runImportBatch(files, { report: () => {}, progress: () => {}, stopped: () => false, records: () => rows, hash: async file => file.name,
    decode: async file => { if (file.name === 'decode.png') throw new Error(); return file.name; },
    create: async fields => { const row = { id: fields.hash, ...fields }; rows.push(row); return row; },
    recognize: async image => { if (image === 'ocr.jpg') throw new Error(); return {}; }, complete: async () => {}, fail: async () => {} });
  assert.deepEqual(jobs.map(job => job.status), ['success', 'duplicate', 'duplicate', 'oversized', 'unsupported', 'decode', 'recognition']);
  assert.equal(jobs[2].deleted, true); assert.equal(jobs[6].recordId, 'ocr.jpg'); assert.equal(rows.length, 4);
  assert.equal(summarizeJobs(jobs).created, 2); assert.equal(summarizeJobs(jobs).succeeded, 1); assert.equal(summarizeJobs(jobs).processed, 7);
});
test('stopping finishes current image and cancels unstarted files; capacity failure cancels the rest', async () => {
  let stopped = false;
  const files = ['a.jpg', 'b.jpg', 'c.jpg'].map(name => ({ name, size: 1 }));
  const dependencies = { report: () => {}, progress: () => {}, stopped: () => stopped, records: () => [], hash: async file => file.name, decode: async () => 'image', create: async () => ({ id: 'a' }), recognize: async () => { stopped = true; return {}; }, complete: async () => {}, fail: async () => {} };
  const jobs = await runImportBatch(files, dependencies); assert.deepEqual(jobs.map(job => job.status), ['success', 'cancelled', 'cancelled']); assert.equal(summarizeJobs(jobs).processed, 1);
  stopped = false; const failure = await runImportBatch(files, { ...dependencies, create: async () => { throw new Error('Quota'); } });
  assert.deepEqual(failure.map(job => job.status), ['storage', 'cancelled', 'cancelled']); assert.equal(summarizeJobs(failure).created, 0);
});
