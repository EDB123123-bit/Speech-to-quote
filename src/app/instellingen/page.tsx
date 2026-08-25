import { requireContractor } from '@/lib/auth/require-contractor';
import { getMailboxSummary } from '@/lib/mailbox/connection';
import CatalogForm from '@/components/CatalogForm';
import type { CatalogItem, MailboxSummary, PipelineStage } from '@/lib/supabase/types';
import ProfileForm from './ProfileForm';
import { disconnectMailbox } from './actions';
import PipelineStagesForm from './PipelineStagesForm';
import CatalogSuggestions from '@/components/CatalogSuggestions';
import OnboardingHelpButton from '@/components/onboarding/OnboardingHelpButton';
import type { CatalogPriceSuggestion } from '@/lib/supabase/types';

const MAILBOX_ERRORS: Record<string, string> = {
  access_denied: 'Je hebt de toegang tot je mailbox geweigerd.',
  invalid_state: 'De verbindingspoging is verlopen. Probeer opnieuw.',
  token_exchange_failed: 'De mailboxprovider kon de verbinding niet voltooien. Probeer opnieuw.',
  no_refresh_token: 'Er werd geen blijvende toegang verleend. Verwijder de bestaande app-toegang bij je mailboxprovider en probeer opnieuw.',
  profile_failed: 'Het e-mailadres van de mailbox kon niet opgehaald worden.',
  db_error: 'De mailboxverbinding kon niet opgeslagen worden.',
  provider_not_configured: 'Deze mailboxprovider is nog niet geconfigureerd voor de website.',
  unexpected: 'Er ging iets onverwachts mis bij het verbinden van de mailbox.',
};

type Props = {
  searchParams: Promise<{ mailbox?: string; mailbox_error?: string }>;
};

export default async function SettingsPage({ searchParams }: Props) {
  const { supabase, contractor } = await requireContractor();
  const [{ data: catalogItems }, { data: stages }, { data: catalogSuggestions }, mailbox, params] = await Promise.all([
    supabase.from('catalog_items').select('*').order('name', { ascending: true }),
    supabase.from('pipeline_stages').select('*').order('sort_order', { ascending: true }),
    supabase.from('catalog_price_suggestions').select('*').eq('status', 'pending').order('updated_at', { ascending: false }),
    getMailboxSummary(contractor.id),
    searchParams,
  ]);
  const mailboxError = params.mailbox_error
    ? MAILBOX_ERRORS[params.mailbox_error] ?? MAILBOX_ERRORS.unexpected
    : null;

  return (
    <main className="page-shell page-medium">
      <header className="page-header">
        <div>
          <p className="eyebrow">Beheer je werkruimte</p>
          <h1 className="page-title">Instellingen</h1>
          <p className="page-subtitle">Je bedrijfsgegevens, prijzen en opvolging op één plek.</p>
        </div>
      </header>

      <nav className="settings-nav" aria-label="Onderdelen van instellingen">
        <a href="#bedrijf">Bedrijf</a>
        <a href="#prijslijst">Prijslijst</a>
        <a href="#mailbox">Mailbox</a>
        <a href="#pijplijnfasen">Pijplijnfasen</a>
        <a href="#uitleg">Uitleg</a>
      </nav>

      <section id="bedrijf" className="settings-section">
        <h2 className="section-heading">Bedrijfsgegevens</h2>
          <p className="section-copy">
          Deze gegevens verschijnen op elke offerte en factuur die je genereert.
        </p>
        <ProfileForm contractor={contractor} />
      </section>

      <section id="prijslijst" className="settings-section">
        <h2 className="section-heading">Prijslijst</h2>
        <p className="section-copy">
          Hiermee zet ik je gesproken beschrijving om in de juiste prijzen.
        </p>
        <CatalogSuggestions suggestions={(catalogSuggestions ?? []) as CatalogPriceSuggestion[]} />
        <CatalogForm items={(catalogItems ?? []) as CatalogItem[]} />
      </section>

      <section id="mailbox" className="settings-section">
        <h2 className="section-heading">Mailbox</h2>
        <p className="section-copy">
          Verstuur afgewerkte offertes vanuit je eigen Gmail- of Outlook-adres.
        </p>

        {params.mailbox === 'connected' && (
          <p role="status" className="alert alert-success mb-4">
            Je mailbox is verbonden.
          </p>
        )}
        {mailboxError && (
          <p role="alert" className="alert alert-critical mb-4">
            {mailboxError}
          </p>
        )}

        <MailboxCard mailbox={mailbox} />
      </section>

      <section id="pijplijnfasen" className="settings-section">
        <h2 className="section-heading">Pijplijnfasen</h2>
        <p className="section-copy">
          De fasen die een offerte doorloopt nadat ze is afgewerkt, zoals je ze wil bijhouden in Pijplijn.
        </p>
        <PipelineStagesForm stages={(stages ?? []) as PipelineStage[]} />
      </section>

      <section id="uitleg" className="settings-section">
        <h2 className="section-heading">Hulp bij de app</h2>
        <p className="section-copy">
          Bekijk de korte uitleg opnieuw wanneer je wilt.
        </p>
        <OnboardingHelpButton className="btn btn-outline" />
      </section>
    </main>
  );
}

function MailboxCard({ mailbox }: { mailbox: MailboxSummary | null }) {
  if (!mailbox) {
    return (
      <div className="card">
        <p className="mb-4 font-semibold">Er is nog geen mailbox verbonden.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/mailbox/connect/gmail" className="btn btn-primary">
            Gmail verbinden
          </a>
          <a href="/api/mailbox/connect/outlook" className="btn btn-outline">
            Outlook verbinden
          </a>
        </div>
      </div>
    );
  }

  const provider = mailbox.provider === 'gmail' ? 'Gmail' : 'Outlook';
  const reconnectHref = `/api/mailbox/connect/${mailbox.provider}`;

  return (
    <div className={`card ${mailbox.status === 'disconnected' ? 'bg-warning-bg' : ''}`}>
      <p className="font-bold">{mailbox.email_address}</p>
      <p className="mt-1 text-sm font-medium text-muted">
        {provider} · {mailbox.status === 'connected' ? 'Verbonden' : 'Opnieuw verbinden nodig'}
      </p>
      {mailbox.provider === 'gmail' && mailbox.status === 'connected' && mailbox.gmail_read_enabled === false && (
        <p className="mt-2 text-sm font-semibold text-warning">Gmail-lezen is nog niet geactiveerd. Verbind Gmail opnieuw om aanvragen te importeren.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={reconnectHref} className="btn btn-outline">
          {mailbox.status === 'connected' ? 'Herverbinden' : 'Opnieuw verbinden'}
        </a>
        <form action={disconnectMailbox}>
          <input type="hidden" name="provider" value={mailbox.provider} />
          <button type="submit" className="btn btn-outline text-critical">
            Verbinding verbreken
          </button>
        </form>
      </div>
    </div>
  );
}
