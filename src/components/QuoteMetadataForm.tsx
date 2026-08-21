'use client';

import { useState } from 'react';
import type { Quote } from '@/lib/supabase/types';
import { saveQuoteMetadata } from '@/app/offertes/quote-actions';

export default function QuoteMetadataForm({ quote }: { quote: Quote }) {
  const [message, setMessage] = useState('');
  async function action(form: FormData) {
    setMessage('');
    try { await saveQuoteMetadata(quote.id, form); setMessage('Opgeslagen.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Opslaan mislukt.'); }
  }
  return <form action={action} className="quote-sidebar-card flex flex-col gap-3">
    <h2 className="section-heading">Offertegegevens</h2>
    <label className="label flex flex-col gap-1">Offertenummer<input className="field" name="quote_number" required defaultValue={quote.quote_number ?? quote.id.split('-')[0].toUpperCase()} /></label>
    <div className="grid grid-cols-2 gap-2"><label className="label flex flex-col gap-1">Datum<input className="field" name="issue_date" type="date" required defaultValue={(quote.issue_date ?? quote.created_at).slice(0, 10)} /></label><label className="label flex flex-col gap-1">Geldig tot<input className="field" name="valid_until" type="date" defaultValue={quote.valid_until ?? ''} /></label></div>
    <label className="label flex flex-col gap-1">Referentie<input className="field" name="order_reference" defaultValue={quote.order_reference ?? ''} /></label>
    <button className="btn btn-outline" type="submit">Offertegegevens opslaan</button>
    {message && <p role="status" className="text-sm text-muted">{message}</p>}
  </form>;
}
