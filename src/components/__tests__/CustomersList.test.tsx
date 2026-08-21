// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomersList, { type CustomerListItem } from '@/components/CustomersList';
import { formatEuros } from '@/lib/money/totals';

const customer = (overrides: Partial<CustomerListItem> = {}): CustomerListItem => ({
  slug: 'anne-bauwens',
  name: 'Anne Bauwens',
  email: 'anne@example.be',
  address: 'Edgard Blancquaertlaan 6, 9255 Buggenhout',
  quoteCount: 2,
  draftCount: 1,
  totalCents: 466400,
  lastQuoteAt: '2026-08-05T10:00:00Z',
  ...overrides,
});

describe('CustomersList', () => {
  it('links each customer to their detail page', () => {
    render(<CustomersList customers={[customer()]} />);
    expect(screen.getByRole('link', { name: /Anne Bauwens/ })).toHaveAttribute('href', '/klanten/anne-bauwens');
  });

  it('shows the quote count and combined amount', () => {
    render(<CustomersList customers={[customer()]} />);
    expect(screen.getAllByText('2 offertes').length).toBeGreaterThan(0);
    expect(screen.getByText(formatEuros(466400))).toBeInTheDocument();
  });

  it('uses the singular label for a single quote', () => {
    render(<CustomersList customers={[customer({ quoteCount: 1 })]} />);
    expect(screen.getAllByText('1 offerte').length).toBeGreaterThan(0);
  });

  it('reports whether anything is still in concept', () => {
    render(<CustomersList customers={[customer({ draftCount: 0 })]} />);
    expect(screen.getByText('Alles afgewerkt')).toBeInTheDocument();
  });

  it('filters on name, address and e-mail', async () => {
    render(<CustomersList customers={[
      customer(),
      customer({ slug: 'jan-peeters', name: 'Jan Peeters', email: 'jan@example.be', address: 'Kerkstraat 1, Gent' }),
    ]} />);
    const search = screen.getByPlaceholderText('Zoek op klant, adres of e-mail');

    await userEvent.type(search, 'Gent');
    expect(screen.getByText('Jan Peeters')).toBeInTheDocument();
    expect(screen.queryByText('Anne Bauwens')).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'anne@example');
    expect(screen.getByText('Anne Bauwens')).toBeInTheDocument();
    expect(screen.queryByText('Jan Peeters')).not.toBeInTheDocument();
  });

  it('explains an empty search result', async () => {
    render(<CustomersList customers={[customer()]} />);
    await userEvent.type(screen.getByPlaceholderText('Zoek op klant, adres of e-mail'), 'zzz');
    expect(screen.getByText('Geen klant gevonden')).toBeInTheDocument();
  });

  it('tolerates a customer without an address', () => {
    render(<CustomersList customers={[customer({ address: null })]} />);
    expect(screen.getByText('Anne Bauwens')).toBeInTheDocument();
  });
});
