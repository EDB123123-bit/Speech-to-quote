import { formatEuros, summarizePricing, type QuotePricingSummary } from '@/lib/money/totals';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

export type QuoteRow = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatLabel: string;
  lineTotal: string;
};

export type QuoteViewModel = {
  contractor: { companyName: string; address: string; vatNumber: string; phone: string };
  customer: { name: string; address: string; email: string; phone: string };
  quoteNumber: string;
  quoteKind: 'standard' | 'meerwerk';
  originalQuoteNumber: string | null;
  dateNl: string;
  validUntilNl: string | null;
  orderReference: string;
  groups: { title: string; rows: QuoteRow[] }[];
  totals: QuotePricingSummary;
  hasPricedLines: boolean;
  hasUnpricedLines: boolean;
  showPriceColumns: boolean;
  showsReducedVatNotice: boolean;
};

/** "Dakpannen leggen – materiaal" -> "Dakpannen leggen" */
function taskTitle(description: string): string {
  return description.replace(/\s+–\s+(materiaal|arbeid)$/u, '').trim();
}

export function buildQuoteViewModel(args: {
  contractor: Contractor;
  quote: Quote;
  lineItems: QuoteLineItem[];
  originalQuoteNumber?: string | null;
}): QuoteViewModel {
  const { contractor, quote, lineItems } = args;

  const grouped = new Map<string, QuoteRow[]>();
  for (const item of [...lineItems].sort((a, b) => a.sort_order - b.sort_order)) {
    const title = taskTitle(item.description);
    const rows = grouped.get(title) ?? [];
    const unitPriceCents = item.unit_price_cents;

    const simple = (item.line_kind ?? (item.quantity !== null && item.unit !== null ? 'detailed' : 'simple')) === 'simple';
    rows.push({
      description: item.description,
      quantity: simple ? '' : String(item.quantity ?? ''),
      unit: simple ? '' : item.unit ?? '',
      unitPrice: unitPriceCents === null ? 'Onbekend' : formatEuros(unitPriceCents),
      vatLabel: item.vat_category === 'AE' ? 'Verlegging' : item.vat_rate === null ? '—' : item.vat_rate === 0.06 ? '6%' : '21%',
      lineTotal: unitPriceCents === null ? 'Prijs nog te bepalen' : formatEuros(Math.round((simple ? 1 : item.quantity ?? 0) * unitPriceCents)),
    });
    grouped.set(title, rows);
  }

  const dateNl = formatDate(quote.issue_date ?? quote.created_at);

  return {
    contractor: {
      companyName: contractor.company_name,
      address: contractor.address ?? '',
      vatNumber: contractor.vat_number ?? '',
      phone: contractor.phone ?? '',
    },
    customer: {
      name: quote.customer_name ?? '',
      address: quote.customer_address ?? '',
      email: quote.customer_email ?? '',
      phone: quote.customer_phone ?? '',
    },
    quoteNumber: quote.quote_number ?? quote.id.split('-')[0].toUpperCase(),
    quoteKind: quote.quote_kind ?? 'standard',
    originalQuoteNumber: args.originalQuoteNumber ?? null,
    dateNl,
    validUntilNl: quote.valid_until ? formatDate(quote.valid_until) : null,
    orderReference: quote.order_reference ?? '',
    groups: [...grouped.entries()].map(([title, rows]) => ({ title, rows })),
    totals: summarizePricing(lineItems),
    hasPricedLines: lineItems.some((item) => item.unit_price_cents !== null && item.vat_rate !== null),
    hasUnpricedLines: lineItems.some((item) => item.unit_price_cents === null),
    showPriceColumns: lineItems.some((item) => item.unit_price_cents !== null && item.vat_rate !== null),
    showsReducedVatNotice: lineItems.some((item) => item.vat_rate === 0.06),
  };
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
