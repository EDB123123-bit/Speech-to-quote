'use client';

import { useState } from 'react';
import type { CatalogItem } from '@/lib/supabase/types';
import { formatEuros } from '@/lib/money/totals';
import { createCatalogItem, deleteCatalogItem } from '@/app/instellingen/catalog-actions';
import Icon from '@/components/ui/Icon';

export default function CatalogForm({ items }: { items: CatalogItem[] }) {
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const filteredItems = items.filter((item) => item.name.toLocaleLowerCase('nl-BE').includes(query.toLocaleLowerCase('nl-BE')));

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
    <div className="flex flex-col gap-5">
      {items.length > 3 && (
        <label className="search-field">
          <span className="sr-only">Zoek in je prijzen</span>
          <Icon name="search" size={20} />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek in je prijzen" />
        </label>
      )}
      <ul className="flex flex-col gap-2">
        {items.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
            Nog geen prijzen ingesteld. Voeg minstens één item toe voordat je een offerte opneemt.
          </li>
        )}
        {filteredItems.map((item) => (
          <li key={item.id} className="catalog-row">
            <div>
              <p className="catalog-name">{item.name}</p>
            <p className="catalog-meta nums">
                {item.pricing_mode === 'combined'
                  ? `gecombineerde prijs · ${item.vat_rate === 0.06 ? '6%' : '21%'} btw`
                  : `materiaal ${formatEuros(item.materials_price_cents ?? 0)} · arbeid ${formatEuros(item.labor_price_cents ?? 0)} · ${item.vat_rate === 0.06 ? '6%' : '21%'} btw`} · code {item.unit_code ?? 'automatisch'}
              </p>
            </div>
            <div>
              <p className="catalog-price nums">{formatEuros(item.pricing_mode === 'combined' ? item.combined_price_cents ?? 0 : (item.materials_price_cents ?? 0) + (item.labor_price_cents ?? 0))}<span className="catalog-unit">per {item.unit}</span></p>
              <button type="button" onClick={() => handleDelete(item.id)} className="mt-2 text-sm font-bold text-critical underline underline-offset-2" aria-label={`Verwijder ${item.name}`}>Verwijderen</button>
            </div>
          </li>
        ))}
      </ul>
      {deleteError && <p role="alert" className="alert alert-critical">{deleteError}</p>}

      <details className="card" data-tour="catalog-form">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 text-lg font-extrabold"><Icon name="plus" size={21} /> Prijs toevoegen</summary>
      <form action={action} className="mt-5 grid gap-3 sm:grid-cols-2">
        <h3 className="sr-only">Nieuw item toevoegen</h3>
        <div className="sm:col-span-2"><input name="name" required placeholder="Omschrijving (bv. Dakpannen leggen)" className="field" /></div>
        <input name="unit" required placeholder="Eenheid (bv. m², stuk, uur)" className="field" />
        <select name="unit_code" defaultValue="" className="field">
          <option value="">Eenheidscode automatisch bepalen</option>
          <option value="MTK">MTK · m²</option>
          <option value="HUR">HUR · uur</option>
          <option value="C62">C62 · stuk</option>
          <option value="MTR">MTR · meter</option>
          <option value="KGM">KGM · kilogram</option>
        </select>
        <input name="materials_price" required inputMode="decimal" placeholder="Materiaalprijs per eenheid (€)" className="field nums" />
        <input name="labor_price" required inputMode="decimal" placeholder="Arbeidsprijs per eenheid (€)" className="field nums" />
        <select name="vat_rate" required defaultValue="" className="field sm:col-span-2">
          <option value="" disabled>Kies btw-tarief…</option>
          <option value="0.06">6% (renovatie, gebouw ouder dan 10 jaar)</option>
          <option value="0.21">21% (standaardtarief)</option>
        </select>
        {error && <p role="alert" className="alert alert-critical sm:col-span-2">{error}</p>}
        <button type="submit" className="btn btn-primary sm:col-span-2">Prijs toevoegen</button>
      </form>
      </details>
    </div>
  );
}
