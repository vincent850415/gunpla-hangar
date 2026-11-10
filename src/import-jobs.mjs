export const jobLabels = { waiting: '等待', recognizing: '辨識中', success: '成功', duplicate: '重複', unsupported: '格式不支援', oversized: '檔案過大', decode: '解碼失敗', recognition: '辨識失敗', storage: '儲存失敗', cancelled: '已取消' };
export function summarizeJobs(jobs) {
  const counts = {};
  for (const job of jobs) counts[job.status] = (counts[job.status] || 0) + 1;
  return { counts, created: jobs.filter(job => job.created).length, succeeded: counts.success || 0,
    processed: jobs.filter(job => !['waiting', 'recognizing', 'cancelled'].includes(job.status)).length, total: jobs.length };
}
export async function runImportBatch(files, dependencies) {
  const jobs = files.map((file, index) => ({ key: String(index), fileName: file.name, status: 'waiting', recordId: null, created: false, error: '', action: '' }));
  const update = (index, patch) => { jobs[index] = { ...jobs[index], ...patch }; dependencies.report(jobs.slice()); };
  dependencies.report(jobs.slice());
  for (let index = 0; index < files.length; index++) {
    if (dependencies.stopped()) { for (let cursor = index; cursor < jobs.length; cursor++) update(cursor, { status: 'cancelled', action: '重新選取照片即可再匯入。' }); break; }
    const file = files[index];
    if (!/\.(jpe?g|png|webp)$/i.test(file.name) || (file.type && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { update(index, { status: 'unsupported', action: '先轉為 JPG／PNG／WebP 後重新選取。' }); continue; }
    if (file.size > 20 * 1024 * 1024) { update(index, { status: 'oversized', action: '縮小至 20 MB 以下後重新選取。' }); continue; }
    let row, stage = 'decode';
    update(index, { status: 'recognizing' });
    try {
      dependencies.progress(`${index + 1}／${files.length} · ${file.name} · 讀取照片`);
      const hash = await dependencies.hash(file);
      const duplicate = dependencies.records().find(record => record.hash === hash);
      if (duplicate) { update(index, { status: 'duplicate', recordId: duplicate.id, deleted: Boolean(duplicate.deletedAt), action: duplicate.deletedAt ? '照片位於回收桶，可復原既有收藏。' : '收藏中已有這張照片。' }); continue; }
      const image = await dependencies.decode(file);
      stage = 'storage'; row = await dependencies.create({ image, hash, fileName: file.name });
      update(index, { recordId: row.id, created: true });
      stage = 'recognition';
      const result = await dependencies.recognize(image, message => dependencies.progress(`${index + 1}／${files.length} · ${file.name} · ${message.status === 'recognizing text' ? `辨識文字 ${Math.round(message.progress * 100)}%（本張）` : '準備辨識引擎'}`));
      stage = 'storage'; await dependencies.complete(row.id, result);
      update(index, { status: 'success' });
    } catch (error) {
      if (row) { try { await dependencies.fail(row.id); } catch { stage = 'storage'; } }
      update(index, { status: stage, error: stage === 'storage' ? '本機寫入失敗，請備份後重試。' : stage === 'decode' ? '無法解碼照片，請重新轉檔。' : '辨識未完成，可重試原紀錄或手動填寫。', action: stage === 'recognition' ? '重試辨識' : '重新選取照片；已建立的紀錄可從清單開啟。' });
      if (stage === 'storage') { for (let cursor = index + 1; cursor < jobs.length; cursor++) update(cursor, { status: 'cancelled', action: '儲存失敗後停止，請處理容量再重新選取。' }); break; }
    }
  }
  return jobs;
}
