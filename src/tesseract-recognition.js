import { createWorker, PSM } from 'tesseract.js';
import { parseRecognition } from './catalog.mjs';
let worker;
let progressHandler;
export async function getWorker(onProgress) {
  progressHandler = onProgress;
  if (!worker) {
    try {
      worker = await createWorker('eng', 1, {
        workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr',
        logger: message => progressHandler?.(message),
      });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    } catch (error) { worker = null; throw error; }
  }
  return worker;
}
export async function imageData(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    if (!img.width || !img.height) throw new Error('圖片無法讀取');
    const ratio = Math.min(1, 2200 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .9);
  } finally { URL.revokeObjectURL(url); }
}
function canvasRegion(img, region, targetWidth, grayscale = false, quality = 'low') {
  const canvas = document.createElement('canvas');
  const [left, top, width, height] = region;
  canvas.width = Math.round(targetWidth);
  canvas.height = Math.max(1, Math.round(height * targetWidth / width));
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = quality;
  if (grayscale) context.filter = 'grayscale(1) contrast(1.2)';
  context.drawImage(img, left, top, width, height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
export async function recognizeTesseract(dataUrl, onProgress) {
  const engine = await getWorker(onProgress);
  const img = new Image(); img.src = dataUrl; await img.decode();
  const full = await engine.recognize(dataUrl);
  // Box fronts commonly have a small scale/model label in the lower half.
  const y = Math.floor(img.height * .64);
  const bottom = await engine.recognize(canvasRegion(img, [0, y, img.width, img.height - y], Math.min(img.width * 2, 3200)));
  const passes = [{ label: '原圖', text: full.data.text, priority: 0 }, { label: '下方名稱與標籤', text: bottom.data.text, priority: 3 }];
  const parse = () => parseRecognition(passes.map(pass => pass.text).join('\n'), { nameSources: passes, gradeText: passes.filter(pass => !pass.skipGrade).map(pass => pass.text).join('\n') });
  let result = parse();
  // Extra passes only for incomplete recognition. Never substitute a model's
  // usual grade or scale for actual box evidence.
  if (!result.name || !result.scale || result.grade === '待確認' || result.series === '待確認') {
    onProgress?.({ status: 'enhancing image', progress: 0 });
    const enlarged = await engine.recognize(canvasRegion(img, [0, 0, img.width, img.height], Math.min(img.width * 3, 3200), false, 'high'));
    passes.push({ label: '放大原圖', text: enlarged.data.text, priority: 1, skipGrade: true });
    result = parse();
    if (result.grade === '待確認' || result.series === '待確認') {
      const corner = await engine.recognize(canvasRegion(img, [0, 0, Math.ceil(img.width / 2), Math.ceil(img.height / 2)], Math.min(img.width * 2, 1800), true, 'high'));
      passes.push({ label: '左上規格與系列', text: corner.data.text, priority: -5 });
      result = parse();
    }
  }
  if (img.width < 800 || img.height < 500) result.warnings.unshift('照片解析度較低，小字與描邊標誌可能讀不清；建議使用原始大圖或近拍標籤');
  return { ...result, evidence: passes.map(pass => `【${pass.label}】\n${pass.text}`).join('\n'), ocrConfidence: Math.round(full.data.confidence) };
}
