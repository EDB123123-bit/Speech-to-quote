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
  const [signupComplete, setSignupComplete] = useState<{
    email: string;
    requiresEmailConfirmation: boolean;
  } | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();

    const result =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { company_name: companyName },
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          });

    setBusy(false);
    if (result.error) {
      setError('Aanmelden mislukt. Controleer je e-mailadres en wachtwoord.');
      return;
    }

    if (mode === 'signup') {
      setSignupComplete({
        email,
        requiresEmailConfirmation: !result.data.session,
      });
      return;
    }

    router.push('/offertes');
    router.refresh();
  }

  if (signupComplete) {
    return (
      <section className="card flex flex-col gap-4 shadow-[var(--shadow)]" role="status" aria-live="polite">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-bg)] text-xl font-bold text-[var(--success)]" aria-hidden="true">
          ✓
        </div>
        <h2 className="text-2xl font-semibold">Account aangemaakt</h2>
        {signupComplete.requiresEmailConfirmation ? (
          <p className="text-muted">
            We hebben een bevestigingslink gestuurd naar <strong>{signupComplete.email}</strong>.
            Bevestig je e-mailadres via die link en meld je daarna aan.
          </p>
        ) : (
          <p className="text-muted">
            Je account is aangemaakt en je bent meteen aangemeld. Je kunt nu je eerste offerte maken.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            if (!signupComplete.requiresEmailConfirmation) {
              router.push('/offertes');
              router.refresh();
              return;
            }
            setSignupComplete(null);
            setMode('login');
            setPassword('');
          }}
          className="btn btn-primary"
        >
          {signupComplete.requiresEmailConfirmation ? 'Terug naar aanmelden' : 'Naar mijn offertes'}
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-4 shadow-[var(--shadow)]">
      {mode === 'signup' && (
        <label className="flex flex-col gap-2">
          <span className="label">Bedrijfsnaam</span>
          <input
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="field"
          />
        </label>
      )}
      <label className="flex flex-col gap-2">
        <span className="label">E-mailadres</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field"
        />
      </label>
      <label className="flex flex-col gap-2">
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

      <button type="submit" disabled={busy} className="btn btn-primary">
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
