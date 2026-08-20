import { createClient } from '@supabase/supabase-js';

export class SupabaseAdminConfigError extends Error {
  constructor() {
    super(
      'Supabase service-role configuratie ontbreekt. Voeg SUPABASE_SERVICE_ROLE_KEY toe aan de serveromgeving.',
    );
    this.name = 'SupabaseAdminConfigError';
  }
}

/**
 * Whether the server-only client can be constructed. This is intentionally
 * separate from the public Supabase configuration: service-role access is
 * optional for pages that only display mailbox connection state, but required
 * for mailbox and other server-owned operations.
 */
export function hasAdminSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

/**
 * Service-role client. Bypasses RLS — use only for explicitly server-owned
 * operations such as pipeline logs, storage cleanup, and OAuth mailbox
 * credentials. Never expose this client or its key to the browser.
 */
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new SupabaseAdminConfigError();
  }

  return createClient(
    url,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
