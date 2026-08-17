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
    <form action={action} className="quote-sidebar-card flex flex-col gap-4">
      <div>
        <h2 className="section-heading">Klantgegevens</h2>
        <p className="m-0 text-sm font-medium leading-relaxed text-muted">Naam en adres komen op de offerte. De rest mag leeg blijven.</p>
      </div>
      <label className="label flex flex-col gap-2">Naam klant
        <input name="customer_name" required defaultValue={quote.customer_name ?? ''} placeholder="Naam klant" className="field" />
      </label>
      <label className="label flex flex-col gap-2">Adres
        <input name="customer_address" required defaultValue={quote.customer_address ?? ''} placeholder="Straat, nummer en gemeente" className="field" />
      </label>
      <label className="label flex flex-col gap-2">E-mail <span className="font-medium text-muted">— nodig om te mailen</span>
        <input name="customer_email" type="email" defaultValue={quote.customer_email ?? ''} placeholder="naam@voorbeeld.be" className="field" />
      </label>
      <label className="label flex flex-col gap-2">Telefoon <span className="font-medium text-muted">— mag leeg</span>
        <input name="customer_phone" inputMode="tel" defaultValue={quote.customer_phone ?? ''} placeholder="0470 00 00 00" className="field" />
      </label>
      <button type="submit" className="btn btn-outline">Klantgegevens opslaan</button>
      {saved && <p className="text-sm font-medium text-success">Opgeslagen.</p>}
    </form>
  );
}
