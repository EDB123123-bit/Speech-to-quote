'use client';

import { useState } from 'react';

type Row = {
  id: string;
  material_description: string;
  order_quantity: number | null;
  quoted_quantity: number | null;
  unit: string | null;
};

type Props = {
  quoteId: string;
  quoteNumber: string;
  supplierId: string;
  supplierName: string;
  rows: Row[];
  action: (formData: FormData) => void;
};

export default function SupplierRequirementSelector({ quoteId, quoteNumber, supplierId, supplierName, rows, action }: Props) {
  const [selected, setSelected] = useState(() => new Set(rows.map((row) => row.id)));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={action} className="card mb-3 border-2 border-dashed border-border bg-paper">
      <input type="hidden" name="quote_id" value={quoteId} />
      <input type="hidden" name="supplier_id" value={supplierId} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-muted">Conceptbestelling voor {supplierName}</p>
          <p className="text-sm text-muted">Offerte {quoteNumber} · selecteer alleen regels uit deze offerte.</p>
        </div>
        <button className="btn btn-outline min-h-12" type="submit" disabled={selected.size === 0}>
          Conceptbestelling maken ({selected.size})
        </button>
      </div>
      <div className="mt-3 grid gap-2">
        {rows.map((row) => (
          <label key={row.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2 text-sm font-semibold">
            <input
              type="checkbox"
              name="requirement_ids"
              value={row.id}
              checked={selected.has(row.id)}
              onChange={() => toggle(row.id)}
              className="h-5 w-5"
            />
            <span className="min-w-0 flex-1">{row.material_description}</span>
            <span className="text-muted">{formatQuantity(row.order_quantity ?? row.quoted_quantity)} {row.unit ?? ''}</span>
          </label>
        ))}
      </div>
    </form>
  );
}

function formatQuantity(value: number | null): string {
  return value === null ? 'Onbekend' : new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 3 }).format(value);
}
