import { describe, expect, it } from 'vitest';
import { shouldEscalateQuoteExtraction, toReviewedQuotePayload, validateExtractedQuote } from '../validation';
import type { ExtractedQuoteDocument } from '../schema';

const observed = <T>(value: T) => ({ value, provenance: { state: 'observed' as const, pageNumber: 1, sourceText: String(value ?? '') } });
const party = { name: observed('Test BV'), address: observed('Teststraat 1'), street: observed('Teststraat 1'), postalCode: observed('1000'), city: observed('Brussel'), vatNumber: observed(null), enterpriseNumber: observed(null), email: observed(null), phone: observed(null), iban: observed(null) };

function fixture(): ExtractedQuoteDocument {
  return {
    documentType: 'quote' as const, language: 'nl' as const, currency: 'EUR', containsMultipleQuotes: false, containsDiscountOrAllowance: false,
    seller: party, customer: { ...party, name: observed('Klant') },
    quote: { number: observed('O-1'), issueDate: observed('2026-08-20'), validUntil: observed('2026-09-19'), orderReference: observed(null) },
    lines: [{ description: observed('Plaatsing'), notes: observed(null), quantity: observed(2), unit: observed('stuk'), unitCode: observed('C62'), unitPriceExclCents: observed(1000), vatRatePercent: observed(21), vatCategory: observed('S' as const), lineTotalExclCents: observed(2000) }],
    totals: { subtotalExclCents: observed(2000), vatTotalCents: observed(420), grandTotalCents: observed(2420), vatGroups: [{ vatRatePercent: 21, taxableAmountCents: 2000, vatAmountCents: 420 }] },
  };
}

describe('quote import validation', () => {
  it('accepts a balanced Belgian EUR quote', () => {
    const input = fixture();
    const result = validateExtractedQuote(input);
    expect(result.supported).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.calculatedTotals?.totalCents).toBe(2420);
    expect(shouldEscalateQuoteExtraction(input, result)).toBe(false);
  });

  it('always flags financial mismatches without silently changing the source', () => {
    const input = fixture();
    input.totals.grandTotalCents = observed(2500);
    const result = validateExtractedQuote(input);
    expect(result.supported).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain('grand_total_mismatch');
  });

  it('rejects unsupported discounts and multiple quotes', () => {
    const input = fixture();
    input.containsDiscountOrAllowance = true;
    input.containsMultipleQuotes = true;
    expect(validateExtractedQuote(input).supported).toBe(false);
  });

  it('keeps missing units editable for mandatory review', () => {
    const input = fixture();
    input.lines[0].unit = { value: null, provenance: { state: 'missing', pageNumber: null, sourceText: null } };
    const payload = toReviewedQuotePayload(input);
    expect(payload.lines[0].unit).toBe('');
    const validation = validateExtractedQuote(input);
    expect(validation.issues.map((issue) => issue.code)).toContain('line_unit');
    expect(shouldEscalateQuoteExtraction(input, validation)).toBe(true);
  });

  it('escalates inferred header fields even when totals balance', () => {
    const input = fixture();
    input.quote.number.provenance.state = 'inferred';
    const validation = validateExtractedQuote(input);
    expect(validation.issues).toEqual([]);
    expect(shouldEscalateQuoteExtraction(input, validation)).toBe(true);
  });

  it('flags calendar-invalid ISO-looking dates for review and escalation', () => {
    const input = fixture();
    input.quote.issueDate = observed('2026-02-30');
    const validation = validateExtractedQuote(input);
    expect(validation.issues.map((issue) => issue.code)).toContain('issue_date');
    expect(shouldEscalateQuoteExtraction(input, validation)).toBe(true);
  });
});
