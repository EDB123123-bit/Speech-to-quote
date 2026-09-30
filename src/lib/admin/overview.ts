import type { SupabaseClient } from '@supabase/supabase-js';

/** One row of public.admin_account_overview(). Counts arrive as numbers or bigint strings. */
export type AccountOverviewRow = {
  user_id: string;
  email: string | null;
  company_name: string | null;
  signed_up_at: string;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  onboarding_completed_at: string | null;
  deactivated_at: string | null;
  mailbox_connected: boolean;
  quotes_total: number | string;
  quotes_draft: number | string;
  quotes_final: number | string;
  quotes_sent: number | string;
  quotes_accepted: number | string;
  quotes_by_voice: number | string;
  last_quote_at: string | null;
};

export type AdminAccount = {
  id: string;
  email: string | null;
  companyName: string | null;
  signedUpAt: string;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  onboardingDone: boolean;
  deactivated: boolean;
  mailboxConnected: boolean;
  quotes: { total: number; draft: number; final: number; sent: number; accepted: number; byVoice: number };
  lastQuoteAt: string | null;
};

export type AdminPilotRequest = {
  id: string;
  created_at: string;
  name: string;
  company: string | null;
  phone: string;
  email: string | null;
  region: string;
  quotes_per_month: string | null;
  note: string | null;
  status: string;
};

export type AdminSummary = {
  accounts: number;
  activeAccounts: number;
  quotes: number;
  acceptedQuotes: number;
  newPilotRequests: number;
};

/** An account counts as active when it made a quote in this many days. */
export const ACTIVE_WINDOW_DAYS = 30;

function count(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toAdminAccount(row: AccountOverviewRow): AdminAccount {
  return {
    id: row.user_id,
    email: row.email,
    companyName: row.company_name?.trim() || null,
    signedUpAt: row.signed_up_at,
    emailConfirmed: row.email_confirmed_at !== null,
    lastSignInAt: row.last_sign_in_at,
    onboardingDone: row.onboarding_completed_at !== null,
    deactivated: row.deactivated_at !== null,
    mailboxConnected: row.mailbox_connected,
    quotes: {
      total: count(row.quotes_total),
      draft: count(row.quotes_draft),
      final: count(row.quotes_final),
      sent: count(row.quotes_sent),
      accepted: count(row.quotes_accepted),
      byVoice: count(row.quotes_by_voice),
    },
    lastQuoteAt: row.last_quote_at,
  };
}

export function summarize(accounts: AdminAccount[], pilotRequests: AdminPilotRequest[], now: Date = new Date()): AdminSummary {
  const activeSince = now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return {
    accounts: accounts.length,
    activeAccounts: accounts.filter((account) => account.lastQuoteAt !== null && Date.parse(account.lastQuoteAt) >= activeSince).length,
    quotes: accounts.reduce((sum, account) => sum + account.quotes.total, 0),
    acceptedQuotes: accounts.reduce((sum, account) => sum + account.quotes.accepted, 0),
    newPilotRequests: pilotRequests.filter((request) => request.status === 'nieuw').length,
  };
}

const DATE_FORMAT = new Intl.DateTimeFormat('nl-BE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Europe/Brussels',
});

export function formatAdminDate(value: string | null): string {
  if (!value) return 'Nooit';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Onbekend' : DATE_FORMAT.format(date);
}

/** Reads everything /beheer shows. Requires the service-role client. */
export async function loadAdminOverview(admin: SupabaseClient) {
  const [overview, pilots] = await Promise.all([
    admin.rpc('admin_account_overview'),
    admin
      .from('pilot_requests')
      .select('id,created_at,name,company,phone,email,region,quotes_per_month,note,status')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (overview.error) throw new Error(`Accountoverzicht laden mislukt: ${overview.error.message}`);

  const accounts = ((overview.data ?? []) as AccountOverviewRow[]).map(toAdminAccount);
  // Pilot sign-ups are secondary: the page still works if that table is unavailable.
  const pilotRequests = pilots.error ? [] : ((pilots.data ?? []) as AdminPilotRequest[]);

  return { accounts, pilotRequests, pilotRequestsFailed: Boolean(pilots.error) };
}
