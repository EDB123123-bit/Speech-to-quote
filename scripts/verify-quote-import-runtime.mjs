import { readFile } from 'node:fs/promises';

const tracePath = '.next/server/app/api/quote-imports/[id]/process/route.js.nft.json';
const trace = JSON.parse(await readFile(tracePath, 'utf8'));
const files = Array.isArray(trace.files) ? trace.files : [];

const hasCanvasPackage = files.some((file) => file.includes('node_modules/@napi-rs/canvas/'));
const hasCanvasBinary = files.some((file) => /node_modules\/@napi-rs\/canvas-[^/]+\/.+\.node$/.test(file));

if (!hasCanvasPackage || !hasCanvasBinary) {
  throw new Error('Quote-import runtime trace is missing @napi-rs/canvas or its native binary.');
}

console.log('Quote-import PDF runtime dependencies are present in the server trace.');
