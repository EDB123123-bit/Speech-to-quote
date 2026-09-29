import { notFound } from 'next/navigation';
import { createAdminSupabase, hasAdminSupabaseConfig } from '@/lib/supabase/admin';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Whether a signed-in user may open /beheer. Admins are listed in the
 * server-only app_admins table; any failure counts as "not an admin".
 */
export async function isAppAdmin(userId: string): Promise<boolean> {
  if (!hasAdminSupabaseConfig()) return false;
  try {
    const { data, error } = await createAdminSupabase()
      .from('app_admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    return !error && data !== null;
  } catch {
    return false;
  }
}

/**
 * Admin pages answer 404 to everyone else, so their existence is not
 * revealed. Returns the service-role client for the admin's queries.
 */
export async function requireAdmin() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user || !(await isAppAdmin(data.user.id))) notFound();

  return { admin: createAdminSupabase(), userId: data.user.id };
}
