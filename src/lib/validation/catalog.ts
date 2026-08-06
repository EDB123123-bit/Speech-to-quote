import { isVatRate, type VatRate } from '@/lib/supabase/types';

export type CatalogItemInput = {
  name: string;
  unit: string;
  materials_price_cents: number;
  labor_price_cents: number;
  vat_rate: VatRate;
};

export function parseEurosToCents(input: string): number {
  const normalised = (input ?? '').trim().replace(',', '.');
  if (normalised === '') throw new Error('Ongeldig bedrag');

  const value = Number(normalised);
  if (!Number.isFinite(value)) throw new Error('Ongeldig bedrag');
  if (value < 0) throw new Error('Bedrag mag niet negatief zijn');

  return Math.round(value * 100);
}

export function validateCatalogInput(raw: Record<string, string>): CatalogItemInput {
  const name = (raw.name ?? '').trim();
  if (!name) throw new Error('Naam is verplicht');

  const unit = (raw.unit ?? '').trim();
  if (!unit) throw new Error('Eenheid is verplicht');

  // Never defaulted — an unset or illegal rate is a hard error.
  const vatRate = Number(raw.vat_rate);
  if (!isVatRate(vatRate)) throw new Error('Kies een btw-tarief (6% of 21%)');

  return {
    name,
    unit,
    materials_price_cents: parseEurosToCents(raw.materials_price ?? ''),
    labor_price_cents: parseEurosToCents(raw.labor_price ?? ''),
    vat_rate: vatRate,
  };
}
