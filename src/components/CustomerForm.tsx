'use client';

import { useState } from 'react';
import type { Quote } from '@/lib/supabase/types';
import { saveCustomerDetails } from '@/app/offertes/[id]/customer-actions';

export default function CustomerForm({ quote }: { quote: Quote }) {
  const [saved, setSaved] = useState(false);

  async function action(form: FormData) {
    await saveCustomerDetails(quote.id, form);
    setSaved(true);
  }

  return (
    <form action={action} className="card flex flex-col gap-3">
      <h2 className="font-semibold">Klantgegevens</h2>
      <input name="customer_name" required defaultValue={quote.customer_name ?? ''} placeholder="Naam klant" className="field" />
      <input name="customer_address" required defaultValue={quote.customer_address ?? ''} placeholder="Adres" className="field" />
      <input name="customer_email" type="email" defaultValue={quote.customer_email ?? ''} placeholder="E-mailadres (optioneel)" className="field" />
      <input name="customer_phone" defaultValue={quote.customer_phone ?? ''} placeholder="Telefoon (optioneel)" className="field" />
      <button type="submit" className="btn btn-primary">Klantgegevens opslaan</button>
      {saved && <p className="text-sm font-medium text-success">Opgeslagen.</p>}
    </form>
  );
}
