import { describe, expect, it } from 'vitest';
import {
  groupQuoteImportIssues,
  inferredFieldLabelsByLine,
  parseLineIssuePath,
  quoteImportFieldLabel,
  type QuoteImportIssue,
} from '../issues';

const warning = (messageNl: string, path: string): QuoteImportIssue => ({
  code: 'line_unit', severity: 'warning', messageNl, path,
});

describe('parseLineIssuePath', () => {
  it('reads the index and field from a line path', () => {
    expect(parseLineIssuePath('lines.2.unit')).toEqual({ index: 2, field: 'unit' });
  });

  it('reads an index-only line path', () => {
    expect(parseLineIssuePath('lines.0')).toEqual({ index: 0, field: null });
  });

  it('rejects paths that are not line-anchored', () => {
    expect(parseLineIssuePath('lines')).toBeNull();
    expect(parseLineIssuePath('quote.issueDate')).toBeNull();
    expect(parseLineIssuePath('totals.vatTotalCents')).toBeNull();
    expect(parseLineIssuePath(undefined)).toBeNull();
  });
});

describe('quoteImportFieldLabel', () => {
  it('maps validator field names onto the labels shown in the form', () => {
    expect(quoteImportFieldLabel('unitPriceExclCents')).toBe('Prijs excl. btw');
    expect(quoteImportFieldLabel('vatRatePercent')).toBe('Btw');
    expect(quoteImportFieldLabel('description')).toBe('Omschrijving');
  });

  it('returns null for an unknown or absent field', () => {
    expect(quoteImportFieldLabel('somethingElse')).toBeNull();
    expect(quoteImportFieldLabel(null)).toBeNull();
  });
});

describe('groupQuoteImportIssues', () => {
  it('anchors line issues to their line and keeps the rest document level', () => {
    const grouped = groupQuoteImportIssues([
      warning('Bevestig de eenheid van deze offertelijn.', 'lines.0.unit'),
      warning('Controleer dit afgeleide veld.', 'lines.0.quantity'),
      warning('Bevestig de eenheid van deze offertelijn.', 'lines.1.unit'),
      { code: 'vat_mismatch', severity: 'error', messageNl: 'Het btw-totaal klopt niet.', path: 'totals.vatTotalCents' },
    ], 2);

    expect(grouped.document).toHaveLength(1);
    expect(grouped.byLine.get(0)).toHaveLength(2);
    expect(grouped.byLine.get(0)?.[0].fieldLabel).toBe('Eenheid');
    expect(grouped.byLine.get(0)?.[1].fieldLabel).toBe('Aantal');
    expect(grouped.byLine.get(1)).toHaveLength(1);
  });

  it('keeps a whole-set lines issue at document level', () => {
    const grouped = groupQuoteImportIssues([
      { code: 'no_lines', severity: 'error', messageNl: 'Er werden geen offertelijnen gevonden.', path: 'lines' },
    ], 0);
    expect(grouped.document).toHaveLength(1);
    expect(grouped.byLine.size).toBe(0);
  });

  it('falls back to document level when the line no longer exists', () => {
    const grouped = groupQuoteImportIssues([warning('Weesissue.', 'lines.7.unit')], 2);
    expect(grouped.document).toHaveLength(1);
    expect(grouped.byLine.size).toBe(0);
  });

  it('leaves the field label null when the field is unknown', () => {
    const grouped = groupQuoteImportIssues([warning('Iets anders.', 'lines.0.mystery')], 1);
    expect(grouped.byLine.get(0)?.[0].fieldLabel).toBeNull();
  });
});

describe('inferredFieldLabelsByLine', () => {
  it('collects distinct field labels per line', () => {
    const byLine = inferredFieldLabelsByLine(
      ['lines.0.unit', 'lines.0.unitCode', 'lines.0.quantity', 'lines.1.description'],
      2,
    );
    // unit and unitCode share the "Eenheid" label and must not be listed twice.
    expect(byLine.get(0)).toEqual(['Eenheid', 'Aantal']);
    expect(byLine.get(1)).toEqual(['Omschrijving']);
  });

  it('ignores paths outside the current lines', () => {
    expect(inferredFieldLabelsByLine(['lines.9.unit', 'quote.issueDate'], 2).size).toBe(0);
  });
});
