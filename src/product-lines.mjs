// Product-line branding is separate from the fictional franchise and grade.
export const PRODUCT_LINES = {
  HGUC: 'UC 宇宙世紀', HGBF: '鋼彈創鬥者', HGCE: 'SEED',
  HGAC: 'W', HGFC: 'G 鋼彈', HGAW: '鋼彈 X', HGCC: '∀ 鋼彈',
  HGBD: '鋼彈創形者', 'HGBD:R': '鋼彈創形者', HGIBO: '鐵血孤兒',
};
const codePattern = /\bHG(?:BD:R|UC|BF|CE|AC|FC|AW|CC|BD|IBO)\b/g;
export function detectProductLine(text, grade) {
  const clean = text.normalize('NFKC');
  const found = new Set(clean.match(codePattern) || []);
  // Require packaging words, never infer HGUC from a character/model name.
  if (grade === 'HG') {
    if (/UNIVERSAL\s*CENTURY/i.test(clean)) found.add('HGUC');
    if (/BUILD\s*FIGHTERS?\b/i.test(clean)) found.add('HGBF');
  }
  if (found.size > 1) return { productLine: '', warnings: ['商品線簡寫線索衝突，請依盒面填寫'] };
  if (found.size && grade !== 'HG') return { productLine: '', warnings: ['商品線簡寫與規格不符，請依盒面確認'] };
  return { productLine: [...found][0] || '', warnings: [] };
}
export function seriesLabel(record) {
  const series = record.series?.trim() || '待確認';
  const code = record.productLine?.trim();
  if (!code || series === '待確認') return series;
  const name = series === 'UC 宇宙世紀' ? '宇宙世紀' : series;
  return `${code} ${name}`;
}
export function parseSeriesLabel(value) {
  const text = value.trim();
  const match = text.match(/^(HG(?:BD:R|UC|BF|CE|AC|FC|AW|CC|BD|IBO))(?:\s+(.+))?$/i);
  if (!match) return { series: text || '待確認', productLine: '' };
  const productLine = match[1].toUpperCase();
  let series = match[2]?.trim() || PRODUCT_LINES[productLine];
  if (series === '宇宙世紀') series = 'UC 宇宙世紀';
  return { series, productLine };
}
