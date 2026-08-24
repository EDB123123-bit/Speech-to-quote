import type { Quote, QuoteStatus } from '@/lib/supabase/types';

export type CustomerQuoteRow = Pick<
  Quote,
  'id' | 'customer_name' | 'customer_address' | 'customer_email' | 'customer_phone' | 'status' | 'created_at'
> & { quote_number?: string; issue_date?: string };

export type CustomerQuoteSummary = {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  createdAt: string;
  issueDate: string;
  totalCents: number | null;
};

export type CustomerSummary = {
  slug: string;
  name: string;
  email: string | null;
  address: string | null;
  phone: string | null;
  quoteCount: number;
  draftCount: number;
  finalCount: number;
  totalCents: number | null;
  lastQuoteAt: string;
  quotes: CustomerQuoteSummary[];
};

/**
 * Legacy quote lists can still be grouped without a customer join. Names are
 * matched case-, accent- and spacing-insensitively so that "Anne Bauwens" and
 * "anne  bauwens" resolve to one person while older snapshots are backfilled.
 */
export function normalizeCustomerName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLocaleLowerCase('nl-BE')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function customerSlug(name: string): string {
  const slug = normalizeCustomerName(name).replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
  return slug || 'klant';
}

function pickFirstFilled(values: (string | null)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * Groups quotes into customers, newest quote first. Quotes with no customer name
 * are not invented into a customer; the caller reports them separately.
 */
export function deriveCustomers(
  quotes: CustomerQuoteRow[],
  totalCentsByQuoteId: Map<string, number | null>,
): CustomerSummary[] {
  const groups = new Map<string, { rows: CustomerQuoteRow[] }>();

  for (const quote of quotes) {
    const name = quote.customer_name?.trim();
    if (!name) continue;
    const key = normalizeCustomerName(name);
    const group = groups.get(key) ?? { rows: [] };
    group.rows.push(quote);
    groups.set(key, group);
  }

  const customers = [...groups.values()].map(({ rows }) => {
    const byNewest = [...rows].sort((left, right) => right.created_at.localeCompare(left.created_at));
    const name = byNewest[0].customer_name!.trim();
    const quoteSummaries: CustomerQuoteSummary[] = byNewest.map((quote) => ({
      id: quote.id,
      quoteNumber: quote.quote_number ?? quote.id.split('-')[0].toLocaleUpperCase('nl-BE'),
      status: quote.status,
      createdAt: quote.created_at,
      issueDate: quote.issue_date ?? quote.created_at.slice(0, 10),
      totalCents: totalCentsByQuoteId.get(quote.id) ?? null,
    }));

    return {
      slug: customerSlug(name),
      name,
      // Contact details are taken from the most recent quote that carries them,
      // so a newer spelling wins but an older quote still fills a blank field.
      email: pickFirstFilled(byNewest.map((quote) => quote.customer_email)),
      address: pickFirstFilled(byNewest.map((quote) => quote.customer_address)),
      phone: pickFirstFilled(byNewest.map((quote) => quote.customer_phone)),
      quoteCount: byNewest.length,
      draftCount: byNewest.filter((quote) => quote.status === 'draft').length,
      finalCount: byNewest.filter((quote) => quote.status !== 'draft').length,
      totalCents: quoteSummaries.some((quote) => quote.totalCents === null) ? null : quoteSummaries.reduce((sum, quote) => sum + (quote.totalCents ?? 0), 0),
      lastQuoteAt: byNewest[0].created_at,
      quotes: quoteSummaries,
    };
  });

  return customers.sort((left, right) => right.lastQuoteAt.localeCompare(left.lastQuoteAt));
}

export function findCustomerBySlug(customers: CustomerSummary[], slug: string): CustomerSummary | null {
  return customers.find((customer) => customer.slug === slug) ?? null;
}

export function countQuotesWithoutCustomer(quotes: CustomerQuoteRow[]): number {
  return quotes.filter((quote) => !quote.customer_name?.trim()).length;
}
