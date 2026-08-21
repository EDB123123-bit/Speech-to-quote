import { calculateTotals, formatEuros, toTotalsInput, type QuoteTotals } from '@/lib/money/totals';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

export type QuoteRow = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  vatLabel: string;
  lineTotal: string;
};

export type QuoteViewModel = {
  contractor: { companyName: string; address: string; vatNumber: string; phone: string };
  customer: { name: string; address: string; email: string; phone: string };
  quoteNumber: string;
  dateNl: string;
  validUntilNl: string | null;
  orderReference: string;
  groups: { title: string; rows: QuoteRow[] }[];
  totals: QuoteTotals;
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
}): QuoteViewModel {
  const { contractor, quote, lineItems } = args;

  const grouped = new Map<string, QuoteRow[]>();
  for (const item of [...lineItems].sort((a, b) => a.sort_order - b.sort_order)) {
    const title = taskTitle(item.description);
    const rows = grouped.get(title) ?? [];
    const unitPriceCents = item.unit_price_cents ?? 0;

    rows.push({
      description: item.line_type === 'materials' ? 'Materiaal' : item.line_type === 'labor' ? 'Arbeid' : item.source_notes || 'Gecombineerd',
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: formatEuros(unitPriceCents),
      vatLabel: item.vat_category === 'AE' ? 'Verlegging' : item.vat_rate === 0.06 ? '6%' : '21%',
      lineTotal: formatEuros(Math.round(item.quantity * unitPriceCents)),
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
    dateNl,
    validUntilNl: quote.valid_until ? formatDate(quote.valid_until) : null,
    orderReference: quote.order_reference ?? '',
    groups: [...grouped.entries()].map(([title, rows]) => ({ title, rows })),
    totals: calculateTotals(toTotalsInput(lineItems)),
    showsReducedVatNotice: lineItems.some((item) => item.vat_rate === 0.06),
  };
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
