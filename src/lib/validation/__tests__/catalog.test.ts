import { describe, it, expect } from 'vitest';
import { parseEurosToCents, validateCatalogInput } from '@/lib/validation/catalog';

describe('parseEurosToCents', () => {
  it('parses a whole-euro amount', () => {
    expect(parseEurosToCents('45')).toBe(4500);
  });

  it('parses a comma decimal separator (Belgian convention)', () => {
    expect(parseEurosToCents('45,50')).toBe(4550);
  });

  it('parses a dot decimal separator', () => {
    expect(parseEurosToCents('45.50')).toBe(4550);
  });

  it('parses zero', () => {
    expect(parseEurosToCents('0')).toBe(0);
  });

  it('rounds to the nearest cent', () => {
    expect(parseEurosToCents('45,555')).toBe(4556);
  });

  it('rejects a non-numeric value', () => {
    expect(() => parseEurosToCents('abc')).toThrow('Ongeldig bedrag');
  });

  it('rejects an empty value', () => {
    expect(() => parseEurosToCents('')).toThrow('Ongeldig bedrag');
  });

  it('rejects a negative amount', () => {
    expect(() => parseEurosToCents('-5')).toThrow('Bedrag mag niet negatief zijn');
  });
});

describe('validateCatalogInput', () => {
  const valid = {
    name: 'Dakpannen leggen',
    unit: 'm²',
    materials_price: '30',
    labor_price: '15',
    vat_rate: '0.06',
  };

  it('accepts a complete item', () => {
    expect(validateCatalogInput(valid)).toEqual({
      name: 'Dakpannen leggen',
      unit: 'm²',
      materials_price_cents: 3000,
      labor_price_cents: 1500,
      vat_rate: 0.06,
    });
  });

  it('accepts the 21% rate', () => {
    expect(validateCatalogInput({ ...valid, vat_rate: '0.21' }).vat_rate).toBe(0.21);
  });

  it('rejects a missing name', () => {
    expect(() => validateCatalogInput({ ...valid, name: '  ' })).toThrow('Naam is verplicht');
  });

  it('rejects a missing unit', () => {
    expect(() => validateCatalogInput({ ...valid, unit: '' })).toThrow('Eenheid is verplicht');
  });

  it('rejects a missing VAT rate — it is never defaulted', () => {
    expect(() => validateCatalogInput({ ...valid, vat_rate: '' })).toThrow('Kies een btw-tarief');
  });

  it('rejects an illegal VAT rate', () => {
    expect(() => validateCatalogInput({ ...valid, vat_rate: '0.12' })).toThrow('Kies een btw-tarief');
  });
});
