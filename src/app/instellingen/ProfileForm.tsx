'use client';

import { useState } from 'react';
import type { Contractor } from '@/lib/supabase/types';
import { saveProfile } from './actions';

export default function ProfileForm({ contractor }: { contractor: Contractor }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function action(form: FormData) {
    setStatus('saving');
    try {
      await saveProfile(form);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <form action={action} className="card grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-2 sm:col-span-2">
        <span className="label">Bedrijfsnaam</span>
        <input name="company_name" required defaultValue={contractor.company_name} className="field" />
      </label>
      <label className="flex flex-col gap-2 sm:col-span-2">
        <span className="label">Adres</span>
        <input name="address" defaultValue={contractor.address ?? ''} className="field" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="label">BTW-nummer</span>
        <input name="vat_number" defaultValue={contractor.vat_number ?? ''} placeholder="BE0123456789" className="field nums" />
      </label>
      <label className="flex flex-col gap-2">
        <span className="label">Telefoonnummer</span>
        <input name="phone" defaultValue={contractor.phone ?? ''} className="field nums" />
      </label>

      <button type="submit" disabled={status === 'saving'} className="btn btn-primary sm:col-span-2">
        {status === 'saving' ? 'Bezig met opslaan…' : 'Opslaan'}
      </button>

      {status === 'saved' && <p className="alert alert-success sm:col-span-2">Gegevens opgeslagen.</p>}
      {status === 'error' && <p role="alert" className="alert alert-critical sm:col-span-2">Opslaan mislukt. Probeer opnieuw.</p>}
    </form>
  );
}
