import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. Bypasses RLS — use only for explicitly server-owned
 * operations such as pipeline logs, storage cleanup, and OAuth mailbox
 * credentials. Never expose this client or its key to the browser.
 */
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
