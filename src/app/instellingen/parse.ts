function optional(form: FormData, key: string): string | null {
  const value = (form.get(key) as string | null)?.trim();
  return value ? value : null;
}

export function parseProfileInput(form: FormData) {
  const companyName = (form.get('company_name') as string | null)?.trim() ?? '';
  if (!companyName) throw new Error('Bedrijfsnaam is verplicht');

  return {
    company_name: companyName,
    address: optional(form, 'address'),
    vat_number: optional(form, 'vat_number'),
    phone: optional(form, 'phone'),
  };
}
