'use client';

import { useState } from 'react';
import { formatEuros } from '@/lib/money/totals';
import type { CatalogPriceSuggestion } from '@/lib/supabase/types';
import { reviewCatalogSuggestion } from '@/app/offertes/importeren/actions';

export default function CatalogSuggestions({ suggestions }: { suggestions: CatalogPriceSuggestion[] }) {
  const [visible, setVisible] = useState(suggestions);
  const [error, setError] = useState('');
  if (!visible.length) return null;
  async function decide(suggestion: CatalogPriceSuggestion, accept: boolean, form?: FormData) {
    setError('');
    try {
      await reviewCatalogSuggestion({ suggestionId: suggestion.id, accept, values: accept ? {
        name: String(form?.get('name') ?? suggestion.suggested_name), unit: String(form?.get('unit') ?? suggestion.unit),
        unitCode: String(form?.get('unit_code') ?? suggestion.unit_code), priceCents: Math.round(Number(form?.get('price') ?? suggestion.latest_price_cents / 100) * 100), vatRate: suggestion.vat_rate,
      } : null });
      setVisible((current) => current.filter((item) => item.id !== suggestion.id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Verwerken mislukt.'); }
  }
  return <section className="mb-6"><h3 className="mb-2 text-lg font-extrabold">Suggesties uit geïmporteerde offertes</h3><p className="mb-4 text-sm text-muted">Controleer elke observatie. Bestaande prijzen worden nooit gewijzigd.</p><div className="flex flex-col gap-3">{visible.map((suggestion) => <form key={suggestion.id} action={(form) => decide(suggestion, true, form)} className="card grid gap-3 sm:grid-cols-4"><input name="name" className="field sm:col-span-2" defaultValue={suggestion.suggested_name} /><input name="unit" className="field" defaultValue={suggestion.unit} /><select name="unit_code" className="field" defaultValue={suggestion.unit_code}>{['MTK','HUR','C62','MTR','KGM'].map((code) => <option key={code}>{code}</option>)}</select><label className="label flex flex-col gap-1">Prijs (€)<input name="price" className="field" inputMode="decimal" defaultValue={(suggestion.latest_price_cents / 100).toFixed(2)} /></label><p className="self-center text-sm text-muted sm:col-span-2">{suggestion.observation_count}× · bereik {formatEuros(suggestion.minimum_price_cents)}–{formatEuros(suggestion.maximum_price_cents)}</p><div className="flex gap-2"><button className="btn btn-primary" type="submit">Toevoegen</button><button className="btn btn-outline" type="button" onClick={() => void decide(suggestion, false)}>Afwijzen</button></div></form>)}</div>{error && <p className="alert alert-critical mt-3">{error}</p>}</section>;
}
