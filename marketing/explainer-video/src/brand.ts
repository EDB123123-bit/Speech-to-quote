import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

/** Same tokens as src/app/globals.css in the app, so the video looks like the product. */
export const C = {
  paper: '#fff6f1',
  paperStrong: '#f2e7df',
  surface: '#fffcfa',
  ink: '#14120f',
  body: '#423e38',
  muted: '#5c574f',
  subtle: '#8a837a',
  border: '#e8ddd4',
  fieldBorder: '#d9cfc6',
  accent: '#bcc9ff',
  accentInk: '#202a58',
  success: '#14452e',
  successBg: '#cfebda',
  warning: '#6b4a00',
  warningBg: '#ffe7a8',
  warningLine: '#e0a200',
  warningSurface: '#fffaf0',
  critical: '#a92f25',
  criticalBg: '#fde8e4',
  whatsapp: '#1a8d4a',
} as const;

/*
 * Figtree (OFL) ships with the project in public/fonts, copied from
 * @fontsource-variable/figtree, so rendering never depends on Google Fonts
 * being reachable. loadFont() holds every frame until the file is ready.
 */
export const fontFamily = 'Figtree, system-ui, sans-serif';

void loadFont({
  family: 'Figtree',
  url: staticFile('fonts/figtree-latin-wght-normal.woff2'),
  weight: '300 900',
  style: 'normal',
});

/** Mirrors formatEuros() in src/lib/money/totals.ts. */
export function formatEuros(cents: number): string {
  const formatted = new Intl.NumberFormat('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
  return `€ ${formatted}`;
}

export const SITE_LABEL = 'speech-to-quote-mu.vercel.app';
export const PHONE_LABEL = '+32 479 87 08 89';
