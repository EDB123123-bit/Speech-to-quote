'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();

    const { error: authError } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { company_name: companyName } },
          });

    setBusy(false);
    if (authError) {
      setError('Aanmelden mislukt. Controleer je e-mailadres en wachtwoord.');
      return;
    }
    router.push('/offertes');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-4">
      {mode === 'signup' && (
        <label className="flex flex-col gap-1">
          <span className="label">Bedrijfsnaam</span>
          <input
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="field"
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="label">E-mailadres</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="label">Wachtwoord</span>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field"
        />
      </label>

      {error && <p role="alert" className="alert alert-critical">{error}</p>}

      <button type="submit" disabled={busy} className="btn btn-accent">
        {busy ? 'Bezig…' : mode === 'login' ? 'Aanmelden' : 'Account aanmaken'}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        className="text-sm font-medium text-muted underline underline-offset-2 hover:text-ink"
      >
        {mode === 'login' ? 'Nog geen account? Registreer je hier.' : 'Al een account? Meld je aan.'}
      </button>
    </form>
  );
}
