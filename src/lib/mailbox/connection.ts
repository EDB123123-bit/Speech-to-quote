import { createAdminSupabase } from '@/lib/supabase/admin';
import type { MailboxConnection, MailboxSummary } from '@/lib/supabase/types';

export async function getMailboxSummary(userId: string): Promise<MailboxSummary | null> {
  const { data, error } = await createAdminSupabase()
    .from('mailbox_connections')
    .select('provider,email_address,status,connected_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Mailboxstatus ophalen mislukt: ${error.message}`);
  return data as MailboxSummary | null;
}

export async function getMailboxConnection(userId: string): Promise<MailboxConnection | null> {
  const { data, error } = await createAdminSupabase()
    .from('mailbox_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(`Mailbox ophalen mislukt: ${error.message}`);
  return data as MailboxConnection | null;
}

export async function disconnectMailboxConnection(userId: string): Promise<void> {
  const { error } = await createAdminSupabase()
    .from('mailbox_connections')
    .delete()
    .eq('user_id', userId);

  if (error) throw new Error(`Mailbox loskoppelen mislukt: ${error.message}`);
}

export async function markMailboxDisconnected(connectionId: string): Promise<void> {
  const { error } = await createAdminSupabase()
    .from('mailbox_connections')
    .update({ status: 'disconnected', updated_at: new Date().toISOString() })
    .eq('id', connectionId);

  if (error) console.error('[mailbox] disconnected status update failed', error.message);
}
