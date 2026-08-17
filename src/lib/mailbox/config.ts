import type { MailboxProvider } from '@/lib/supabase/types';
import { MailboxError } from './errors';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new MailboxError('configuration', `Ontbrekende mailboxconfiguratie: ${name}`);
  }
  return value;
}

export function getAppUrl(requestOrigin: string): string {
  return (process.env.APP_URL?.trim() || requestOrigin).replace(/\/$/, '');
}

export function getRedirectUri(provider: MailboxProvider, requestOrigin: string): string {
  return `${getAppUrl(requestOrigin)}/api/mailbox/connect/${provider}`;
}

export function getGoogleOAuthConfig() {
  return {
    clientId: required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
  };
}

export function getMicrosoftOAuthConfig() {
  return {
    clientId: required('AZURE_CLIENT_ID'),
    clientSecret: required('AZURE_CLIENT_SECRET'),
    tenantId: process.env.AZURE_TENANT_ID?.trim() || 'common',
  };
}
