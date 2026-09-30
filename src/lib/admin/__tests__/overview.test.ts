import { describe, expect, it, vi } from 'vitest';
import {
  formatAdminDate,
  loadAdminOverview,
  summarize,
  toAdminAccount,
  type AccountOverviewRow,
  type AdminPilotRequest,
} from '@/lib/admin/overview';

const row: AccountOverviewRow = {
  user_id: 'user-1',
  email: 'jan@dakwerken-peeters.be',
  company_name: '  Dakwerken Peeters ',
  signed_up_at: '2026-08-12T09:00:00Z',
  email_confirmed_at: '2026-08-12T09:05:00Z',
  last_sign_in_at: '2026-09-28T18:00:00Z',
  onboarding_completed_at: null,
  deactivated_at: null,
  mailbox_connected: true,
  quotes_total: '5',
  quotes_draft: 2,
  quotes_final: '1',
  quotes_sent: 1,
  quotes_accepted: '1',
  quotes_by_voice: '4',
  last_quote_at: '2026-09-27T10:00:00Z',
};

function pilot(status: string): AdminPilotRequest {
  return { id: status, created_at: '2026-09-29T08:00:00Z', name: 'Anouk', company: null, phone: '0470 12 34 56', email: null, region: 'nederland', quotes_per_month: null, note: null, status };
}

describe('toAdminAccount', () => {
  it('turns bigint strings into numbers and flags into booleans', () => {
    expect(toAdminAccount(row)).toEqual({
      id: 'user-1',
      email: 'jan@dakwerken-peeters.be',
      companyName: 'Dakwerken Peeters',
      signedUpAt: '2026-08-12T09:00:00Z',
      emailConfirmed: true,
      lastSignInAt: '2026-09-28T18:00:00Z',
      onboardingDone: false,
      deactivated: false,
      mailboxConnected: true,
      quotes: { total: 5, draft: 2, final: 1, sent: 1, accepted: 1, byVoice: 4 },
      lastQuoteAt: '2026-09-27T10:00:00Z',
    });
  });

  it('treats an account without a company name or email as unknown, not empty', () => {
    const account = toAdminAccount({ ...row, company_name: '   ', email: null, email_confirmed_at: null });
    expect(account.companyName).toBeNull();
    expect(account.email).toBeNull();
    expect(account.emailConfirmed).toBe(false);
  });
});

describe('summarize', () => {
  it('counts accounts, recent activity, quotes and new pilot sign-ups', () => {
    const now = new Date('2026-09-29T12:00:00Z');
    const active = toAdminAccount(row);
    const stale = toAdminAccount({ ...row, user_id: 'user-2', quotes_total: 1, quotes_accepted: 0, last_quote_at: '2026-07-01T10:00:00Z' });
    const unused = toAdminAccount({ ...row, user_id: 'user-3', quotes_total: 0, quotes_accepted: 0, last_quote_at: null });

    expect(summarize([active, stale, unused], [pilot('nieuw'), pilot('gecontacteerd'), pilot('nieuw')], now)).toEqual({
      accounts: 3,
      activeAccounts: 1,
      quotes: 6,
      acceptedQuotes: 1,
      newPilotRequests: 2,
    });
  });
});

describe('formatAdminDate', () => {
  it('formats dates in Belgian Dutch, in Brussels time', () => {
    expect(formatAdminDate('2026-09-28T23:30:00Z')).toMatch(/29 sep\.? 2026/);
  });

  it('says so when something never happened', () => {
    expect(formatAdminDate(null)).toBe('Nooit');
    expect(formatAdminDate('not a date')).toBe('Onbekend');
  });
});

describe('loadAdminOverview', () => {
  function client(overview: unknown, pilots: unknown) {
    const limit = vi.fn().mockResolvedValue(pilots);
    return {
      rpc: vi.fn().mockResolvedValue(overview),
      from: vi.fn().mockReturnValue({ select: () => ({ order: () => ({ limit }) }) }),
    } as never;
  }

  it('maps the overview rows and pilot requests', async () => {
    const result = await loadAdminOverview(client({ data: [row], error: null }, { data: [pilot('nieuw')], error: null }));
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].quotes.total).toBe(5);
    expect(result.pilotRequests).toHaveLength(1);
    expect(result.pilotRequestsFailed).toBe(false);
  });

  it('still shows accounts when pilot requests cannot be read', async () => {
    const result = await loadAdminOverview(client({ data: [row], error: null }, { data: null, error: { message: 'boom' } }));
    expect(result.accounts).toHaveLength(1);
    expect(result.pilotRequests).toEqual([]);
    expect(result.pilotRequestsFailed).toBe(true);
  });

  it('fails loudly when the account overview itself cannot be read', async () => {
    await expect(loadAdminOverview(client({ data: null, error: { message: 'missing function' } }, { data: [], error: null })))
      .rejects.toThrow('Accountoverzicht laden mislukt: missing function');
  });
});
