'use client';

import { useState } from 'react';
import Link from 'next/link';
import DeleteQuoteButton from '@/components/DeleteQuoteButton';
import Icon from '@/components/ui/Icon';
import { formatEuros } from '@/lib/money/totals';

export type QuoteListItem = {
  id: string;
  customerName: string;
  place: string;
  createdAt: string;
  status: 'draft' | 'final';
  totalCents: number;
  openQuestions: number;
};

export default function QuotesList({ quotes }: { quotes: QuoteListItem[] }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase('nl-BE');
  const filtered = needle
    ? quotes.filter((quote) =>
        `${quote.customerName} ${quote.place}`.toLocaleLowerCase('nl-BE').includes(needle),
      )
    : quotes;

  return (
    <>
      <label className="search-field mb-5">
        <span className="sr-only">Zoek op klant of plaats</span>
        <Icon name="search" size={20} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Zoek op klant of plaats"
        />
      </label>

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
              const formattedDate = new Date(quote.createdAt).toLocaleDateString('nl-BE', {
                day: '2-digit',
                month: '2-digit',
              });
              return (
                <li key={quote.id} className="quote-card">
                  <div className="delete-compact">
                    <DeleteQuoteButton quoteId={quote.id} compact />
                  </div>
                  <Link href={`/offertes/${quote.id}`} className="quote-card-link">
                    <div>
                      <p className="quote-name">{quote.customerName}</p>
                      <p className="quote-meta mobile-only">
                        {[quote.place, new Date(quote.createdAt).toLocaleDateString('nl-BE')].filter(Boolean).join(' · ')}
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
                    <span className={`desktop-only status-pill ${quote.openQuestions > 0 ? 'is-warning' : quote.status === 'final' ? 'is-success' : 'is-neutral'}`}>
                      {quote.openQuestions > 0
                        ? `${quote.openQuestions} ${quote.openQuestions === 1 ? 'vraag' : 'vragen'} open`
                        : quote.status === 'final' ? 'Afgewerkt' : 'Concept'}
                    </span>
                    <div>
                      <p className="quote-amount">{formatEuros(quote.totalCents)}</p>
                      <p className="quote-status mobile-only">{quote.status === 'final' ? 'Afgewerkt' : 'Concept'}</p>
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
