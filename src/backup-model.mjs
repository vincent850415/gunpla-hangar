import { GRADES, validRecord } from './catalog.mjs';
import { PRODUCT_LINES } from './product-lines.mjs';
import { canonical, recordContent, validDate, validId } from './workspace-model.mjs';

async function digest(text) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function readBackup(input) {
  if (![1, 2].includes(input?.version) || !Array.isArray(input.records) || input.records.length > 10000) throw new Error('不是支援的收藏備份檔（支援 v1／v2，最多 10000 筆）。');
  const version = input.version, errors = [], records = [], ids = new Set(), hashes = new Set();
  if (version === 2 && !validDate(input.exportedAt)) errors.push({ index: null, message: 'v2 備份缺少有效的匯出時間。' });
  const source = version === 1 ? await digest(canonical(input)) : '';
  for (const [index, raw] of input.records.entries()) {
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('不是有效的收藏資料。');
      const string = (key, max, fallback = '') => {
        if (raw[key] === undefined || raw[key] === null) return fallback;
        if (typeof raw[key] !== 'string' || raw[key].length > max) throw new Error(`${key} 必須是文字且不得超過 ${max} 字。`);
        return raw[key];
      };
      const id = validId(raw.id) ? raw.id : version === 1 ? `legacy-${source}-${index}` : null;
      if (!id) throw new Error('紀錄 ID 無效。');
      if (ids.has(id)) throw new Error('同一備份包含重複 ID。');
      ids.add(id);
      const image = string('image', 10000000);
      if (image) {
        const match = image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
        if (!match || match[2].length % 4 !== 0) throw new Error('照片不是有效的 JPG／PNG／WebP 資料。');
        const header = atob(match[2].slice(0, 40));
        const valid = match[1] === 'jpeg' ? header.startsWith('\xff\xd8\xff') : match[1] === 'png' ? header.startsWith('\x89PNG\r\n\x1a\n') : header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP';
        if (!valid) throw new Error('照片內容與格式不符。');
      }
      const hash = string('hash', 64);
      if (hash && !/^[a-f0-9]{64}$/i.test(hash)) throw new Error('照片雜湊格式無效。');
      if (hash && hashes.has(hash)) throw new Error('同一備份含相同照片雜湊，請先解決同批衝突。');
      if (hash) hashes.add(hash);
      const price = raw.price === '' || raw.price == null ? '' : raw.price;
      if (price !== '' && (!['number', 'string'].includes(typeof price) || (typeof price === 'string' && !price.trim()) || !Number.isFinite(Number(price)) || Number(price) < 0)) throw new Error('價格必須是非負數，或保留空白。');
      if (raw.confirmed != null && typeof raw.confirmed !== 'boolean') throw new Error('確認狀態必須是布林值。');
      if (raw.warnings != null && (!Array.isArray(raw.warnings) || raw.warnings.length > 100 || raw.warnings.some(value => typeof value !== 'string' || value.length > 1000))) throw new Error('辨識提醒格式無效。');
      if (raw.ocrConfidence != null && (typeof raw.ocrConfidence !== 'number' || !Number.isFinite(raw.ocrConfidence) || raw.ocrConfidence < 0 || raw.ocrConfidence > 100)) throw new Error('辨識信心分數必須介於 0 與 100。');
      const fallback = validDate(input.exportedAt) ? input.exportedAt : '1970-01-01T00:00:00.000Z';
      const createdAt = string('createdAt', 50, fallback), updatedAt = string('updatedAt', 50, createdAt);
      const deletedAt = raw.deletedAt == null ? null : string('deletedAt', 50);
      if (version === 2 && (!validDate(createdAt) || !validDate(updatedAt) || (deletedAt !== null && !validDate(deletedAt)))) throw new Error('新增／更新／刪除時間無效。');
      const grade = string('grade', 100, '待確認'), productLine = string('productLine', 30).trim().toUpperCase();
      if (!GRADES.includes(grade) || (productLine && !PRODUCT_LINES[productLine])) throw new Error('規格或商品線無效。');
      const status = string('status', 20, 'ready');
      if (!['ready', 'error', 'processing'].includes(status)) throw new Error('辨識狀態無效。');
      const row = { id, name: string('name', 200), series: string('series', 100, '待確認'), grade, productLine,
        scale: string('scale', 100), price: price === '' ? '' : Number(price), location: string('location', 200), image,
        evidence: string('evidence', 200000), ocrEngine: string('ocrEngine', 200), ocrConfidence: raw.ocrConfidence ?? null, warnings: raw.warnings || [],
        fileName: string('fileName', 1000), hash: hash.toLowerCase(), confirmed: version === 2 && Boolean(raw.confirmed),
        status: status === 'processing' ? 'error' : status, error: status === 'processing' ? '備份中的辨識未完成，可重試。' : string('error', 1000),
        createdAt: validDate(createdAt) ? createdAt : fallback, updatedAt: validDate(updatedAt) ? updatedAt : fallback, deletedAt: validDate(deletedAt) ? deletedAt : null };
      if (row.confirmed && !validRecord(row)) throw new Error('已確認紀錄缺少有效名稱／系列／規格，或商品線與規格不相容。');
      records.push(row);
    } catch (error) { errors.push({ index, message: `第 ${index + 1} 筆：${error.message}` }); }
  }
  return { version, exportedAt: input.exportedAt || null, total: input.records.length, records, errors };
}

export function planRestore(existing, backup, mode = 'full') {
  const byId = new Map(existing.map(row => [row.id, row]));
  const byHash = new Map();
  for (const row of existing) if (row.hash) byHash.set(row.hash, [...(byHash.get(row.hash) || []), row]);
  const items = backup.records.map((source, index) => {
    const incoming = { ...source, confirmed: mode === 'full' && backup.version === 2 && source.confirmed };
    const idMatch = byId.get(source.id), hashMatches = source.hash ? byHash.get(source.hash) || [] : [];
    const targets = [...new Map([...(idMatch ? [idMatch] : []), ...hashMatches].map(row => [row.id, row])).values()];
    const same = idMatch && recordContent(idMatch) === recordContent(incoming);
    return { key: String(index), incoming, targets, kind: same && targets.length === 1 ? 'same' : targets.length ? 'conflict' : 'new',
      reason: targets.length > 1 ? 'ID 與照片對應到多筆現有紀錄，請保留現有並先整理重複資料。' : idMatch ? '相同 ID 的內容或刪除狀態不同' : targets.length ? '相同照片、不同 ID' : '' };
  });
  return { items, counts: { new: items.filter(item => item.kind === 'new').length, same: items.filter(item => item.kind === 'same').length, conflict: items.filter(item => item.kind === 'conflict').length, invalid: backup.errors.length } };
}
export function mergeRestore(existing, plan, choices = []) {
  if (plan.counts.invalid) throw new Error('備份含無效內容，整份未套用。');
  const selected = new Set(choices), result = existing.slice(), replaced = new Set();
  for (const item of plan.items) {
    if (item.kind === 'same') continue;
    if (item.kind === 'new') result.push(item.incoming);
    else if (selected.has(item.key)) {
      if (item.targets.length !== 1) throw new Error('一筆備份對應多筆現有紀錄，無法直接覆蓋。');
      const target = item.targets[0];
      if (replaced.has(target.id)) throw new Error('多筆備份選擇覆蓋同一筆收藏，請保留其中一筆。');
      replaced.add(target.id);
      const index = result.findIndex(row => row.id === target.id);
      if (index < 0) throw new Error('現有資料已改變，請重新預覽。');
      result[index] = { ...item.incoming, id: target.id };
    }
  }
  return result;
}
