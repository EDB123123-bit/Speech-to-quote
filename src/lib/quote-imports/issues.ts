export type QuoteImportIssue = {
  code: string;
  severity: string;
  messageNl: string;
  path?: string;
};

export type LineIssue = QuoteImportIssue & { fieldLabel: string | null };

export type GroupedQuoteImportIssues = {
  /** Issues that describe the document as a whole, or whose line could not be resolved. */
  document: QuoteImportIssue[];
  /** Issues anchored to a specific offer line, keyed by its zero-based index. */
  byLine: Map<number, LineIssue[]>;
};

const FIELD_LABELS_NL: Record<string, string> = {
  description: 'Omschrijving',
  notes: 'Bronnotitie',
  quantity: 'Aantal',
  unit: 'Eenheid',
  unitCode: 'Eenheid',
  unitPriceExclCents: 'Prijs excl. btw',
  unitPriceCents: 'Prijs excl. btw',
  vatRatePercent: 'Btw',
  vatCategory: 'Btw',
  lineTotalExclCents: 'Lijntotaal',
};

/**
 * Reads the `lines.{index}.{field}` paths the validator emits. A bare `lines`
 * path describes the whole set rather than one row, so it stays document level.
 */
export function parseLineIssuePath(path: string | undefined): { index: number; field: string | null } | null {
  if (!path) return null;
  const match = /^lines\.(\d+)(?:\.([A-Za-z]+))?$/u.exec(path);
  if (!match) return null;
  return { index: Number(match[1]), field: match[2] ?? null };
}

export function quoteImportFieldLabel(field: string | null): string | null {
  if (!field) return null;
  return FIELD_LABELS_NL[field] ?? null;
}

/**
 * Splits validation issues into document-level and per-line buckets so the
 * reviewer sees each warning next to the line it actually concerns.
 */
export function groupQuoteImportIssues(
  issues: QuoteImportIssue[],
  lineCount: number,
): GroupedQuoteImportIssues {
  const document: QuoteImportIssue[] = [];
  const byLine = new Map<number, LineIssue[]>();

  for (const issue of issues) {
    const parsed = parseLineIssuePath(issue.path);
    if (!parsed || parsed.index >= lineCount) {
      document.push(issue);
      continue;
    }
    const existing = byLine.get(parsed.index) ?? [];
    existing.push({ ...issue, fieldLabel: quoteImportFieldLabel(parsed.field) });
    byLine.set(parsed.index, existing);
  }

  return { document, byLine };
}

/** Inferred-field paths share the line path shape but carry no message of their own. */
export function inferredFieldLabelsByLine(inferredPaths: string[], lineCount: number): Map<number, string[]> {
  const byLine = new Map<number, string[]>();
  for (const path of inferredPaths) {
    const parsed = parseLineIssuePath(path);
    if (!parsed || parsed.index >= lineCount) continue;
    const label = quoteImportFieldLabel(parsed.field);
    if (!label) continue;
    const existing = byLine.get(parsed.index) ?? [];
    if (!existing.includes(label)) existing.push(label);
    byLine.set(parsed.index, existing);
  }
  return byLine;
}
