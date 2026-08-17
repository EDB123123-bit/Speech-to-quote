'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';

export default function LogoutButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (pathname === '/login') return null;

  async function logout() {
    setBusy(true);
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={busy}
      className="text-sm font-medium text-muted hover:text-critical disabled:opacity-50"
    >
      {busy ? 'Bezig…' : 'Uitloggen'}
    </button>
  );
}
