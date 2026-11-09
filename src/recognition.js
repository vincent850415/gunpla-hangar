import { parseDetectedText, detectedNameCandidates } from './detected-text.mjs';
export { imageData } from './tesseract-recognition.js';

let enginePromise;
let ocrWorker;
async function engine() {
  if (!enginePromise) {
    enginePromise = import('@paddleocr/paddleocr-js').then(({ PaddleOCR }) => PaddleOCR.create({
      textDetectionModelName: 'PP-OCRv6_small_det',
      textRecognitionModelName: 'PP-OCRv6_medium_rec',
      textDetectionModelAsset: { url: new URL('/paddle/PP-OCRv6_small_det.tar', location.href).href },
      textRecognitionModelAsset: { url: new URL('/paddle/PP-OCRv6_medium_rec.tar', location.href).href },
      worker: { createWorker: () => {
        ocrWorker = new Worker('/paddle/worker.js', { type: 'module' });
        return ocrWorker;
      } },
      ortOptions: { backend: 'wasm', wasmPaths: {
        mjs: new URL('/paddle/runtime.js', location.href).href,
        wasm: new URL('/paddle/ort-wasm-simd-threaded.jsep.wasm', location.href).href,
      }, numThreads: 1 },
    }));
  }
  return enginePromise;
}
function resetEngine() { ocrWorker?.terminate(); ocrWorker = null; enginePromise = null; }
async function timeout(promise, milliseconds) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('本機辨識逾時')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
function regionCanvas(image, bounds, factor = 2) {
  const left = Math.max(0, Math.floor(bounds.left)), top = Math.max(0, Math.floor(bounds.top));
  const width = Math.min(image.width - left, Math.ceil(bounds.width)), height = Math.min(image.height - top, Math.ceil(bounds.height));
  const scale = Math.min(factor, 2400 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, left, top, width, height, 0, 0, canvas.width, canvas.height);
  return canvas;
}
async function recognizeLocal(dataUrl, onProgress) {
  onProgress?.({ status: 'loading local models', progress: 0 });
  const ocr = await timeout(engine(), 90000);
  const blob = await (await fetch(dataUrl)).blob();
  const image = await createImageBitmap(blob);
  try {
    onProgress?.({ status: 'recognizing text', progress: .15 });
    const [full] = await timeout(ocr.predict(blob, { textDetLimitSideLen: 1280, textDetLimitType: 'max', textRecScoreThresh: .6 }), 120000);
    const passes = [{ ...full, label: '本機文字偵測與透視校正', kind: 'full' }];
    let result = parseDetectedText(passes);
    const title = detectedNameCandidates(full.items, full.image)[0];
    if (title && (title.score < .96 || /\bver\b/i.test(title.text))) {
      onProgress?.({ status: 'recognizing text', progress: .55 });
      const region = regionCanvas(image, { left: title.bounds.left - 12, top: title.bounds.top - 8, width: title.bounds.width + 24, height: title.bounds.height + 16 });
      const [reread] = await timeout(ocr.predict(region, { textDetLimitSideLen: 1600, textDetLimitType: 'max', textRecScoreThresh: .65 }), 60000);
      passes.push({ ...reread, label: '商品名稱區域複讀', kind: 'title' });
      result = parseDetectedText(passes);
    }
    if (result.grade === '待確認' || result.series === '待確認') {
      onProgress?.({ status: 'recognizing text', progress: .8 });
      const corner = regionCanvas(image, { left: 0, top: 0, width: image.width / 2, height: image.height / 2 }, 3);
      const [header] = await timeout(ocr.predict(corner, { textDetLimitSideLen: 1600, textDetLimitType: 'max', textRecScoreThresh: .65 }), 60000);
      passes.push({ ...header, label: '左上規格與系列標誌', kind: 'header' });
      result = parseDetectedText(passes);
    }
    if (Math.max(image.width, image.height) < 700) result.warnings.push('照片解析度較低，請核對小字與規格標誌');
    onProgress?.({ status: 'recognizing text', progress: 1 });
    return result;
  } finally { image.close(); }
}
export async function recognize(dataUrl, onProgress) {
  try { return await recognizeLocal(dataUrl, onProgress); }
  catch {
    resetEngine();
    const { recognizeTesseract } = await import('./tesseract-recognition.js');
    const result = await recognizeTesseract(dataUrl, onProgress);
    result.warnings.unshift('新的本機 OCR 引擎未能完成，已改用舊版 Tesseract；請核對辨識結果');
    result.ocrEngine = 'Tesseract (fallback)';
    return result;
  }
}
