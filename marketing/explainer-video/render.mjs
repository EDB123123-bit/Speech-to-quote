// Renders the explainer from one bundle.
//
//   node render.mjs stills 16x9 40,600,1350   review frames into out/stills
//   node render.mjs og                        only the 1200x630 social image
//   node render.mjs posters                   only the two poster images
//   node render.mjs all                       both videos, posters and the social image
//
// Finished files are copied to ../../public/marketing for the landing page.
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
const publicDir = path.join(here, '..', '..', 'public', 'marketing');
const [mode = 'all', format = '16x9', frameList = ''] = process.argv.slice(2);

mkdirSync(path.join(out, 'stills'), { recursive: true });

console.log('Bundling…');
const serveUrl = await bundle({ entryPoint: path.join(here, 'src', 'index.ts') });

async function composition(id) {
  return selectComposition({ serveUrl, id, timeoutInMilliseconds: 120_000 });
}

async function still(id, frame, output) {
  const comp = await composition(id);
  await renderStill({ serveUrl, composition: comp, frame, output, timeoutInMilliseconds: 120_000 });
  console.log(`still ${id} @${frame} -> ${path.relative(here, output)}`);
}

if (mode === 'og') {
  const og = path.join(out, 'og.png');
  await still('OgImage', 0, og);
  copyFileSync(og, path.join(publicDir, 'og.png'));
  process.exit(0);
}

if (mode === 'stills') {
  const id = format === '9x16' ? 'Uitleg9x16' : 'Uitleg16x9';
  for (const frame of frameList.split(',').map(Number).filter((n) => Number.isFinite(n))) {
    await still(id, frame, path.join(out, 'stills', `${format}-${frame}.png`));
  }
  process.exit(0);
}

// The opening question: it invites a play and does not repeat the hero.
const POSTER_FRAME = 50;

async function poster(id, name) {
  const posterPng = path.join(out, `poster-${name}.png`);
  await still(id, POSTER_FRAME, posterPng);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', posterPng, '-q:v', '3', path.join(publicDir, `werkoffertes-uitleg-${name}.jpg`)]);
}

if (mode === 'posters') {
  await poster('Uitleg16x9', '16x9');
  await poster('Uitleg9x16', '9x16');
  process.exit(0);
}

for (const [id, name] of [['Uitleg16x9', '16x9'], ['Uitleg9x16', '9x16']]) {
  const comp = await composition(id);
  const raw = path.join(out, `raw-${name}.mp4`);
  let last = -1;
  await renderMedia({
    serveUrl,
    composition: comp,
    codec: 'h264',
    crf: 24,
    muted: true,
    outputLocation: raw,
    timeoutInMilliseconds: 120_000,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== last) { last = pct; console.log(`${id}: ${pct}%`); }
    },
  });

  // Web delivery: move the index to the front so playback starts while downloading.
  const video = path.join(out, `werkoffertes-uitleg-${name}.mp4`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-c', 'copy', '-movflags', '+faststart', video]);
  copyFileSync(video, path.join(publicDir, `werkoffertes-uitleg-${name}.mp4`));
  await poster(id, name);
}

const og = path.join(out, 'og.png');
await still('OgImage', 0, og);
copyFileSync(og, path.join(publicDir, 'og.png'));
console.log('Done.');
