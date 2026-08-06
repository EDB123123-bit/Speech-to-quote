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
    <form action={action} className="flex flex-col gap-3 rounded border p-4">
      <h2 className="font-semibold">Klantgegevens</h2>
      <input name="customer_name" required defaultValue={quote.customer_name ?? ''} placeholder="Naam klant" className="rounded border p-3" />
      <input name="customer_address" required defaultValue={quote.customer_address ?? ''} placeholder="Adres" className="rounded border p-3" />
      <input name="customer_email" type="email" defaultValue={quote.customer_email ?? ''} placeholder="E-mailadres (optioneel)" className="rounded border p-3" />
      <input name="customer_phone" defaultValue={quote.customer_phone ?? ''} placeholder="Telefoon (optioneel)" className="rounded border p-3" />
      <button type="submit" className="rounded bg-black p-3 text-white">Klantgegevens opslaan</button>
      {saved && <p className="text-sm text-green-700">Opgeslagen.</p>}
    </form>
  );
}
