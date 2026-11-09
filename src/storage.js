import { get, set } from 'idb-keyval';
const KEY = 'hangar-records-v1';
let pending = Promise.resolve();
export async function loadRecords() { return await get(KEY) || []; }
export function saveRecords(records) {
  const write = pending.catch(() => {}).then(() => set(KEY, records));
  pending = write;
  return write;
}
export function download(blob, name) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob); link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function readBackup(input) {
  if (input?.version !== 1 || !Array.isArray(input.records) || input.records.length > 10000) throw new Error('不是支援的收藏備份檔');
  return input.records.map(record => {
    const string = (key, max = 1000) => typeof record[key] === 'string' ? record[key].slice(0, max) : '';
    const image = string('image', 10000000);
    if (image && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) throw new Error('備份包含無效圖片');
    const price = record.price === '' || record.price == null ? '' : Number(record.price);
    if (price !== '' && (!Number.isFinite(price) || price < 0)) throw new Error('備份包含無效價格');
    return { id: crypto.randomUUID(), name: string('name'), series: string('series', 100) || '待確認', grade: string('grade', 100) || '待確認',
      productLine: string('productLine', 30).trim().toUpperCase(), scale: string('scale', 100), price, location: string('location'), image, evidence: string('evidence', 30000),
      fileName: string('fileName'), confirmed: false, warnings: [], status: 'ready', createdAt: string('createdAt'), hash: string('hash', 64) };
  });
}
