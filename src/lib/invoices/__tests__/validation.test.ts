import { describe, expect, it } from 'vitest';
import {
  deriveBelgianPeppolParticipantId,
  isValidBelgianEnterpriseNumber,
  isValidBelgianVatNumber,
  isValidIban,
  normalizeBelgianVatNumber,
} from '../validation';

describe('Belgian invoice identifiers', () => {
  it('validates KBO and matching VAT checksums', () => {
    expect(isValidBelgianEnterpriseNumber('0563.846.944')).toBe(true);
    expect(isValidBelgianEnterpriseNumber('0563.846.945')).toBe(false);
    expect(isValidBelgianVatNumber('BE 0563.846.944')).toBe(true);
    expect(normalizeBelgianVatNumber('0563846944')).toBe('BE0563846944');
  });

  it('derives the only supported Peppol endpoint scheme', () => {
    expect(deriveBelgianPeppolParticipantId('BE 0563.846.944')).toBe('0208:0563846944');
  });

  it('uses ISO 13616 modulo-97 for IBAN validation', () => {
    expect(isValidIban('BE68 5390 0754 7034')).toBe(true);
    expect(isValidIban('BE68 5390 0754 7035')).toBe(false);
  });
});
