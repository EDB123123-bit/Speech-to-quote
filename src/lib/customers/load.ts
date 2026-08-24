import { requireContractor } from '@/lib/auth/require-contractor';
import { summarizePricing } from '@/lib/money/totals';
import type { Quote, QuoteLineItem } from '@/lib/supabase/types';
import { countQuotesWithoutCustomer, deriveCustomers, type CustomerSummary } from './derive';

type SupabaseClient = Awaited<ReturnType<typeof requireContractor>>['supabase'];

/** Upper bound on the quotes scanned to build the customer list. */
export const CUSTOMER_QUOTE_SCAN_LIMIT = 500;

export async function loadCustomers(supabase: SupabaseClient): Promise<{
  customers: CustomerSummary[];
  quotesWithoutCustomer: number;
}> {
  const { data } = await supabase
    .from('quotes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(CUSTOMER_QUOTE_SCAN_LIMIT);
  const quotes = (data ?? []) as Quote[];

  const quoteIds = quotes.map((quote) => quote.id);
  const { data: lineItemRows } = quoteIds.length > 0
    ? await supabase.from('quote_line_items').select('*').in('quote_id', quoteIds)
    : { data: [] };

  const itemsByQuote = new Map<string, QuoteLineItem[]>();
  for (const item of (lineItemRows ?? []) as QuoteLineItem[]) {
    itemsByQuote.set(item.quote_id, [...(itemsByQuote.get(item.quote_id) ?? []), item]);
  }
  const totalCentsByQuoteId = new Map(quotes.map((quote) => [
    quote.id,
    (() => { const p = summarizePricing(itemsByQuote.get(quote.id) ?? []); return p.state === 'unpriced' ? null : p.knownTotalCents; })(),
  ]));

  return {
    customers: deriveCustomers(quotes, totalCentsByQuoteId),
    quotesWithoutCustomer: countQuotesWithoutCustomer(quotes),
  };
}
