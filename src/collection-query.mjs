import { PRODUCT_LINES, parseSeriesLabel, seriesLabel } from './product-lines.mjs';

export const defaultQuery = { search: '', grade: '', series: '', location: '', confirmation: '', sort: 'newest' };
export const activeRecords = records => records.filter(row => !row.deletedAt);
const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const textOrder = (a, b) => String(a).localeCompare(String(b), 'zh-Hant');
export function queryCollection(records, query = defaultQuery) {
  const q = { ...defaultQuery, ...query };
  const blankPrice = row => row.price === '' || row.price == null;
  const stable = (a, b) => time(b.createdAt) - time(a.createdAt) || textOrder(a.id, b.id);
  return activeRecords(records).filter(row =>
    (!q.grade || row.grade === q.grade) && (!q.series || seriesLabel(row) === q.series) &&
    (!q.location || (q.location === '__empty__' ? !row.location?.trim() : row.location?.trim() === (q.location.startsWith('value:') ? q.location.slice(6) : q.location))) &&
    (!q.confirmation || Boolean(row.confirmed) === (q.confirmation === 'confirmed')) &&
    `${row.name} ${seriesLabel(row)} ${row.location || ''} ${row.grade} ${row.scale || ''}`.toLowerCase().includes(q.search.trim().toLowerCase())
  ).sort((a, b) => {
    let order = 0;
    if (q.sort.startsWith('price')) order = Number(blankPrice(a)) - Number(blankPrice(b)) || (blankPrice(a) ? 0 : (Number(a.price) - Number(b.price)) * (q.sort === 'price-desc' ? -1 : 1));
    else if (q.sort === 'name') order = textOrder(a.name, b.name);
    else if (q.sort === 'oldest') order = time(a.createdAt) - time(b.createdAt);
    else order = time(b.createdAt) - time(a.createdAt);
    return order || stable(a, b);
  });
}
export const hasFilters = query => ['search', 'grade', 'series', 'location', 'confirmation'].some(key => Boolean(query[key]));
export function locationSuggestions(records) {
  return [...new Set(activeRecords(records).slice().sort((a, b) => time(b.updatedAt || b.createdAt) - time(a.updatedAt || a.createdAt) || textOrder(a.id, b.id)).map(row => row.location?.trim()).filter(Boolean))];
}
export function planBatch(records, ids, changes) {
  const selected = new Set(ids), errors = [], preview = [];
  const next = records.map(row => {
    if (!selected.has(row.id) || row.deletedAt) return row;
    let updated = { ...row };
    if (changes.locationMode === 'set') updated.location = changes.location.trim();
    if (changes.locationMode === 'clear') updated.location = '';
    if (changes.seriesMode === 'set') {
      updated = { ...updated, ...parseSeriesLabel(changes.series) };
      if (!changes.series.trim() || updated.series === '待確認') errors.push(`${row.name || '未命名商品'}：請指定作品系列。`);
      else if (PRODUCT_LINES[updated.productLine] && updated.grade !== 'HG') errors.push(`${row.name || '未命名商品'}：${updated.grade} 與 ${changes.series} 不相容。`);
      if (updated.series !== row.series || updated.productLine !== (row.productLine || '')) updated.confirmed = false;
    }
    preview.push({ id: row.id, name: row.name || '未命名商品', before: row, after: updated });
    return updated;
  });
  if (changes.locationMode === 'set' && !changes.location.trim()) errors.push('設定位置請填寫名稱；要移除位置請選「清空位置」。');
  if ((changes.location || '').length > 200 || (changes.series || '').length > 100) errors.push('位置或系列名稱超過允許長度。');
  return { records: errors.length ? records : next, errors, preview };
}
export function exportPreview(records) {
  const available = activeRecords(records), included = available.filter(row => row.confirmed);
  const groups = new Map();
  for (const row of included) groups.set(seriesLabel(row), (groups.get(seriesLabel(row)) || 0) + 1);
  return { records: structuredClone(included), excluded: available.length - included.length, groups: [...groups] };
}
