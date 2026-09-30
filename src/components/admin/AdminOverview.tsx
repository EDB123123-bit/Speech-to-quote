import {
  ACTIVE_WINDOW_DAYS,
  formatAdminDate,
  type AdminAccount,
  type AdminPilotRequest,
  type AdminSummary,
} from '@/lib/admin/overview';
import { REGION_LABELS, VOLUME_LABELS, type PilotQuoteVolume, type PilotRegion } from '@/lib/pilot/request';

type Props = {
  accounts: AdminAccount[];
  pilotRequests: AdminPilotRequest[];
  pilotRequestsFailed: boolean;
  summary: AdminSummary;
};

const PILOT_STATUS: Record<string, { label: string; tone: string }> = {
  nieuw: { label: 'Nieuw', tone: 'is-final' },
  gecontacteerd: { label: 'Gecontacteerd', tone: 'is-neutral' },
  pilot: { label: 'Pilot', tone: 'is-success' },
  afgewezen: { label: 'Afgewezen', tone: 'is-critical' },
};

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** The /beheer view: account list and pilot sign-ups. Presentational only. */
export default function AdminOverview({ accounts, pilotRequests, pilotRequestsFailed, summary }: Props) {
  const stats = [
    { label: 'Accounts', value: summary.accounts },
    { label: `Actief (${ACTIVE_WINDOW_DAYS} dagen)`, value: summary.activeAccounts },
    { label: 'Offertes', value: summary.quotes },
    { label: 'Aanvaard door klant', value: summary.acceptedQuotes },
  ];

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Alleen voor beheerders</p>
          <h1 className="page-title">Accounts en offertes</h1>
          <p className="page-subtitle">
            Wie zich registreerde, wanneer ze laatst actief waren en hoeveel offertes ze maakten.
          </p>
        </div>
      </header>

      <dl className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card flex flex-col justify-between gap-1">
            <dt className="text-sm font-bold text-muted">{stat.label}</dt>
            <dd className="nums text-3xl font-extrabold">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="accounts-heading">
        <h2 id="accounts-heading" className="section-heading">
          {plural(accounts.length, 'account', 'accounts')}
        </h2>
        {accounts.length === 0 ? (
          <div className="empty-state">
            <strong>Nog geen accounts</strong>
            Accounts verschijnen hier zodra iemand zich registreert.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {accounts.map((account) => <AccountCard key={account.id} account={account} />)}
          </ul>
        )}
      </section>

      <section aria-labelledby="pilots-heading" className="mt-12">
        <h2 id="pilots-heading" className="section-heading">
          Pilotaanvragen{pilotRequests.length > 0 ? ` (${pilotRequests.length}, ${summary.newPilotRequests} nieuw)` : ''}
        </h2>
        {pilotRequestsFailed ? (
          <p role="alert" className="alert alert-warning">De pilotaanvragen konden niet geladen worden. De accounts hierboven kloppen wel.</p>
        ) : pilotRequests.length === 0 ? (
          <div className="empty-state">
            <strong>Nog geen pilotaanvragen</strong>
            Aanmeldingen via de website verschijnen hier.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {pilotRequests.map((request) => <PilotCard key={request.id} request={request} />)}
          </ul>
        )}
      </section>
    </main>
  );
}

function AccountCard({ account }: { account: AdminAccount }) {
  const { quotes } = account;
  const breakdown = [
    [quotes.draft, 'concept'],
    [quotes.final, 'afgewerkt'],
    [quotes.sent, 'verstuurd'],
    [quotes.accepted, 'aanvaard'],
  ] as const;

  return (
    <li className="card grid gap-4 md:grid-cols-[minmax(0,1fr)_15rem_13rem] md:items-start">
      <div className="min-w-0">
        <p className="quote-name">{account.companyName ?? 'Geen bedrijfsnaam'}</p>
        <p className="quote-meta break-all">{account.email ?? 'Geen e-mailadres'}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {account.deactivated && <span className="badge badge-critical">Gedeactiveerd</span>}
          {!account.emailConfirmed && <span className="badge badge-warning">E-mail niet bevestigd</span>}
          {quotes.total === 0 && <span className="badge badge-warning">Nog geen offerte</span>}
          {account.mailboxConnected && <span className="badge badge-success">Mailbox verbonden</span>}
          {!account.onboardingDone && <span className="badge badge-neutral">Uitleg niet afgerond</span>}
        </div>
      </div>

      <dl className="order-3 grid grid-cols-3 gap-3 text-sm md:order-2 md:grid-cols-1 md:gap-1">
        <DateItem label="Aangemaakt" value={account.signedUpAt} />
        <DateItem label="Laatste login" value={account.lastSignInAt} />
        <DateItem label="Laatste offerte" value={account.lastQuoteAt} />
      </dl>

      <div className="order-2 md:order-3 md:text-right">
        <p className="quote-amount">{plural(quotes.total, 'offerte', 'offertes')}</p>
        {quotes.total > 0 && (
          <p className="mt-1 text-sm font-semibold text-muted">
            {breakdown.filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`).join(', ')}
          </p>
        )}
        {quotes.byVoice > 0 && (
          <p className="text-sm font-semibold text-muted">{quotes.byVoice} ingesproken</p>
        )}
      </div>
    </li>
  );
}

function DateItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col md:flex-row md:justify-between md:gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="nums font-semibold">{formatAdminDate(value)}</dd>
    </div>
  );
}

function PilotCard({ request }: { request: AdminPilotRequest }) {
  const status = PILOT_STATUS[request.status] ?? { label: request.status, tone: 'is-neutral' };
  const region = REGION_LABELS[request.region as PilotRegion] ?? request.region;
  const volume = request.quotes_per_month ? VOLUME_LABELS[request.quotes_per_month as PilotQuoteVolume] : null;

  return (
    <li className="card grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0">
        <p className="quote-name">{request.company ? `${request.name}, ${request.company}` : request.name}</p>
        <p className="quote-meta">
          {region}{volume ? `. ${volume.charAt(0).toUpperCase()}${volume.slice(1)}.` : ''}
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-semibold">
          <a href={`tel:${request.phone.replace(/[^\d+]/g, '')}`} className="underline underline-offset-2">{request.phone}</a>
          {request.email && <a href={`mailto:${request.email}`} className="break-all underline underline-offset-2">{request.email}</a>}
        </p>
        {request.note && <p className="mt-2 text-sm text-muted">“{request.note}”</p>}
      </div>
      <div className="flex items-center gap-3 md:flex-col md:items-end">
        <span className={`status-pill ${status.tone}`}>{status.label}</span>
        <span className="nums text-sm font-semibold text-muted">{formatAdminDate(request.created_at)}</span>
      </div>
    </li>
  );
}
