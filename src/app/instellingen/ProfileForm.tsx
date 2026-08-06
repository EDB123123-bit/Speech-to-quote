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
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Bedrijfsnaam</span>
        <input name="company_name" required defaultValue={contractor.company_name} className="rounded border p-3" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Adres</span>
        <input name="address" defaultValue={contractor.address ?? ''} className="rounded border p-3" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">BTW-nummer</span>
        <input name="vat_number" defaultValue={contractor.vat_number ?? ''} placeholder="BE0123456789" className="rounded border p-3" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Telefoonnummer</span>
        <input name="phone" defaultValue={contractor.phone ?? ''} className="rounded border p-3" />
      </label>

      <button type="submit" disabled={status === 'saving'} className="rounded bg-black p-3 text-white disabled:opacity-50">
        {status === 'saving' ? 'Bezig met opslaan…' : 'Opslaan'}
      </button>

      {status === 'saved' && <p className="text-sm text-green-700">Gegevens opgeslagen.</p>}
      {status === 'error' && <p role="alert" className="text-sm text-red-600">Opslaan mislukt. Probeer opnieuw.</p>}
    </form>
  );
}
