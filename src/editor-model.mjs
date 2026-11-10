import { validRecord } from './catalog.mjs';
import { parseSeriesLabel, seriesLabel } from './product-lines.mjs';

export const asDraft = record => ({ ...record, series: seriesLabel(record) });
export function draftSignature(draft) {
  return JSON.stringify(['name', 'series', 'grade', 'scale', 'price', 'location', 'confirmed', 'evidence', 'warnings', 'ocrEngine', 'ocrConfidence'].map(key =>
    key === 'price' ? (draft.price === '' || draft.price == null ? '' : String(draft.price)) : draft[key] ?? ''));
}
export function validateDraft(draft, confirm) {
  const normalized = { ...draft, name: draft.name.trim(), ...parseSeriesLabel(draft.series) };
  if (draft.price !== '' && (!Number.isFinite(Number(draft.price)) || Number(draft.price) < 0)) return { field: 'price', message: '價格請填入零或正數，或保留空白。' };
  if (confirm && !validRecord(normalized)) {
    const field = !normalized.name ? 'name' : normalized.series === '待確認' ? 'series' : 'grade';
    return { field, message: '請填寫商品名稱，並確認作品系列與規格；HGUC 等 HG 商品線須搭配 HG 規格。' };
  }
  return { record: { ...normalized, confirmed: confirm, status: 'ready', error: '' } };
}
export const comparisonFields = [ ['name', '商品名稱'], ['series', '系列／商品線'], ['grade', '規格'], ['scale', '比例'] ];
export function applyRecognition(draft, result, keys) {
  if (!keys.length) return draft;
  const candidate = asDraft(result), next = { ...draft };
  for (const key of keys) if (comparisonFields.some(([field]) => field === key)) next[key] = candidate[key] || '';
  // Evidence always belongs to the candidate, including on partial adoption.
  // Explicitly disclose that retained fields may disagree with this evidence.
  return { ...next, confirmed: false, evidence: result.evidence || '', ocrEngine: result.ocrEngine || '', ocrConfidence: result.ocrConfidence ?? null,
    warnings: [...(result.warnings || []), ...(keys.length < comparisonFields.length ? ['部分欄位保留原值；下方辨識證據來自新一輪結果，請逐欄核對。'] : [])] };
}
export const confirmationIds = visible => visible.filter(r => !r.confirmed && !r.deletedAt && r.status !== 'processing').map(r => r.id);
export function confirmationSummary(ids, records) {
  const rows = new Map(records.filter(r => !r.deletedAt).map(r => [r.id, r]));
  const available = ids.filter(id => rows.has(id));
  const confirmed = available.filter(id => rows.get(id).confirmed).length;
  return { confirmed, pending: available.length - confirmed, removed: ids.length - available.length };
}
export function queueTarget(ids, index, direction, records) {
  const available = new Set(records.filter(r => !r.deletedAt && r.status !== 'processing').map(r => r.id));
  for (let cursor = index + direction; cursor >= 0 && cursor < ids.length; cursor += direction) if (available.has(ids[cursor])) return cursor;
  return -1;
}
