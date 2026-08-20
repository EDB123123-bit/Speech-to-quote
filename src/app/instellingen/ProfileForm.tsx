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
      <p className="section-copy sm:col-span-2">Voor facturen hebben we ook een gestructureerd adres, je KBO-nummer en betaalgegevens nodig.</p>
      <label className="flex flex-col gap-2 sm:col-span-2"><span className="label">Straat en nummer</span><input name="street" defaultValue={contractor.street ?? ''} className="field" /></label>
      <label className="flex flex-col gap-2"><span className="label">Postcode</span><input name="postal_code" defaultValue={contractor.postal_code ?? ''} className="field nums" /></label>
      <label className="flex flex-col gap-2"><span className="label">Gemeente</span><input name="city" defaultValue={contractor.city ?? ''} className="field" /></label>
      <label className="flex flex-col gap-2">
        <span className="label">BTW-nummer</span>
        <input name="vat_number" defaultValue={contractor.vat_number ?? ''} placeholder="BE0123456789" className="field nums" />
      </label>
      <label className="flex flex-col gap-2"><span className="label">KBO-nummer</span><input name="registration_number" defaultValue={contractor.registration_number ?? ''} placeholder="0123.456.789" className="field nums" /></label>
      <label className="flex flex-col gap-2"><span className="label">Rechtsvorm</span><input name="legal_form" defaultValue={contractor.legal_form ?? ''} placeholder="bv" className="field" /></label>
      <label className="flex flex-col gap-2"><span className="label">RPR</span><input name="rpr" defaultValue={contractor.rpr ?? ''} placeholder="RPR Gent, afdeling Gent" className="field" /></label>
      <label className="flex flex-col gap-2">
        <span className="label">Telefoonnummer</span>
        <input name="phone" defaultValue={contractor.phone ?? ''} className="field nums" />
      </label>
      <label className="flex flex-col gap-2"><span className="label">Facturatie-e-mail</span><input name="email" type="email" defaultValue={contractor.email ?? ''} className="field" /></label>
      <label className="flex flex-col gap-2"><span className="label">IBAN</span><input name="iban" defaultValue={contractor.iban ?? ''} placeholder="BE00 0000 0000 0000" className="field nums" /></label>
      <label className="flex flex-col gap-2"><span className="label">Factuurnummer-prefix</span><input name="invoice_prefix" defaultValue={contractor.invoice_prefix ?? 'STQ'} className="field nums" /></label>
      <label className="flex flex-col gap-2"><span className="label">Standaard betaaltermijn (dagen)</span><input name="default_payment_term_days" type="number" min="0" max="365" defaultValue={contractor.default_payment_term_days ?? 30} className="field nums" /></label>

      <button type="submit" disabled={status === 'saving'} className="btn btn-primary sm:col-span-2">
        {status === 'saving' ? 'Bezig met opslaan…' : 'Opslaan'}
      </button>

      {status === 'saved' && <p className="alert alert-success sm:col-span-2">Gegevens opgeslagen.</p>}
      {status === 'error' && <p role="alert" className="alert alert-critical sm:col-span-2">Opslaan mislukt. Probeer opnieuw.</p>}
    </form>
  );
}
