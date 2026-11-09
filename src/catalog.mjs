export const SERIES = ['UC 宇宙世紀', 'SEED', '水星的魔女', '00', '鐵血孤兒', 'W', 'G 鋼彈', '鋼彈 X', '∀ 鋼彈', 'AGE', '鋼彈創鬥者', '鋼彈創形者', 'SD 鋼彈', '其他', '待確認'];
import { detectProductLine, PRODUCT_LINES } from './product-lines.mjs';
export const GRADES = ['HG', 'RG', 'MG', 'MGEX', 'MGSD', 'PG', 'PG UNLEASHED', 'EG', 'SD', 'SDCS', 'SD EX-STANDARD', 'RE/100', 'FULL MECHANICS', 'MEGA SIZE', '其他', '待確認'];
// Conservative, editable hints. This is not a complete product database.
const products = [
  [/RX[\s-]*78[\s-]*2\b/i, 'RX-78-2 GUNDAM', 'UC 宇宙世紀'],
  [/GUNDAM\s+AERIAL|XVX[\s-]*016\b/i, null, '水星的魔女'],
  [/GUNDAM\s+CALIBARN|X[\s-]*EX01\b/i, null, '水星的魔女'],
  [/STRIKE\s+FREEDOM|RISING\s+FREEDOM|MIGHTY\s+STRIKE\s+FREEDOM|INFINITE\s+JUSTICE|ZGMF[\s-]/i, null, 'SEED'],
  [/GUNDAM\s+EXIA|GUNDAM\s+DYNAMES|GUNDAM\s+KYRIOS|GUNDAM\s+VIRTUE|00\s+RAISER/i, null, '00'],
  [/BARBATOS|GUNDAM\s+BAEL|GUNDAM\s+VIDAR/i, null, '鐵血孤兒'],
  [/WING\s+GUNDAM|GUNDAM\s+DEATHSCYTHE|TALLGEESE|SANDROCK|HEAVYARMS/i, null, 'W'],
];
const seriesPatterns = [
  [/THE\s+WITCH\s+FROM\s+MERCURY|水星の魔女|水星的魔女/i, '水星的魔女'],
  [/GUNDAM\s+SEED|鋼彈\s*SEED/i, 'SEED'],
  [/IRON[\s-]*BLOODED\s+ORPHANS|鐵血|鉄血/i, '鐵血孤兒'],
  [/GUNDAM\s+00|GUNDAM\s+DOUBLE\s+O/i, '00'],
  [/UNIVERSAL\s*CENTURY|\bHGUC\b|GUNDAM\s+UNICORN|GUNDAM\s+NT|HATHAWAY/i, 'UC 宇宙世紀'],
  [/BUILD\s*FIGHTERS?\b/i, '鋼彈創鬥者'], [/BUILD\s*DIVERS\b/i, '鋼彈創形者'],
  [/GUNDAM\s+AGE/i, 'AGE'], [/AFTER\s+COLONY|GUNDAM\s+WING/i, 'W'],
  [/FUTURE\s+CENTURY|MOBILE\s+FIGHTER\s+G/i, 'G 鋼彈'],
  [/AFTER\s+WAR|GUNDAM\s+X\b/i, '鋼彈 X'], [/TURN\s+A\s+GUNDAM/i, '∀ 鋼彈'],
];
// Score names independently of a product dictionary. Keep package captions out.
const caption = /BANDAI|MADE IN|PROTOTYPE|MOBILE\s+SUIT|SIMULATOR|BATTLE\s+SYSTEM|ANNIVERSARY|UNIVERSAL|HIGH\s+GRADE|REAL\s+GRADE|MASTER\s+GRADE|PLASTIC\s+MODEL|BUILD\s+(FIGHTERS|DIVERS)|GUNDAM\s+(SEED|WING|00)|WITCH\s+FROM|REVIVE|WARNING|COPYRIGHT|GUNPLA|PRODUCT|SCALE|FOR\s+AGES|YEARS\s+OLD/i;
function nameCandidate(raw, priority = 0) {
  const line = raw.trim().replace(/^[^A-Za-z0-9]+/, '').replace(/^(?:\d|[a-z]{1,2})\s+(?=[A-Z]{2,}[-\s])/, '').replace(/\s+[+~=]+$/, '').trim();
  if (line.length < 5 || line.length > 100 || caption.test(line) || /\b1\s*[/:]\s*\d+/.test(line)) return null;
  const known = /GUNDAM|ZAKU|GOUF|DOM\b|SAZABI|SINANJU|TALLGEESE|AERIAL|CALIBARN/i.test(line);
  const model = /[A-Z]{1,5}-?\d{2,4}/i.test(line);
  const generic = /^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$/.test(line) && (line.match(/[A-Z]/g)?.length || 0) >= 5 && /[AEIOU]/.test(line) && /[ -]/.test(line);
  if (!known && !model && !generic) return null;
  return { line, score: (known ? 6 : 0) + (model ? 5 : 0) + (generic ? 3 : 0) + priority };
}
export function parseRecognition(text, options = {}) {
  const clean = text.normalize('NFKC').replace(/[–—]/g, '-');
  const upper = clean.toUpperCase();
  // English OCR can join the Japanese product label to its final grade token.
  // Accept that suffix only on an explicit scale-label line, never inside arbitrary words.
  const gradeSource = options.gradeText ?? clean;
  const scaleLabelGrade = gradeSource.match(/^\s*1\s*[/:]\s*\d{2,3}\b[^\n]*?(HG|RG|MG|PG|EG)\s*$/m)?.[1];
  // Short grade logos must be uppercase. Random lowercase OCR fragments ("rg")
  // in box art are not evidence of a Real Grade model.
  const descriptors = gradeSource.match(/(?:HIGH|REAL|MASTER|PERFECT|ENTRY)\s+GRADE|FULL\s+MECHANICS|MEGA\s+SIZE|CROSS\s+SILHOUETTE|SUPER\s+DEFORMED/gi) || [];
  const gradeText = `${gradeSource}\n${descriptors.join('\n').toUpperCase()}\n${scaleLabelGrade || ''}`;
  const gradePatterns = [
    ['PG UNLEASHED', /\bPG\s+UNLEASHED\b/], ['MGEX', /\bMGEX\b/], ['MGSD', /\bMGSD\b/],
    ['SD EX-STANDARD', /\bSD\s+EX[\s-]*STANDARD\b/], ['SDCS', /\bSDCS\b|CROSS\s+SILHOUETTE/],
    ['FULL MECHANICS', /FULL\s+MECHANICS/], ['RE/100', /\bRE\s*\/\s*100\b/], ['MEGA SIZE', /MEGA\s+SIZE/],
    ['HG', /\bHG(?:UC|AC|CE|FC|AW|CC|IBO|BF|BD(?::R)?)?\b|HIGH\s+GRADE/], ['RG', /\bRG\b|REAL\s+GRADE/],
    ['MG', /\bMG\b|MASTER\s+GRADE/], ['PG', /\bPG\b|PERFECT\s+GRADE/], ['EG', /\bEG\b|ENTRY\s+GRADE/], ['SD', /\bSD\b|\bSDEX\b|SUPER\s+DEFORMED/],
  ];
  const grade = gradePatterns.find(([, re]) => re.test(gradeText))?.[0] || '待確認';
  const line = detectProductLine(gradeText, grade);
  const scales = [...new Set([...upper.matchAll(/(?<!\d)1\s*[/:]\s*(144|100|60|48|72|35|12|200|550)(?!\d)/g)].map(m => m[1]))];
  const scale = scales.length === 1 ? scales[0] : undefined;
  const matched = products.find(([re]) => re.test(clean));
  const seriesMatches = new Set(seriesPatterns.filter(([re]) => re.test(clean)).map(([, s]) => s));
  if (line.productLine) seriesMatches.add(PRODUCT_LINES[line.productLine]);
  if (matched) seriesMatches.add(matched[2]);
  const series = seriesMatches.size === 1 ? [...seriesMatches][0] : '待確認';
  const sources = options.nameSources || [{ text: clean, priority: 0 }];
  const candidates = sources.flatMap(source => source.text.split('\n').map(line => nameCandidate(line.normalize('NFKC').replace(/[–—]/g, '-'), source.priority))).filter(Boolean).sort((a, b) => b.score - a.score);
  const name = matched?.[1] || candidates[0]?.line || '';
  const warnings = [...line.warnings];
  if (!name) warnings.push('未讀到商品名稱');
  if (grade === '待確認') warnings.push('未讀到明確規格');
  if (series === '待確認') warnings.push(seriesMatches.size > 1 ? '作品線索衝突，請確認系列' : '作品系列尚待確認');
  if (!scale) warnings.push(scales.length > 1 ? '讀到多個比例，請以盒面確認' : '未讀到比例');
  // A missing slash could also be a price or model number. Suggest, never assign.
  const compactScale = !scale && scales.length === 0 ? upper.match(/^\s*1(144|100|60|48|72|35|12|200|550)\b[^\n]*$/m)?.[1] : undefined;
  if (compactScale) warnings.push(`讀到「1${compactScale}」，可能是 1/${compactScale}，請確認盒面後手動填寫`);
  return { name, grade, productLine: line.productLine, series, scale: scale ? `1/${scale}` : '', warnings, evidence: clean, price: '', location: '' };
}
export function validRecord(record) {
  if (PRODUCT_LINES[record.productLine] && record.grade !== 'HG') return false;
  return Boolean(record.name?.trim() && record.series?.trim() && record.series !== '待確認' && record.grade && record.grade !== '待確認'
    && (record.price === '' || record.price === null || record.price === undefined || (Number.isFinite(Number(record.price)) && Number(record.price) >= 0)));
}
