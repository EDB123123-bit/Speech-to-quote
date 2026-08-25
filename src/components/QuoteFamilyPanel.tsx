import Link from 'next/link';
import { createMeerwerkQuote } from '@/app/offertes/quote-actions';
import { formatEuros, type QuotePricingSummary } from '@/lib/money/totals';
import type { Quote } from '@/lib/supabase/types';

type Props = {
  quote: Quote;
  parent: Pick<Quote, 'id' | 'quote_number' | 'customer_name'> | null;
  changeOrders: Array<{ quote: Quote; pricing: QuotePricingSummary }>;
  originalPricing: QuotePricingSummary;
};

export default function QuoteFamilyPanel({ quote, parent, changeOrders, originalPricing }: Props) {
  if (quote.quote_kind === 'meerwerk' && parent) {
    return <section className="card mb-6">
      <p className="eyebrow">Meerwerkofferte</p>
      <p className="text-sm text-muted">Meerwerk bij offerte <Link className="font-bold underline" href={`/offertes/${parent.id}`}>{parent.quote_number ?? parent.id.slice(0, 8).toUpperCase()}</Link> · klantgegevens overgenomen en vergrendeld.</p>
    </section>;
  }

  if (quote.quote_kind !== 'meerwerk') {
    const acceptedChildren = changeOrders.filter(({ quote: child }) => child.status === 'accepted');
    const allPriced = originalPricing.state === 'fully_priced' && acceptedChildren.every(({ pricing }) => pricing.state === 'fully_priced');
    const knownTotal = originalPricing.knownTotalCents + acceptedChildren.reduce((total, child) => total + child.pricing.knownTotalCents, 0);
    const unknownCount = (originalPricing.state === 'fully_priced' ? 0 : 1) + acceptedChildren.filter(({ pricing }) => pricing.state !== 'fully_priced').length;
    return <section className="card mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">Offertefamilie</p><h2 className="section-heading">Meerwerken</h2></div>
        {quote.status === 'accepted' && <div className="flex flex-wrap gap-2"><Link className="btn btn-outline" href={`/offertes/nieuw?parent=${encodeURIComponent(quote.id)}`}>Meerwerk inspreken</Link><form action={createMeerwerkQuote.bind(null, quote.id)}><button className="btn btn-outline" type="submit">Meerwerk handmatig maken</button></form></div>}
      </div>
      <div className="mt-3 border-t border-border pt-3">
        {changeOrders.length === 0 ? <p className="text-sm text-muted">Nog geen meerwerkoffertes.</p> : <ul className="flex flex-col gap-2">{changeOrders.map(({ quote: child, pricing }) => <li key={child.id} className="flex items-center justify-between gap-3 text-sm"><Link className="font-bold underline" href={`/offertes/${child.id}`}>{child.quote_number ?? child.id.slice(0, 8).toUpperCase()}</Link><span className="status-pill is-neutral">{statusLabel(child.status)} · {pricing.state === 'unpriced' ? 'Onbekend' : formatEuros(pricing.knownTotalCents)}</span></li>)}</ul>}
      </div>
      {quote.status === 'accepted' && <p className="mt-4 text-sm font-semibold">{allPriced ? `Familietotaal incl. btw: ${formatEuros(knownTotal)}` : `Gekend bedrag: ${formatEuros(knownTotal)} · ${unknownCount} offerte${unknownCount === 1 ? '' : 's'} met prijs nog te bepalen`}</p>}
    </section>;
  }
  return null;
}

function statusLabel(status: Quote['status']): string {
  return status === 'accepted' ? 'Aanvaard' : status === 'sent' ? 'Verstuurd' : status === 'final' ? 'Afgewerkt' : 'Concept';
}
