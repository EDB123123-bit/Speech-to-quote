import type { InvoiceVatRate } from '@/lib/supabase/types';
import { deriveBelgianPeppolParticipantId, normalizeBelgianEnterpriseNumber, normalizeBelgianVatNumber } from './validation';

export const UNIT_CODES = {
  m2: 'MTK',
  hour: 'HUR',
  piece: 'C62',
  meter: 'MTR',
  kg: 'KGM',
} as const;

const UNIT_ALIASES: Record<string, string> = {
  m2: 'MTK',
  'm²': 'MTK',
  'm².': 'MTK',
  'm2.': 'MTK',
  uur: 'HUR',
  uren: 'HUR',
  hour: 'HUR',
  hours: 'HUR',
  stuk: 'C62',
  stuks: 'C62',
  'stuk(s)': 'C62',
  eenheid: 'C62',
  eenheden: 'C62',
  meter: 'MTR',
  meters: 'MTR',
  m: 'MTR',
  kg: 'KGM',
  kilogram: 'KGM',
  kilogrammen: 'KGM',
};

export function normalizeUnitCode(unit: string, existing?: string | null): string | null {
  const candidate = existing?.trim().toUpperCase();
  if (candidate && Object.values(UNIT_CODES).includes(candidate as never)) return candidate;
  return UNIT_ALIASES[unit.trim().toLowerCase()] ?? null;
}

export function vatLabel(rate: InvoiceVatRate): string {
  return rate === 0 ? '0%' : `${Math.round(rate * 100)}%`;
}

export const REDUCED_VAT_DECLARATION_NL =
  'Btw-tarief: Bij gebrek aan schriftelijke betwisting binnen een termijn van één maand vanaf de ontvangst van de factuur, wordt de klant geacht te erkennen dat: (1) de werken worden verricht aan een woning waarvan de eerste ingebruikneming heeft plaatsgevonden in een kalenderjaar dat ten minste tien jaar voorafgaat aan de datum van de eerste factuur met betrekking tot die werken, (2) de woning, na uitvoering van die werken, uitsluitend of hoofdzakelijk als privéwoning wordt gebruikt en (3) de werken worden verstrekt en gefactureerd aan een eindverbruiker. Wanneer minstens één van die voorwaarden niet is voldaan, zal het normale btw-tarief van 21% van toepassing zijn en is de afnemer ten aanzien van die voorwaarden aansprakelijk voor de betaling van de verschuldigde belasting, interesten en geldboeten.';
export const REDUCED_VAT_DECLARATION_VERSION = 'BE-6PC-2026-01';

export const REVERSE_CHARGE_NOTE_NL =
  'Verlegging van heffing. Bij werken in onroerende staat is de btw verschuldigd door de medecontractant overeenkomstig artikel 20 van koninklijk besluit nr. 1.';

export function normalizeBelgianVat(value: string | null | undefined): string | null {
  return normalizeBelgianVatNumber(value);
}

export function normalizeEnterpriseNumber(value: string | null | undefined): string | null {
  return normalizeBelgianEnterpriseNumber(value);
}

export function peppolParticipantId(enterpriseNumber: string | null | undefined): string | null {
  return deriveBelgianPeppolParticipantId(enterpriseNumber);
}

export function parseAddress(address: string | null | undefined): {
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
} {
  const raw = address?.trim() ?? '';
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const match = parts.at(-1)?.match(/^(\d{4})\s+(.+)$/u);
  if (match) {
    return {
      street: parts.slice(0, -1).join(', '),
      postalCode: match[1],
      city: match[2],
      countryCode: 'BE',
    };
  }
  return { street: raw, postalCode: '', city: '', countryCode: 'BE' };
}
