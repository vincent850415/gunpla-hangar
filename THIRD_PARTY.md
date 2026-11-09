# Bundled third-party components

Gunpla Hangar's Windows portable package includes these components:

- Node.js Windows x64 runtime, distributed with its complete license notices in `runtime/NODE-LICENSE.txt`: https://nodejs.org/
- PaddleOCR PP-OCRv6 models and JavaScript SDK (Apache-2.0): https://github.com/PaddlePaddle/PaddleOCR
- ONNX Runtime (MIT): https://github.com/microsoft/onnxruntime
- Tesseract.js and Tesseract OCR core (Apache-2.0): https://github.com/naptha/tesseract.js
- English trained data: https://github.com/naptha/tessdata
- Other JavaScript dependencies and exact versions are recorded in `package.json` and `pnpm-lock.yaml` in the source repository.

OCR assets are stored using Git LFS. `release-manifest.json` records the source commit, runtime version, and SHA-256 of each bundled OCR asset. The sample box photograph was supplied for this project's functionality tests.

The portable package includes collected dependency license and notice files in `THIRD-PARTY-LICENSES.txt`, in addition to the Node.js distribution license.
