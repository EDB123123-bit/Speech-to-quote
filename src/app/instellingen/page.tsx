import { requireContractor } from '@/lib/auth/require-contractor';
import { getMailboxSummary } from '@/lib/mailbox/connection';
import CatalogForm from '@/components/CatalogForm';
import type { CatalogItem, MailboxSummary } from '@/lib/supabase/types';
import ProfileForm from './ProfileForm';
import { disconnectMailbox } from './actions';

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
  const [{ data }, mailbox, params] = await Promise.all([
    supabase.from('catalog_items').select('*').order('name', { ascending: true }),
    getMailboxSummary(contractor.id),
    searchParams,
  ]);
  const mailboxError = params.mailbox_error
    ? MAILBOX_ERRORS[params.mailbox_error] ?? MAILBOX_ERRORS.unexpected
    : null;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Instellingen</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Bedrijfsgegevens</h2>
        <p className="mb-4 text-sm text-gray-600">
          Deze gegevens verschijnen op elke offerte die je genereert.
        </p>
        <ProfileForm contractor={contractor} />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Mailbox</h2>
        <p className="mb-4 text-sm text-gray-600">
          Verstuur afgewerkte offertes vanuit je eigen Gmail- of Outlook-adres.
        </p>

        {params.mailbox === 'connected' && (
          <p role="status" className="mb-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
            Je mailbox is verbonden.
          </p>
        )}
        {mailboxError && (
          <p role="alert" className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {mailboxError}
          </p>
        )}

        <MailboxCard mailbox={mailbox} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Prijslijst</h2>
        <p className="mb-4 text-sm text-gray-600">
          Je eigen prijzen. Deze worden gebruikt om je gesproken beschrijving om te zetten in een offerte.
        </p>
        <CatalogForm items={(data ?? []) as CatalogItem[]} />
      </section>
    </main>
  );
}

function MailboxCard({ mailbox }: { mailbox: MailboxSummary | null }) {
  if (!mailbox) {
    return (
      <div className="rounded border p-4">
        <p className="mb-4 text-sm">Er is nog geen mailbox verbonden.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/mailbox/connect/gmail" className="rounded bg-black px-4 py-2 text-sm text-white">
            Gmail verbinden
          </a>
          <a href="/api/mailbox/connect/outlook" className="rounded border px-4 py-2 text-sm">
            Outlook verbinden
          </a>
        </div>
      </div>
    );
  }

  const provider = mailbox.provider === 'gmail' ? 'Gmail' : 'Outlook';
  const reconnectHref = `/api/mailbox/connect/${mailbox.provider}`;

  return (
    <div className={`rounded border p-4 ${mailbox.status === 'disconnected' ? 'border-amber-300 bg-amber-50' : ''}`}>
      <p className="font-medium">{mailbox.email_address}</p>
      <p className="mt-1 text-sm text-gray-600">
        {provider} · {mailbox.status === 'connected' ? 'Verbonden' : 'Opnieuw verbinden nodig'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={reconnectHref} className="rounded border px-4 py-2 text-sm">
          {mailbox.status === 'connected' ? 'Herverbinden' : 'Opnieuw verbinden'}
        </a>
        <form action={disconnectMailbox}>
          <button type="submit" className="rounded border border-red-300 px-4 py-2 text-sm text-red-700">
            Verbinding verbreken
          </button>
        </form>
      </div>
    </div>
  );
}
