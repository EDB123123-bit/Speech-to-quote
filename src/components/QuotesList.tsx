'use client';

import { useState } from 'react';
import Link from 'next/link';
import DeleteQuoteButton from '@/components/DeleteQuoteButton';
import Icon from '@/components/ui/Icon';
import { formatEuros } from '@/lib/money/totals';
import type { QuoteKind, QuoteStatus } from '@/lib/supabase/types';

export type QuoteListItem = {
  id: string;
  customerName: string;
  place: string;
  createdAt: string;
  issueDate: string;
  quoteNumber: string;
  status: QuoteStatus;
  quoteKind?: QuoteKind;
  totalCents: number | null;
  pricingState?: 'fully_priced' | 'partially_priced' | 'unpriced';
  openQuestions: number;
};

export default function QuotesList({ quotes, showSearch = true }: { quotes: QuoteListItem[]; showSearch?: boolean }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase('nl-BE');
  const filtered = needle
    ? quotes.filter((quote) =>
        `${quote.customerName} ${quote.place} ${quote.quoteNumber}`.toLocaleLowerCase('nl-BE').includes(needle),
      )
    : quotes;

  return (
    <>
      {showSearch && <label className="search-field mb-5">
        <span className="sr-only">Zoek op klant of plaats</span>
        <Icon name="search" size={20} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Zoek op klant of plaats"
        />
      </label>}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <strong>Geen offerte gevonden</strong>
          Probeer een andere klantnaam of plaats.
        </div>
      ) : (
        <>
          <div className="quote-grid-head" aria-hidden="true">
            <span>Klant</span><span>Plaats</span><span>Datum</span><span>Status</span><span className="text-right">Bedrag</span>
          </div>
          <ul className="quote-list">
            {filtered.map((quote) => {
              const status = statusPresentation(quote.status);
              const formattedDate = new Date(`${quote.issueDate}T00:00:00`).toLocaleDateString('nl-BE', {
                day: '2-digit',
                month: '2-digit',
              });
              return (
                <li key={quote.id} className="quote-card">
                  {quote.status !== 'accepted' && (
                    <div className="delete-compact">
                      <DeleteQuoteButton quoteId={quote.id} compact />
                    </div>
                  )}
                  <Link href={`/offertes/${quote.id}`} className="quote-card-link">
                    <div>
                      <p className="quote-name">{quote.customerName}</p>
                      <p className="text-xs text-muted">{quote.quoteNumber}</p>
                      {quote.quoteKind === 'meerwerk' && <span className="status-pill is-warning">Meerwerk</span>}
                      <p className="quote-meta mobile-only">
                        {[quote.place, new Date(`${quote.issueDate}T00:00:00`).toLocaleDateString('nl-BE')].filter(Boolean).join(' · ')}
                      </p>
                      {quote.openQuestions > 0 && (
                        <span className="status-pill is-warning quote-task mobile-only">
                          <Icon name="warning" size={15} />
                          {quote.openQuestions} {quote.openQuestions === 1 ? 'vraag' : 'vragen'} open
                        </span>
                      )}
                    </div>
                    <span className="desktop-only quote-meta">{quote.place || '—'}</span>
                    <span className="desktop-only quote-meta nums">{formattedDate}</span>
                    <span className={`desktop-only status-pill ${quote.openQuestions > 0 ? 'is-warning' : status.className}`}>
                      {quote.openQuestions > 0
                        ? `${quote.openQuestions} ${quote.openQuestions === 1 ? 'vraag' : 'vragen'} open`
                        : quote.quoteKind === 'meerwerk' ? `Meerwerk · ${status.label}` : status.label}
                    </span>
                    <div>
                      <p className="quote-amount">{quote.totalCents === null ? 'Onbekend' : quote.pricingState === 'partially_priced' ? `Gekend: ${formatEuros(quote.totalCents)}` : formatEuros(quote.totalCents)}</p>
                      <p className="quote-status mobile-only">{status.label}</p>
                    </div>
                    <Icon name="chevron-right" size={20} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

function statusPresentation(status: QuoteStatus): { label: string; className: string } {
  if (status === 'accepted') return { label: 'Aanvaard', className: 'is-success' };
  if (status === 'sent') return { label: 'Verstuurd', className: 'is-warning' };
  if (status === 'final') return { label: 'Afgewerkt', className: 'is-final' };
  return { label: 'Concept', className: 'is-neutral' };
}
