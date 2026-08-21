export type ApprovalIssue = { path: PropertyKey[]; message: string };

const LINE_FIELD_MESSAGES_NL: Record<string, (lines: string) => string> = {
  unit: (lines) => `Vul de eenheid in bij lijn ${lines} (bijvoorbeeld stuk, m² of uur).`,
  description: (lines) => `Vul de omschrijving in bij lijn ${lines}.`,
  quantity: (lines) => `Vul een geldig aantal in bij lijn ${lines}.`,
  unitPriceCents: (lines) => `Vul een geldige prijs in bij lijn ${lines}.`,
  vatRate: (lines) => `Controleer de btw bij lijn ${lines}.`,
  vatCategory: (lines) => `Controleer de btw bij lijn ${lines}.`,
};

/** Renders "1", "1 en 2", "1, 2 en 3" the way the rest of the Dutch copy reads. */
export function formatLineNumbersNl(numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((left, right) => left - right);
  if (sorted.length <= 1) return String(sorted[0] ?? '');
  return `${sorted.slice(0, -1).join(', ')} en ${sorted.at(-1)}`;
}

/**
 * Turns the approval schema's Zod issues into one Dutch sentence per field, naming
 * the lines involved. Server Action throws are masked in production, so an expected
 * validation failure has to travel back as a returned message instead.
 */
export function describeApprovalIssues(issues: ApprovalIssue[]): string {
  const linesByField = new Map<string, number[]>();
  const other: string[] = [];

  for (const issue of issues) {
    const [root, index, field] = issue.path;
    if (root === 'lines' && typeof index === 'number' && typeof field === 'string') {
      linesByField.set(field, [...(linesByField.get(field) ?? []), index + 1]);
    } else if (issue.message) {
      other.push(issue.message);
    }
  }

  const sentences = [...linesByField.entries()].map(([field, lines]) => {
    const formatted = formatLineNumbersNl(lines);
    const template = LINE_FIELD_MESSAGES_NL[field];
    return template ? template(formatted) : `Controleer ${field} bij lijn ${formatted}.`;
  });

  const all = [...sentences, ...new Set(other)];
  return all.length > 0 ? all.join(' ') : 'Controleer de offertelijnen en probeer opnieuw.';
}
