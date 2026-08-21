import { readFile } from 'node:fs/promises';

const tracePath = '.next/server/app/api/quote-imports/[id]/process/route.js.nft.json';
const trace = JSON.parse(await readFile(tracePath, 'utf8'));
const files = Array.isArray(trace.files) ? trace.files : [];

const hasCanvasPackage = files.some((file) => file.includes('node_modules/@napi-rs/canvas/'));
const hasCanvasBinary = files.some((file) => /node_modules\/@napi-rs\/canvas-[^/]+\/.+\.node$/.test(file));
const hasPdfWorker = files.some((file) => file.endsWith('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'));

if (!hasCanvasPackage || !hasCanvasBinary || !hasPdfWorker) {
  throw new Error('Quote-import runtime trace is missing PDF.js canvas or worker dependencies.');
}

console.log('Quote-import PDF runtime dependencies are present in the server trace.');
