import { parseRecognition, GRADES } from './catalog.mjs';
import { PRODUCT_LINES } from './product-lines.mjs';

const captions = /BANDAI|BANDWI|GUNPLA|EXPO|MADE\s*IN|MOBILE\s*SUIT|SIMULATOR|PROTOTYPE|PRODUCTION|COPYRIGHT|UNIVERSAL\s*CENTURY|BUILD\s*FI[GC]HTERS?|TOY\s*WORLD|REVIVE|HIGH\s*GRADE|REAL\s*GRADE|MASTER\s*GRADE|THE\s*0?8.*TEAM|MS小隊/i;
export function textBounds(item) {
  const xs = item.poly.map(point => point[0]), ys = item.poly.map(point => point[1]);
  return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
export function detectedNameCandidates(items, image) {
  return items.flatMap(item => {
    const text = item.text.trim();
    if (PRODUCT_LINES[text]) return [];
    if (item.score < .65 || text.length < 4 || text.length > 200 || captions.test(text) || /1\s*[/:]\s*\d+/.test(text) || GRADES.includes(text) || /^(BAN|DAI|GUNDAM)$/i.test(text)) return [];
    if (!/[A-Za-z]{3}/.test(text) || /^[\d\W]+$/.test(text)) return [];
    const bounds = textBounds(item);
    const lower = (bounds.top + bounds.height / 2) / image.height;
    const recognizable = /GUNDAM|[A-Z]{1,5}[- ]\d{2,}|[A-Z]{2,}[- ][A-Z]{2,}/i.test(text);
    if (!recognizable && (item.score < .9 || lower < .4)) return [];
    const rank = item.score * 3 + Math.min(5, bounds.height / image.height * 40) + (lower > .4 ? 3 : -4) + (recognizable ? 2 : 0);
    return [{ ...item, rank, bounds }];
  }).sort((a, b) => b.rank - a.rank);
}
function normalizeLabel(text) {
  return text.normalize('NFKC').replace(/[–—]/g, '-').replace(/BUILD\s*FICHTERS\b/gi, 'BUILD FIGHTERS');
}
export function parseDetectedText(passes) {
  const first = passes[0];
  const items = passes.flatMap(pass => pass.items.filter(item => item.score >= .65));
  const text = items.map(item => normalizeLabel(item.text)).join('\n');
  const gradeText = items.filter(item => item.score >= .8).map(item => normalizeLabel(item.text).replace(/(HG|RG|MG|PG|EG)(?=1\s*[/:])/g, '$1 ')).join('\n');
  const parsed = parseRecognition(text, { gradeText });
  const candidates = detectedNameCandidates(first.items, first.image);
  const primary = candidates[0];
  const titleReadings = primary ? [{ text: primary.text, score: primary.score }] : [];
  for (const pass of passes.filter(pass => pass.kind === 'title')) {
    const name = detectedNameCandidates(pass.items, pass.image)[0];
    if (name) titleReadings.push({ text: name.text, score: name.score });
  }
  titleReadings.sort((a, b) => b.score - a.score);
  const chosen = titleReadings[0];
  parsed.name = chosen?.text.replace(/([A-Za-z0-9ν])GUNDAM/g, '$1 GUNDAM').replace(/GUNDAM(?=[A-Z])/g, 'GUNDAM ').replace(/\s+/g, ' ').trim() || '';
  parsed.warnings = parsed.warnings.filter(warning => warning !== '未讀到商品名稱');
  if (!parsed.name) parsed.warnings.unshift('未讀到可靠商品名稱，請手動填寫');
  const readingsDiffer = new Set(titleReadings.map(reading => reading.text.replace(/[\s.]/g, '').toUpperCase())).size > 1;
  if (chosen && (chosen.score < .96 || readingsDiffer || /\bVER\b/i.test(chosen.text))) parsed.warnings.push('商品名稱或版本文字仍需逐字核對；可展開原始辨識文字比較不同讀取結果');
  if (/\bHi[- ]V\b/i.test(parsed.name)) parsed.warnings.push('Hi-V 中的 V 可能是希臘字母 ν，請對照盒面確認；未自動改寫名稱');
  if (items.some(item => /BUILD\s*FICHTERS\b/i.test(item.text))) parsed.warnings.push('系列標誌的 FICHTERS 已按常見 OCR 字形混淆整理為 FIGHTERS，請核對盒面');
  parsed.evidence = passes.map(pass => `【${pass.label}】\n${pass.items.map(item => `${(item.score * 100).toFixed(1)}%  ${item.text}`).join('\n')}`).join('\n\n');
  parsed.ocrConfidence = Math.round((chosen?.score || 0) * 100);
  parsed.ocrEngine = 'PaddleOCR PP-OCRv6 (local)';
  return parsed;
}
