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
          <li className="rounded border border-dashed p-4 text-sm text-gray-600">
            Nog geen prijzen ingesteld. Voeg minstens één item toe voordat je een offerte opneemt.
          </li>
        )}
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-gray-600">
                Per {item.unit} · materiaal {formatEuros(item.materials_price_cents)} · arbeid{' '}
                {formatEuros(item.labor_price_cents)} · btw {item.vat_rate === 0.06 ? '6%' : '21%'}
              </p>
            </div>
            <button
              onClick={() => handleDelete(item.id)}
              className="text-sm text-red-600 underline"
              aria-label={`Verwijder ${item.name}`}
            >
              Verwijderen
            </button>
          </li>
        ))}
      </ul>
      {deleteError && <p role="alert" className="text-sm text-red-600">{deleteError}</p>}

      <form action={action} className="flex flex-col gap-3 rounded border p-4">
        <h3 className="font-semibold">Nieuw item toevoegen</h3>
        <input name="name" required placeholder="Omschrijving (bv. Dakpannen leggen)" className="rounded border p-3" />
        <input name="unit" required placeholder="Eenheid (bv. m², stuk, uur)" className="rounded border p-3" />
        <input name="materials_price" required inputMode="decimal" placeholder="Materiaalprijs per eenheid (€)" className="rounded border p-3" />
        <input name="labor_price" required inputMode="decimal" placeholder="Arbeidsprijs per eenheid (€)" className="rounded border p-3" />
        <select name="vat_rate" required defaultValue="" className="rounded border p-3">
          <option value="" disabled>Kies btw-tarief…</option>
          <option value="0.06">6% (renovatie, gebouw ouder dan 10 jaar)</option>
          <option value="0.21">21% (standaardtarief)</option>
        </select>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-black p-3 text-white">Toevoegen</button>
      </form>
    </div>
  );
}
