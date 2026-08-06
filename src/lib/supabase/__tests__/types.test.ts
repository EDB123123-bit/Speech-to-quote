import { describe, it, expect } from 'vitest';
import { VAT_RATES, isVatRate } from '@/lib/supabase/types';

describe('VAT rate helpers', () => {
  it('exposes exactly the two legal Belgian rates for this app', () => {
    expect(VAT_RATES).toEqual([0.06, 0.21]);
  });

  it('accepts legal rates', () => {
    expect(isVatRate(0.06)).toBe(true);
    expect(isVatRate(0.21)).toBe(true);
  });

  it('rejects anything else, including null and 0', () => {
    expect(isVatRate(0)).toBe(false);
    expect(isVatRate(0.12)).toBe(false);
    expect(isVatRate(null)).toBe(false);
    expect(isVatRate(undefined)).toBe(false);
  });
});
