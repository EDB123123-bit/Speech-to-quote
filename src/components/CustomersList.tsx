'use client';

import { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { formatEuros } from '@/lib/money/totals';
import type { CustomerSummary } from '@/lib/customers/derive';

export type CustomerListItem = Pick<
  CustomerSummary,
  'slug' | 'name' | 'email' | 'address' | 'quoteCount' | 'draftCount' | 'totalCents' | 'lastQuoteAt'
>;

export default function CustomersList({ customers }: { customers: CustomerListItem[] }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase('nl-BE');
  const filtered = needle
    ? customers.filter((customer) =>
        `${customer.name} ${customer.address ?? ''} ${customer.email ?? ''}`
          .toLocaleLowerCase('nl-BE')
          .includes(needle),
      )
    : customers;

  return (
    <>
      <label className="search-field mb-5">
        <span className="sr-only">Zoek op klant, adres of e-mail</span>
        <Icon name="search" size={20} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Zoek op klant, adres of e-mail"
        />
      </label>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <strong>Geen klant gevonden</strong>
          Probeer een andere naam, adres of e-mail.
        </div>
      ) : (
        <ul className="quote-list">
          {filtered.map((customer) => (
            <li key={customer.slug} className="quote-card">
              <Link href={`/klanten/${customer.slug}`} className="quote-card-link">
                <div>
                  <p className="quote-name">{customer.name}</p>
                  {customer.address && <p className="quote-meta">{customer.address}</p>}
                </div>
                <span className="desktop-only quote-meta">
                  {customer.quoteCount} {customer.quoteCount === 1 ? 'offerte' : 'offertes'}
                </span>
                <span className={`desktop-only status-pill ${customer.draftCount > 0 ? 'is-neutral' : 'is-success'}`}>
                  {customer.draftCount > 0 ? `${customer.draftCount} in concept` : 'Alles afgewerkt'}
                </span>
                <div>
                  <p className="quote-amount">{customer.totalCents === null ? 'Onbekend' : formatEuros(customer.totalCents)}</p>
                  <p className="quote-status mobile-only">
                    {customer.quoteCount} {customer.quoteCount === 1 ? 'offerte' : 'offertes'}
                  </p>
                </div>
                <Icon name="chevron-right" size={20} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
