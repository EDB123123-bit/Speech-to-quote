import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatEuros } from '@/lib/money/totals';
import { summarizePricing } from '@/lib/money/totals';
import { buildQuoteViewModel } from '@/lib/pdf/quote-view-model';
import { loadPublicQuote } from '@/lib/quotes/public';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';
import PublicQuoteActions from './PublicQuoteActions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const result = await loadPublicQuote(token);
  return {
    title: result ? `Offerte ${result.quote.quote_number ?? ''}`.trim() : 'Offerte',
    robots: { index: false, follow: false },
  };
}

export default async function PublicQuotePage({ params }: Props) {
  const { token } = await params;
  const result = await loadPublicQuote(token);
  if (!result) notFound();

  const model = buildQuoteViewModel({
    contractor: result.contractor as Contractor,
    quote: result.quote as Quote,
    lineItems: result.lineItems as QuoteLineItem[],
    originalQuoteNumber: result.originalQuoteNumber,
  });
  const pricing = summarizePricing(result.lineItems as QuoteLineItem[]);

  return (
    <main className="page-shell page-narrow">
      <header className="mb-7">
        <p className="eyebrow">Offerte</p>
        <h1 className="page-title">{model.contractor.companyName}</h1>
        <p className="page-subtitle">{model.quoteKind === 'meerwerk' ? `Meerwerk bij offerte ${model.originalQuoteNumber ?? '—'} · ` : ''}Offerte {model.quoteNumber} · {model.dateNl}</p>
      </header>

      <section className="card mb-5">
        <p className="eyebrow">Voor</p>
        <h2 className="section-heading">{model.customer.name || 'Klant'}</h2>
        {!!model.customer.address && <p className="text-muted">{model.customer.address}</p>}
      </section>

      <section className="card">
        <h2 className="section-heading">Werkzaamheden</h2>
        <div className="mt-4 flex flex-col gap-5">
          {model.groups.map((group) => (
            <div key={group.title}>
              <h3 className="font-extrabold">{group.title}</h3>
              <div className="mt-2 flex flex-col gap-2">
                {group.rows.map((row, index) => (
                  <div key={`${group.title}-${index}`} className="flex items-start justify-between gap-4 border-b border-border pb-2 text-sm">
                    <span>{row.description}{row.quantity ? ` · ${row.quantity} ${row.unit}` : ''}</span>
                    {model.showPriceColumns && <span className="font-bold">{row.lineTotal}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 border-t border-border pt-4">
          {model.showPriceColumns && <><div className="flex justify-between text-sm font-semibold"><span>{pricing.state === 'partially_priced' ? 'Subtotaal gekende werken' : 'Subtotaal'}</span><span>{formatEuros(pricing.subtotalCents)}</span></div><div className="mt-1 flex justify-between text-sm font-semibold"><span>Btw</span><span>{formatEuros(pricing.vatTotalCents)}</span></div></>}
          <div className="mt-3 flex justify-between text-lg font-extrabold"><span>{pricing.state === 'fully_priced' ? 'Totaal incl. btw' : pricing.state === 'partially_priced' ? 'Totaal gekende werken' : 'Totaal'}</span><span>{pricing.state === 'unpriced' ? 'Prijs nog te bepalen' : formatEuros(pricing.knownTotalCents)}</span></div>
        </div>
        {model.hasUnpricedLines && <p className="alert alert-warning mt-5">{pricing.state === 'unpriced' ? 'De prijs voor deze werken wordt later bepaald.' : 'Niet-geprijsde werken zijn aangeduid als “Prijs nog te bepalen” en zijn niet opgenomen in het gekende totaal.'}</p>}
      </section>

      <section className="card mt-5">
        <PublicQuoteActions token={token} accepted={result.quote.status === 'accepted'} />
      </section>
    </main>
  );
}
