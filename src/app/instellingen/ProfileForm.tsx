'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import type { Contractor } from '@/lib/supabase/types';
import { saveProfile } from './actions';

export default function ProfileForm({ contractor }: { contractor: Contractor }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const requiredFields = useMemo(() => [
    { key: 'company_name', label: 'Bedrijfsnaam', value: contractor.company_name },
    { key: 'street', label: 'Straat en nummer', value: contractor.street ?? contractor.address },
    { key: 'postal_code', label: 'Postcode', value: contractor.postal_code },
    { key: 'city', label: 'Gemeente', value: contractor.city },
    { key: 'vat_number', label: 'BTW-nummer', value: contractor.vat_number },
    { key: 'registration_number', label: 'KBO-nummer', value: contractor.registration_number },
    { key: 'legal_form', label: 'Rechtsvorm', value: contractor.legal_form },
    { key: 'email', label: 'Facturatie-e-mail', value: contractor.email },
    { key: 'iban', label: 'IBAN', value: contractor.iban },
  ], [contractor]);
  const [missing, setMissing] = useState(() => new Set(requiredFields.filter((field) => !field.value?.trim()).map((field) => field.key)));

  function onFieldChange(event: ChangeEvent<HTMLInputElement>) {
    const key = event.currentTarget.name;
    if (!requiredFields.some((field) => field.key === key)) return;
    const hasValue = event.currentTarget.value.trim().length > 0;
    setMissing((current) => {
      const next = new Set(current);
      if (hasValue) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function fieldClass(key: string) {
    return `field ${missing.has(key) ? 'needs-attention' : ''}`;
  }

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
      <div role="status" className="alert alert-warning sm:col-span-2">
        <strong>Facturatieprofiel: verplichte velden</strong>
        <p className="mt-1">Velden met een * en een gele rand zijn nodig voordat je een factuur kunt uitgeven.</p>
        {missing.size > 0 && <p className="mt-2 font-bold">Nog in te vullen: {requiredFields.filter((field) => missing.has(field.key)).map((field) => field.label).join(', ')}.</p>}
      </div>
      <label className="flex flex-col gap-2 sm:col-span-2">
        <span className="label">Bedrijfsnaam *</span>
        <input name="company_name" required defaultValue={contractor.company_name} onChange={onFieldChange} className={fieldClass('company_name')} />
      </label>
      <label className="flex flex-col gap-2 sm:col-span-2">
        <span className="label">Adres</span>
        <input name="address" defaultValue={contractor.address ?? ''} className="field" />
      </label>
      <p className="section-copy sm:col-span-2">Voor facturen hebben we ook een gestructureerd adres, je KBO-nummer en betaalgegevens nodig.</p>
      <label className="flex flex-col gap-2 sm:col-span-2"><span className="label">Straat en nummer *</span><input name="street" required defaultValue={contractor.street ?? contractor.address ?? ''} onChange={onFieldChange} className={fieldClass('street')} /></label>
      <label className="flex flex-col gap-2"><span className="label">Postcode *</span><input name="postal_code" required defaultValue={contractor.postal_code ?? ''} onChange={onFieldChange} className={`${fieldClass('postal_code')} nums`} /></label>
      <label className="flex flex-col gap-2"><span className="label">Gemeente *</span><input name="city" required defaultValue={contractor.city ?? ''} onChange={onFieldChange} className={fieldClass('city')} /></label>
      <label className="flex flex-col gap-2">
        <span className="label">BTW-nummer *</span>
        <input name="vat_number" required defaultValue={contractor.vat_number ?? ''} onChange={onFieldChange} placeholder="BE0123456789" className={`${fieldClass('vat_number')} nums`} />
      </label>
      <label className="flex flex-col gap-2"><span className="label">KBO-nummer *</span><input name="registration_number" required defaultValue={contractor.registration_number ?? ''} onChange={onFieldChange} placeholder="0123.456.789" className={`${fieldClass('registration_number')} nums`} /></label>
      <label className="flex flex-col gap-2"><span className="label">Rechtsvorm *</span><input name="legal_form" required defaultValue={contractor.legal_form ?? ''} onChange={onFieldChange} placeholder="bv" className={fieldClass('legal_form')} /></label>
      <label className="flex flex-col gap-2">
        <span className="label">Telefoonnummer</span>
        <input name="phone" defaultValue={contractor.phone ?? ''} className="field nums" />
      </label>
      <label className="flex flex-col gap-2"><span className="label">Facturatie-e-mail *</span><input name="email" required type="email" defaultValue={contractor.email ?? ''} onChange={onFieldChange} className={fieldClass('email')} /></label>
      <label className="flex flex-col gap-2"><span className="label">IBAN *</span><input name="iban" required defaultValue={contractor.iban ?? ''} onChange={onFieldChange} placeholder="BE00 0000 0000 0000" className={`${fieldClass('iban')} nums`} /></label>
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
