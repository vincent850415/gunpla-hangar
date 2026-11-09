import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const target = path.resolve('public/paddle');
await fs.mkdir(target, {recursive:true});
const sdkDir = path.dirname(fileURLToPath(import.meta.resolve('@paddleocr/paddleocr-js')));
const workers = (await fs.readdir(path.join(sdkDir, 'assets'))).filter(name => /^worker-entry-.*\.js$/.test(name));
if (workers.length !== 1) throw new Error('Unexpected PaddleOCR worker package layout');
await fs.copyFile(path.join(sdkDir, 'assets', workers[0]), path.join(target, 'worker.js'));
const ortRoot = path.resolve(path.dirname(require.resolve('onnxruntime-web')), '..');
for (const name of await fs.readdir(path.join(ortRoot,'dist'))) {
 if (/^ort-wasm-simd-threaded\.jsep\.(wasm|mjs)$/.test(name)) await fs.copyFile(path.join(ortRoot,'dist',name),path.join(target,name.endsWith('.mjs') ? 'runtime.js' : name));
}
for (const model of ['PP-OCRv6_small_det','PP-OCRv6_medium_rec']) {
 const output=path.join(target,`${model}.tar`);
 try {await fs.access(output); console.log(`${model}: exists`);continue;} catch {}
 const url=`https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/${model}_onnx_infer.tar`;
 const response=await fetch(url);if(!response.ok)throw new Error(`Model download ${response.status}: ${model}`);
 const data=Buffer.from(await response.arrayBuffer());
 await fs.writeFile(output,data);console.log(`${model}: ${data.length} bytes`);
}
