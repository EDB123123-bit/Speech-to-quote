import {
  createAdminSupabase,
  hasAdminSupabaseConfig,
  SupabaseAdminConfigError,
} from '@/lib/supabase/admin';
import type { MailboxConnection, MailboxSummary } from '@/lib/supabase/types';

export async function getMailboxSummary(userId: string): Promise<MailboxSummary | null> {
  // Mailbox integration is optional. Pages that show a connection badge must
  // remain usable when only the public Supabase configuration is present.
  if (!hasAdminSupabaseConfig()) return null;

  const { data, error } = await createAdminSupabase()
    .from('mailbox_connections')
    .select('provider,email_address,status,connected_at,is_default,gmail_read_enabled')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  if (error) throw new Error(`Mailboxstatus ophalen mislukt: ${error.message}`);
  return data as MailboxSummary | null;
}

export async function getMailboxConnection(userId: string): Promise<MailboxConnection | null> {
  if (!hasAdminSupabaseConfig()) throw new SupabaseAdminConfigError();

  const { data, error } = await createAdminSupabase()
    .from('mailbox_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();

  if (error) throw new Error(`Mailbox ophalen mislukt: ${error.message}`);
  return data as MailboxConnection | null;
}

export async function getMailboxConnectionForProvider(userId: string, provider: MailboxConnection['provider']): Promise<MailboxConnection | null> {
  if (!hasAdminSupabaseConfig()) throw new SupabaseAdminConfigError();
  const { data, error } = await createAdminSupabase()
    .from('mailbox_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw new Error(`Mailbox ophalen mislukt: ${error.message}`);
  return data as MailboxConnection | null;
}

export async function disconnectMailboxConnection(userId: string, provider?: MailboxConnection['provider']): Promise<void> {
  if (!hasAdminSupabaseConfig()) throw new SupabaseAdminConfigError();

  let query = createAdminSupabase().from('mailbox_connections').delete().eq('user_id', userId);
  if (provider) query = query.eq('provider', provider);
  const { error } = await query;

  if (error) throw new Error(`Mailbox loskoppelen mislukt: ${error.message}`);
}

export async function markMailboxDisconnected(connectionId: string): Promise<void> {
  // This is best-effort cleanup after a failed token refresh. Do not turn a
  // missing optional server credential into a second application failure.
  if (!hasAdminSupabaseConfig()) {
    console.warn(
      '[mailbox] cannot mark connection disconnected: Supabase service-role configuration is missing',
    );
    return;
  }

  const { error } = await createAdminSupabase()
    .from('mailbox_connections')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('id', connectionId);

  if (error) console.error('[mailbox] disconnected status update failed', error.message);
}
