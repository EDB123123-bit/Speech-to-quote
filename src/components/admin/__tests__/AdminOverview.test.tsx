// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AdminOverview from '../AdminOverview';
import type { AdminAccount, AdminPilotRequest, AdminSummary } from '@/lib/admin/overview';

const busy: AdminAccount = {
  id: 'user-1',
  email: 'jan@dakwerken-peeters.be',
  companyName: 'Dakwerken Peeters',
  signedUpAt: '2026-08-12T09:00:00Z',
  emailConfirmed: true,
  lastSignInAt: '2026-09-28T18:00:00Z',
  onboardingDone: true,
  deactivated: false,
  mailboxConnected: true,
  quotes: { total: 5, draft: 2, final: 1, sent: 1, accepted: 1, byVoice: 4 },
  lastQuoteAt: '2026-09-27T10:00:00Z',
};

const fresh: AdminAccount = {
  ...busy,
  id: 'user-2',
  email: 'info@dakdekker-devries.nl',
  companyName: null,
  emailConfirmed: false,
  lastSignInAt: null,
  onboardingDone: false,
  mailboxConnected: false,
  quotes: { total: 0, draft: 0, final: 0, sent: 0, accepted: 0, byVoice: 0 },
  lastQuoteAt: null,
};

const request: AdminPilotRequest = {
  id: 'pilot-1',
  created_at: '2026-09-29T08:00:00Z',
  name: 'Anouk de Vries',
  company: 'Dakdekkersbedrijf De Vries',
  phone: '+31 6 1234 5678',
  email: 'anouk@devries.nl',
  region: 'nederland',
  quotes_per_month: '10-30',
  note: 'Nu alles in Excel.',
  status: 'nieuw',
};

const summary: AdminSummary = { accounts: 2, activeAccounts: 1, quotes: 5, acceptedQuotes: 1, newPilotRequests: 1 };

describe('AdminOverview', () => {
  it('shows each account with its quote counts and follow-up signals', () => {
    render(<AdminOverview accounts={[busy, fresh]} pilotRequests={[request]} pilotRequestsFailed={false} summary={summary} />);

    const cards = within(screen.getByRole('region', { name: '2 accounts' })).getAllByRole('listitem');
    expect(cards[0]).toHaveTextContent('Dakwerken Peeters');
    expect(cards[0]).toHaveTextContent('5 offertes');
    expect(cards[0]).toHaveTextContent('2 concept, 1 afgewerkt, 1 verstuurd, 1 aanvaard');
    expect(cards[0]).toHaveTextContent('4 ingesproken');
    expect(cards[0]).toHaveTextContent('Mailbox verbonden');

    expect(cards[1]).toHaveTextContent('Geen bedrijfsnaam');
    expect(cards[1]).toHaveTextContent('info@dakdekker-devries.nl');
    expect(cards[1]).toHaveTextContent('0 offertes');
    expect(cards[1]).toHaveTextContent('E-mail niet bevestigd');
    expect(cards[1]).toHaveTextContent('Nog geen offerte');
    expect(cards[1]).toHaveTextContent('Laatste loginNooit');
  });

  it('lists pilot sign-ups with direct call and mail links', () => {
    render(<AdminOverview accounts={[busy]} pilotRequests={[request]} pilotRequestsFailed={false} summary={summary} />);

    const pilots = screen.getByRole('region', { name: /Pilotaanvragen/ });
    expect(pilots).toHaveTextContent('Pilotaanvragen (1, 1 nieuw)');
    expect(pilots).toHaveTextContent('Anouk de Vries, Dakdekkersbedrijf De Vries');
    expect(pilots).toHaveTextContent('Nederland. 10 tot 30 offertes per maand.');
    expect(within(pilots).getByRole('link', { name: '+31 6 1234 5678' })).toHaveAttribute('href', 'tel:+31612345678');
    expect(within(pilots).getByRole('link', { name: 'anouk@devries.nl' })).toHaveAttribute('href', 'mailto:anouk@devries.nl');
  });

  it('explains empty lists and a failed pilot load instead of showing nothing', () => {
    const empty: AdminSummary = { accounts: 0, activeAccounts: 0, quotes: 0, acceptedQuotes: 0, newPilotRequests: 0 };
    const { rerender } = render(<AdminOverview accounts={[]} pilotRequests={[]} pilotRequestsFailed={false} summary={empty} />);
    expect(screen.getByText('Nog geen accounts')).toBeInTheDocument();
    expect(screen.getByText('Nog geen pilotaanvragen')).toBeInTheDocument();

    rerender(<AdminOverview accounts={[]} pilotRequests={[]} pilotRequestsFailed summary={empty} />);
    expect(screen.getByRole('alert')).toHaveTextContent('De pilotaanvragen konden niet geladen worden');
  });
});
