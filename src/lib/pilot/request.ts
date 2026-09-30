import { z } from 'zod';

export const PILOT_REGIONS = ['vlaanderen', 'nederland', 'elders'] as const;
export const PILOT_QUOTE_VOLUMES = ['minder-dan-10', '10-30', 'meer-dan-30'] as const;

export type PilotRegion = (typeof PILOT_REGIONS)[number];
export type PilotQuoteVolume = (typeof PILOT_QUOTE_VOLUMES)[number];
export type PilotField = 'name' | 'company' | 'phone' | 'email' | 'region' | 'quotesPerMonth' | 'note';

export type PilotRequest = {
  name: string;
  company: string | null;
  phone: string;
  email: string | null;
  region: PilotRegion;
  quotesPerMonth: PilotQuoteVolume | null;
  note: string | null;
  source: Record<string, string>;
};

export type PilotParseResult =
  | { ok: true; data: PilotRequest }
  | { ok: false; fieldErrors: Partial<Record<PilotField, string>> };

/** Campaign attribution the landing page may send along. Anything else is dropped. */
const SOURCE_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer'] as const;

export const REGION_LABELS: Record<PilotRegion, string> = {
  vlaanderen: 'Vlaanderen of Brussel',
  nederland: 'Nederland',
  elders: 'Elders',
};

export const VOLUME_LABELS: Record<PilotQuoteVolume, string> = {
  'minder-dan-10': 'minder dan 10 offertes per maand',
  '10-30': '10 tot 30 offertes per maand',
  'meer-dan-30': 'meer dan 30 offertes per maand',
};

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/** Belgian and Dutch numbers, mobile or landline, with or without country code. */
export function isPlausiblePhone(value: string): boolean {
  if (!/^\+?[\d\s().\/-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

export function parseSource(raw: string): Record<string, string> {
  if (!raw || raw.length > 4000) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const source: Record<string, string> = {};
  for (const key of SOURCE_KEYS) {
    const value = (parsed as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) source[key] = value.trim().slice(0, 300);
  }
  return source;
}

export function parsePilotRequest(form: FormData): PilotParseResult {
  const fieldErrors: Partial<Record<PilotField, string>> = {};

  const name = text(form, 'name');
  if (!name) fieldErrors.name = 'Vul je naam in.';
  else if (name.length > 120) fieldErrors.name = 'Je naam is te lang.';

  const company = text(form, 'company');
  if (company.length > 160) fieldErrors.company = 'De bedrijfsnaam is te lang.';

  const phone = text(form, 'phone');
  if (!phone) fieldErrors.phone = 'Vul een telefoonnummer in waarop we je kunnen bereiken.';
  else if (!isPlausiblePhone(phone)) fieldErrors.phone = 'Dit telefoonnummer klopt niet. Bijvoorbeeld 0470 12 34 56.';

  const email = text(form, 'email');
  if (email && (email.length > 254 || !z.email().safeParse(email).success)) {
    fieldErrors.email = 'Dit e-mailadres klopt niet.';
  }

  const region = z.enum(PILOT_REGIONS).safeParse(text(form, 'region'));
  if (!region.success) fieldErrors.region = 'Kies waar je vooral werkt.';

  const volumeInput = text(form, 'quotesPerMonth');
  const volume = z.enum(PILOT_QUOTE_VOLUMES).safeParse(volumeInput);
  if (volumeInput && !volume.success) fieldErrors.quotesPerMonth = 'Kies een van de opties.';

  const note = text(form, 'note');
  if (note.length > 1000) fieldErrors.note = 'Houd het kort, maximaal 1000 tekens.';

  if (Object.keys(fieldErrors).length > 0 || !region.success) return { ok: false, fieldErrors };

  return {
    ok: true,
    data: {
      name,
      company: company || null,
      phone,
      email: email ? email.toLowerCase() : null,
      region: region.data,
      quotesPerMonth: volume.success ? volume.data : null,
      note: note || null,
      source: parseSource(text(form, 'source')),
    },
  };
}

export function toPilotRow(request: PilotRequest) {
  return {
    name: request.name,
    company: request.company,
    phone: request.phone,
    email: request.email,
    region: request.region,
    quotes_per_month: request.quotesPerMonth,
    note: request.note,
    source: request.source,
  };
}

/** One-line summary for a chat webhook (Slack-compatible `text`). */
export function pilotNotificationText(request: PilotRequest): string {
  const who = request.company ? `${request.name} (${request.company})` : request.name;
  const details = [
    request.phone,
    request.email,
    REGION_LABELS[request.region],
    request.quotesPerMonth ? VOLUME_LABELS[request.quotesPerMonth] : null,
    request.source.utm_source ? `via ${request.source.utm_source}` : null,
  ].filter(Boolean);
  const note = request.note ? `\n> ${request.note}` : '';
  return `Nieuwe pilotaanvraag: ${who}\n${details.join(' | ')}${note}`;
}
