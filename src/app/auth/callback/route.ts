import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// Landing point for Supabase's email confirmation link (?code=...). The PKCE
// code verifier lives in a cookie set by the browser client at sign-up time,
// so this only succeeds when opened in the same browser; opening the link
// elsewhere (e.g. a webmail app's in-app browser) still leaves the account
// confirmed server-side — the contractor just has to log in normally after.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/offertes`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
