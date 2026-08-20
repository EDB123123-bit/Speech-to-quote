import { describe, expect, it } from 'vitest';
import { normalizeUnitCode } from '../constants';

describe('Peppol unit mapping', () => {
  it.each([
    ['m²', 'MTK'], ['uur', 'HUR'], ['stuk', 'C62'], ['meter', 'MTR'], ['kilogram', 'KGM'],
  ])('maps %s to %s', (unit, expected) => {
    expect(normalizeUnitCode(unit)).toBe(expected);
  });

  it('rejects unknown and forged unit codes', () => {
    expect(normalizeUnitCode('doos')).toBeNull();
    expect(normalizeUnitCode('stuk', 'BOX')).toBe('C62');
  });
});
