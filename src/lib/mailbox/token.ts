import { createAdminSupabase } from '@/lib/supabase/admin';
import type { MailboxConnection } from '@/lib/supabase/types';
import { getMailboxConnection, getMailboxConnectionForProvider, markMailboxDisconnected } from './connection';
import { getGoogleOAuthConfig, getMicrosoftOAuthConfig } from './config';
import { MailboxError } from './errors';

const TOKEN_BUFFER_MS = 5 * 60 * 1000;
const OUTLOOK_SCOPES = 'offline_access Mail.Send User.Read';

export async function getMailboxWithValidToken(userId: string): Promise<MailboxConnection> {
  return getMailboxWithValidConnection(await getMailboxConnection(userId));
}

export async function getMailboxWithValidTokenForProvider(userId: string, provider: MailboxConnection['provider']): Promise<MailboxConnection> {
  return getMailboxWithValidConnection(await getMailboxConnectionForProvider(userId, provider));
}

async function getMailboxWithValidConnection(connection: MailboxConnection | null): Promise<MailboxConnection> {
  if (!connection) {
    throw new MailboxError('not_connected', 'Verbind eerst een mailbox in Instellingen.');
  }
  if (connection.status === 'disconnected') {
    throw new MailboxError(
      'disconnected',
      'De mailboxverbinding is verlopen. Verbind je mailbox opnieuw in Instellingen.',
    );
  }

  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (Number.isFinite(expiresAt) && Date.now() < expiresAt - TOKEN_BUFFER_MS) {
    return connection;
  }

  const isGmail = connection.provider === 'gmail';
  const google = isGmail ? getGoogleOAuthConfig() : null;
  const microsoft = isGmail ? null : getMicrosoftOAuthConfig();
  const tokenUrl = isGmail
    ? 'https://oauth2.googleapis.com/token'
    : `https://login.microsoftonline.com/${microsoft!.tenantId}/oauth2/v2.0/token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
      client_id: isGmail ? google!.clientId : microsoft!.clientId,
      client_secret: isGmail ? google!.clientSecret : microsoft!.clientSecret,
      ...(isGmail ? {} : { scope: OUTLOOK_SCOPES }),
    }).toString(),
  });

  if (!response.ok) {
    await markMailboxDisconnected(connection.id);
    throw new MailboxError(
      'refresh_failed',
      'De mailboxverbinding kon niet vernieuwd worden. Verbind je mailbox opnieuw.',
    );
  }

  const tokens = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };
  if (!tokens.access_token || !tokens.expires_in) {
    await markMailboxDisconnected(connection.id);
    throw new MailboxError('refresh_failed', 'De mailboxprovider gaf geen geldig toegangstoken.');
  }

  const updated = {
    ...connection,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || connection.refresh_token,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    status: 'connected' as const,
    oauth_scope: tokens.scope || connection.oauth_scope || null,
    gmail_read_enabled: isGmail
      ? (tokens.scope || connection.oauth_scope || '').split(/\s+/u).includes('https://www.googleapis.com/auth/gmail.readonly')
      : false,
    updated_at: new Date().toISOString(),
  };

  const { error } = await createAdminSupabase()
    .from('mailbox_connections')
    .update({
      access_token: updated.access_token,
      refresh_token: updated.refresh_token,
      token_expires_at: updated.token_expires_at,
      status: updated.status,
      oauth_scope: updated.oauth_scope,
      gmail_read_enabled: updated.gmail_read_enabled,
      updated_at: updated.updated_at,
    })
    .eq('id', connection.id);

  if (error) throw new Error(`Vernieuwd mailboxtoken opslaan mislukt: ${error.message}`);
  return updated;
}
