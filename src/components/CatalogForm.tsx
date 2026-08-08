'use client';

import { useState } from 'react';
import type { CatalogItem } from '@/lib/supabase/types';
import { formatEuros } from '@/lib/money/totals';
import { createCatalogItem, deleteCatalogItem } from '@/app/instellingen/catalog-actions';

export default function CatalogForm({ items }: { items: CatalogItem[] }) {
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function action(form: FormData) {
    setError(null);
    try {
      await createCatalogItem(form);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt.');
    }
  }

  async function handleDelete(id: string) {
    setDeleteError(null);
    try {
      await deleteCatalogItem(id);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-2">
        {items.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
            Nog geen prijzen ingesteld. Voeg minstens één item toe voordat je een offerte opneemt.
          </li>
        )}
        {items.map((item) => (
          <li key={item.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="nums text-sm text-muted">
                Per {item.unit} · materiaal {formatEuros(item.materials_price_cents)} · arbeid{' '}
                {formatEuros(item.labor_price_cents)} · btw {item.vat_rate === 0.06 ? '6%' : '21%'}
              </p>
            </div>
            <button
              onClick={() => handleDelete(item.id)}
              className="text-sm font-medium text-critical underline underline-offset-2"
              aria-label={`Verwijder ${item.name}`}
            >
              Verwijderen
            </button>
          </li>
        ))}
      </ul>
      {deleteError && <p role="alert" className="alert alert-critical">{deleteError}</p>}

      <form action={action} data-tour="catalog-form" className="card flex flex-col gap-3">
        <h3 className="font-semibold">Nieuw item toevoegen</h3>
        <input name="name" required placeholder="Omschrijving (bv. Dakpannen leggen)" className="field" />
        <input name="unit" required placeholder="Eenheid (bv. m², stuk, uur)" className="field" />
        <input name="materials_price" required inputMode="decimal" placeholder="Materiaalprijs per eenheid (€)" className="field nums" />
        <input name="labor_price" required inputMode="decimal" placeholder="Arbeidsprijs per eenheid (€)" className="field nums" />
        <select name="vat_rate" required defaultValue="" className="field">
          <option value="" disabled>Kies btw-tarief…</option>
          <option value="0.06">6% (renovatie, gebouw ouder dan 10 jaar)</option>
          <option value="0.21">21% (standaardtarief)</option>
        </select>
        {error && <p role="alert" className="alert alert-critical">{error}</p>}
        <button type="submit" className="btn btn-primary">Toevoegen</button>
      </form>
    </div>
  );
}
