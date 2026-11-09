import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const target = path.resolve('public/ocr');
await fs.mkdir(target, { recursive: true });
const tessRoot = path.dirname(require.resolve('tesseract.js/package.json'));
const tessRequire = createRequire(path.join(tessRoot, 'package.json'));
const coreRoot = path.dirname(tessRequire.resolve('tesseract.js-core/package.json'));
await fs.copyFile(path.join(tessRoot, 'dist/worker.min.js'), path.join(target, 'worker.min.js'));
for (const name of await fs.readdir(coreRoot)) {
  if (/\.wasm(\.js)?$/.test(name)) await fs.copyFile(path.join(coreRoot, name), path.join(target, name));
}
const lang = path.join(target, 'eng.traineddata.gz');
try { await fs.access(lang); } catch {
  const response = await fetch('https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz');
  if (!response.ok) throw new Error(`OCR language download: ${response.status}`);
  await fs.writeFile(lang, Buffer.from(await response.arrayBuffer()));
}
console.log('Local OCR engine and English language data ready.');
