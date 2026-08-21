import { normalizeUnitCode } from '@/lib/invoices/constants';
import { isValidBelgianEnterpriseNumber, isValidBelgianVatNumber } from '@/lib/invoices/validation';
import { calculateTotals } from '@/lib/money/totals';
import type { QuoteVatRate } from '@/lib/supabase/types';
import {
  ExtractedQuoteDocumentSchema,
  ReviewedQuotePayloadSchema,
  type ExtractedQuoteDocument,
  type ReviewedQuotePayload,
} from './schema';

export type QuoteImportValidationIssue = {
  code: string;
  severity: 'error' | 'warning';
  messageNl: string;
  path: string;
};

export type QuoteImportValidation = {
  supported: boolean;
  requiresAcknowledgement: boolean;
  issues: QuoteImportValidationIssue[];
  calculatedTotals: { subtotalCents: number; vatTotalCents: number; totalCents: number } | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function isValidIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function add(
  issues: QuoteImportValidationIssue[],
  severity: QuoteImportValidationIssue['severity'],
  code: string,
  messageNl: string,
  path: string,
): void {
  issues.push({ severity, code, messageNl, path });
}

function centsMatch(left: number | null, right: number, tolerance = 1): boolean {
  return left === null || Math.abs(left - right) <= tolerance;
}

export function validateExtractedQuote(input: unknown): QuoteImportValidation {
  const parsed = ExtractedQuoteDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      supported: false,
      requiresAcknowledgement: false,
      issues: [{ code: 'schema', severity: 'error', messageNl: 'De extractie is onvolledig.', path: '$' }],
      calculatedTotals: null,
    };
  }

  const document = parsed.data;
  const issues: QuoteImportValidationIssue[] = [];
  if (document.documentType !== 'quote') add(issues, 'error', 'not_quote', 'Dit document is geen offerte.', 'documentType');
  if (!['nl', 'fr', 'mixed'].includes(document.language)) add(issues, 'error', 'language', 'Alleen Nederlandstalige en Franstalige offertes worden ondersteund.', 'language');
  if (document.currency.toUpperCase() !== 'EUR') add(issues, 'error', 'currency', 'Alleen euro-offertes worden ondersteund.', 'currency');
  if (document.containsMultipleQuotes) add(issues, 'error', 'multiple_quotes', 'Plaats elke offerte in een afzonderlijke pdf.', 'containsMultipleQuotes');
  if (document.containsDiscountOrAllowance) add(issues, 'error', 'discount', 'Kortingen en toeslagen worden nog niet ondersteund.', 'containsDiscountOrAllowance');
  if (document.lines.length === 0) add(issues, 'error', 'no_lines', 'Er werden geen offertelijnen gevonden.', 'lines');

  const totalsInput: { quantity: number; unitPriceCents: number; vatRate: QuoteVatRate }[] = [];
  for (const [index, line] of document.lines.entries()) {
    const path = `lines.${index}`;
    const description = line.description.value?.trim();
    const quantity = line.quantity.value;
    const unit = line.unit.value?.trim();
    const price = line.unitPriceExclCents.value;
    const vatPercent = line.vatRatePercent.value;
    const category = line.vatCategory.value;
    if (!description) add(issues, 'error', 'line_description', 'Een offertelijn mist een omschrijving.', `${path}.description`);
    if (quantity === null || quantity <= 0) add(issues, 'error', 'line_quantity', 'Een offertelijn mist een geldig aantal.', `${path}.quantity`);
    if (!unit) add(issues, 'warning', 'line_unit', 'Bevestig de eenheid van deze offertelijn.', `${path}.unit`);
    if (price === null || price < 0) add(issues, 'error', 'line_price', 'Een offertelijn mist een geldige prijs.', `${path}.unitPriceExclCents`);
    if (!((category === 'AE' && vatPercent === 0) || (category === 'S' && (vatPercent === 6 || vatPercent === 21)))) {
      add(issues, 'error', 'line_vat', 'Een offertelijn heeft een niet-ondersteunde btw-behandeling.', `${path}.vatRatePercent`);
    }
    for (const [field, value] of Object.entries(line)) {
      if (typeof value === 'object' && value && 'provenance' in value && value.provenance.state === 'inferred') {
        add(issues, 'warning', 'inferred', 'Controleer dit afgeleide veld.', `${path}.${field}`);
      }
    }
    if (quantity !== null && quantity > 0 && price !== null && price >= 0 && vatPercent !== null) {
      const vatRate = (vatPercent / 100) as QuoteVatRate;
      totalsInput.push({ quantity, unitPriceCents: price, vatRate });
      const calculatedLine = Math.round(quantity * price);
      if (!centsMatch(line.lineTotalExclCents.value, calculatedLine)) {
        add(issues, 'error', 'line_total_mismatch', 'Het lijntotaal klopt niet met aantal × eenheidsprijs.', `${path}.lineTotalExclCents`);
      }
    }
  }

  const totals = totalsInput.length ? calculateTotals(totalsInput) : null;
  if (totals) {
    if (!centsMatch(document.totals.subtotalExclCents.value, totals.subtotalCents)) add(issues, 'error', 'subtotal_mismatch', 'Het subtotaal komt niet overeen met de offertelijnen.', 'totals.subtotalExclCents');
    if (!centsMatch(document.totals.vatTotalCents.value, totals.vatTotalCents)) add(issues, 'error', 'vat_mismatch', 'Het btw-totaal komt niet overeen met de offertelijnen.', 'totals.vatTotalCents');
    if (!centsMatch(document.totals.grandTotalCents.value, totals.grandTotalCents)) add(issues, 'error', 'grand_total_mismatch', 'Het eindtotaal komt niet overeen met de offertelijnen.', 'totals.grandTotalCents');
  }

  const issueDate = document.quote.issueDate.value;
  const validUntil = document.quote.validUntil.value;
  if (issueDate && !isValidIsoDate(issueDate)) add(issues, 'warning', 'issue_date', 'Controleer de offertedatum.', 'quote.issueDate');
  if (validUntil && !isValidIsoDate(validUntil)) add(issues, 'warning', 'valid_until', 'Controleer de vervaldatum.', 'quote.validUntil');
  if (issueDate && validUntil && isValidIsoDate(issueDate) && isValidIsoDate(validUntil) && validUntil < issueDate) {
    add(issues, 'error', 'date_order', 'De vervaldatum ligt vóór de offertedatum.', 'quote.validUntil');
  }
  if (document.seller.vatNumber.value && !isValidBelgianVatNumber(document.seller.vatNumber.value)) {
    add(issues, 'warning', 'seller_vat', 'Controleer het btw-nummer van de afzender.', 'seller.vatNumber');
  }
  if (document.seller.enterpriseNumber.value && !isValidBelgianEnterpriseNumber(document.seller.enterpriseNumber.value)) {
    add(issues, 'warning', 'seller_enterprise', 'Controleer het KBO-nummer van de afzender.', 'seller.enterpriseNumber');
  }

  return {
    supported: !issues.some((issue) => [
      'not_quote', 'language', 'currency', 'multiple_quotes', 'discount', 'no_lines',
      'line_description', 'line_quantity', 'line_price', 'line_vat',
    ].includes(issue.code)),
    requiresAcknowledgement: issues.some((issue) => issue.severity === 'warning'),
    issues,
    calculatedTotals: totals ? {
      subtotalCents: totals.subtotalCents,
      vatTotalCents: totals.vatTotalCents,
      totalCents: totals.grandTotalCents,
    } : null,
  };
}

export function shouldEscalateQuoteExtraction(
  document: ExtractedQuoteDocument,
  validation: QuoteImportValidation,
): boolean {
  if (!validation.supported || validation.issues.length > 0 || document.lines.length > 80) return true;
  const importantFields = [
    document.customer.name,
    document.quote.number,
    document.quote.issueDate,
    document.totals.subtotalExclCents,
    document.totals.vatTotalCents,
    document.totals.grandTotalCents,
    ...document.lines.flatMap((line) => [
      line.description,
      line.quantity,
      line.unit,
      line.unitPriceExclCents,
      line.vatRatePercent,
      line.vatCategory,
      line.lineTotalExclCents,
    ]),
  ];
  return importantFields.some((field) => field.provenance.state !== 'observed');
}

export function toReviewedQuotePayload(document: ExtractedQuoteDocument): ReviewedQuotePayload {
  const inferredPaths: string[] = [];
  const lines = document.lines.map((line, index) => {
    for (const [field, value] of Object.entries(line)) {
      if (typeof value === 'object' && value && 'provenance' in value && value.provenance.state === 'inferred') inferredPaths.push(`lines.${index}.${field}`);
    }
    const unit = line.unit.value?.trim() ?? '';
    const vatPercent = line.vatRatePercent.value ?? 21;
    return {
      description: line.description.value?.trim() ?? '',
      notes: line.notes.value?.trim() || null,
      quantity: line.quantity.value ?? 1,
      unit,
      unitCode: normalizeUnitCode(unit, line.unitCode.value),
      unitPriceCents: line.unitPriceExclCents.value ?? 0,
      vatRate: (vatPercent / 100) as 0 | 0.06 | 0.21,
      vatCategory: line.vatCategory.value ?? (vatPercent === 0 ? 'AE' : 'S'),
      lineType: 'combined' as const,
    };
  });
  return ReviewedQuotePayloadSchema.parse({
    customer: {
      name: document.customer.name.value?.trim() || null,
      address: document.customer.address.value?.trim() || null,
      email: document.customer.email.value?.trim() || null,
      phone: document.customer.phone.value?.trim() || null,
    },
    quote: {
      number: document.quote.number.value?.trim() || null,
      issueDate: document.quote.issueDate.value?.trim() || null,
      validUntil: document.quote.validUntil.value?.trim() || null,
      orderReference: document.quote.orderReference.value?.trim() || null,
    },
    lines,
    sourceTotals: {
      subtotalCents: document.totals.subtotalExclCents.value,
      vatTotalCents: document.totals.vatTotalCents.value,
      totalCents: document.totals.grandTotalCents.value,
    },
    inferredPaths,
  });
}

export function validateReviewedTotals(payload: ReviewedQuotePayload) {
  const totals = calculateTotals(payload.lines.map((line) => ({
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    vatRate: line.vatRate,
  })));
  const mismatches = [
    ['subtotal', payload.sourceTotals.subtotalCents, totals.subtotalCents],
    ['vat', payload.sourceTotals.vatTotalCents, totals.vatTotalCents],
    ['total', payload.sourceTotals.totalCents, totals.grandTotalCents],
  ].filter(([, source, calculated]) => source !== null && Math.abs(Number(source) - Number(calculated)) > 1)
    .map(([field]) => String(field));
  return { totals, mismatches };
}
