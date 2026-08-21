import { describe, expect, it } from 'vitest';
import { describeApprovalIssues, formatLineNumbersNl } from '../approval-errors';
import { ApprovableQuotePayloadSchema } from '../schema';

const line = (overrides: Record<string, unknown> = {}) => ({
  description: 'opstart werf', notes: null, quantity: 1, unit: 'stuk', unitCode: null,
  unitPriceCents: 7500, vatRate: 0.06, vatCategory: 'S', lineType: 'combined', ...overrides,
});

const payload = (lines: unknown[]) => ({
  customer: { name: 'anne bauwens', address: null, email: null, phone: null },
  quote: { number: 'O260194', issueDate: '2026-07-27', validUntil: '2026-08-26', orderReference: null },
  lines,
  sourceTotals: { subtotalCents: 440000, vatTotalCents: 26400, totalCents: 466400 },
  inferredPaths: [],
});

describe('formatLineNumbersNl', () => {
  it('reads naturally for one, two, and many lines', () => {
    expect(formatLineNumbersNl([2])).toBe('2');
    expect(formatLineNumbersNl([1, 2])).toBe('1 en 2');
    expect(formatLineNumbersNl([1, 2, 3, 4])).toBe('1, 2, 3 en 4');
  });

  it('sorts and de-duplicates line numbers', () => {
    expect(formatLineNumbersNl([3, 1, 3, 2])).toBe('1, 2 en 3');
  });
});

describe('describeApprovalIssues', () => {
  it('explains the empty units that made the real import fail', () => {
    const parsed = ApprovableQuotePayloadSchema.safeParse(payload([
      line({ unit: '' }), line({ unit: '' }), line({ unit: '' }), line({ unit: '' }),
    ]));
    expect(parsed.success).toBe(false);
    expect(describeApprovalIssues(parsed.success ? [] : parsed.error.issues))
      .toBe('Vul de eenheid in bij lijn 1, 2, 3 en 4 (bijvoorbeeld stuk, m² of uur).');
  });

  it('groups one sentence per field across the lines involved', () => {
    const message = describeApprovalIssues([
      { path: ['lines', 0, 'unit'], message: 'Too small' },
      { path: ['lines', 2, 'unit'], message: 'Too small' },
      { path: ['lines', 1, 'description'], message: 'Too small' },
    ]);
    expect(message).toContain('Vul de eenheid in bij lijn 1 en 3');
    expect(message).toContain('Vul de omschrijving in bij lijn 2.');
  });

  it('surfaces the vat rule the schema enforces', () => {
    const parsed = ApprovableQuotePayloadSchema.safeParse(payload([line({ vatCategory: 'AE', vatRate: 0.21 })]));
    expect(describeApprovalIssues(parsed.success ? [] : parsed.error.issues))
      .toBe('Controleer de btw bij lijn 1.');
  });

  it('passes through issues that are not line-anchored', () => {
    expect(describeApprovalIssues([{ path: ['lines'], message: 'Er is minstens één offertelijn nodig.' }]))
      .toBe('Er is minstens één offertelijn nodig.');
  });

  it('never returns an empty string', () => {
    expect(describeApprovalIssues([])).toBe('Controleer de offertelijnen en probeer opnieuw.');
  });

  it('accepts a payload whose lines all carry a unit', () => {
    expect(ApprovableQuotePayloadSchema.safeParse(payload([line(), line({ unit: 'm²' })])).success).toBe(true);
  });
});
