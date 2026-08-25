function optional(form: FormData, key: string): string | null {
  const value = (form.get(key) as string | null)?.trim();
  return value ? value : null;
}

export function parseProfileInput(form: FormData) {
  const companyName = (form.get('company_name') as string | null)?.trim() ?? '';
  if (!companyName) throw new Error('Bedrijfsnaam is verplicht');

  const base = {
    company_name: companyName,
    address: optional(form, 'address'),
    vat_number: optional(form, 'vat_number'),
    phone: optional(form, 'phone'),
  };
  // Preserve the small legacy parser contract for callers that only submit
  // the original profile fields; the settings form includes the extended
  // invoicing fields and receives those in the update payload.
  if (!form.has('legal_form') && !form.has('registration_number') && !form.has('street') && !form.has('iban')) return base;
  return {
    ...base,
    legal_form: optional(form, 'legal_form'),
    registration_number: optional(form, 'registration_number'),
    street: optional(form, 'street'),
    postal_code: optional(form, 'postal_code'),
    city: optional(form, 'city'),
    country_code: (optional(form, 'country_code') ?? 'BE').toUpperCase(),
    email: optional(form, 'email'),
    iban: optional(form, 'iban'),
    invoice_prefix: (optional(form, 'invoice_prefix') ?? 'STQ').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || 'STQ',
    default_payment_term_days: Math.max(0, Math.min(365, Number(optional(form, 'default_payment_term_days') ?? '30') || 30)),
  };
}
