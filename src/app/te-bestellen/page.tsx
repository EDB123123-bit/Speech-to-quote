import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import { updateMaterialRequirement } from './actions';
import { createSupplierOrder } from '@/app/bestellingen/actions';
import SupplierRequirementSelector from '@/components/SupplierRequirementSelector';
import type { MaterialRequirement, Quote, Supplier, SupplierOrderStatus } from '@/lib/supabase/types';

type RequirementRow = MaterialRequirement & { quotes: Pick<Quote, 'id' | 'quote_number' | 'customer_name' | 'quote_kind'>; suppliers: Pick<Supplier, 'id' | 'company_name'> | null };
type Assignment = { material_requirement_id: string; supplier_orders: { id: string; order_number: string; status: SupplierOrderStatus; cancelled_at: string | null } | null };

export const dynamic = 'force-dynamic';

export default async function ToOrderPage() {
  const { supabase, contractor } = await requireContractor();
  const [{ data: rows }, { data: suppliers }, { data: assignments }] = await Promise.all([
    supabase.from('material_requirements').select('*, quotes!inner(id, quote_number, customer_name, quote_kind), suppliers(id, company_name)').eq('contractor_id', contractor.id).eq('status', 'to_order').order('supplier_id', { ascending: true, nullsFirst: true }).order('created_at'),
    supabase.from('suppliers').select('id, company_name').eq('contractor_id', contractor.id).order('company_name'),
    supabase.from('supplier_order_lines').select('material_requirement_id, supplier_orders!inner(id, order_number, status, cancelled_at, contractor_id)').eq('supplier_orders.contractor_id', contractor.id),
  ]);
  const requirements = (rows ?? []) as unknown as RequirementRow[];
  const activeAssignments = new Map<string, Assignment>();
  for (const assignment of ((assignments ?? []) as unknown as Assignment[])) {
    if (assignment.material_requirement_id && assignment.supplier_orders?.cancelled_at === null) {
      activeAssignments.set(assignment.material_requirement_id, assignment);
    }
  }
  const groups = groupBySupplierAndQuote(requirements);
  return <main className="page-shell">
    <header className="page-header"><div><p className="eyebrow">Operaties</p><h1 className="page-title">Te bestellen</h1><p className="page-subtitle">{requirements.length} materiaal{requirements.length === 1 ? 'vereiste' : 'vereisten'} uit aanvaarde offertes</p></div></header>
    {requirements.length === 0 ? <div className="empty-state"><strong>Niets te bestellen</strong>Materiaal verschijnt hier zodra een offerte wordt aanvaard.</div> : <div className="flex flex-col gap-7">{groups.map((group) => {
      const selectableRows = group.rows.filter((row) => !activeAssignments.has(row.id));
      return <section key={group.key}>
        <div className="mb-3 flex items-baseline justify-between gap-3"><h2 className="text-xl font-extrabold">{group.label}</h2><span className="text-sm text-muted">{group.rows.length} {group.rows.length === 1 ? 'lijn' : 'lijnen'}</span></div>
        {group.supplierId && group.quoteId && selectableRows.length > 0 && <SupplierRequirementSelector
          quoteId={group.quoteId}
          quoteNumber={group.quoteNumber}
          supplierId={group.supplierId}
          supplierName={group.supplierName}
          rows={selectableRows}
          action={createSupplierOrder}
        />}
        {group.supplierId && group.quoteId && selectableRows.length === 0 && <p className="mb-3 text-sm font-semibold text-muted">Alle regels in deze groep zijn al aan een conceptbestelling gekoppeld.</p>}
        {!group.supplierId && <p className="mb-3 text-sm font-semibold text-muted">Kies eerst een leverancier en klik op Opslaan om een conceptbestelling te kunnen maken.</p>}
        <div className="flex flex-col gap-3">{group.rows.map((row) => <RequirementCard key={row.id} row={row} assignment={activeAssignments.get(row.id)} suppliers={(suppliers ?? []) as Pick<Supplier, 'id' | 'company_name'>[]} />)}</div>
      </section>;
    })}</div>}
  </main>;
}

function RequirementCard({ row, assignment, suppliers }: { row: RequirementRow; assignment?: Assignment; suppliers: Pick<Supplier, 'id' | 'company_name'>[] }) {
  const action = updateMaterialRequirement.bind(null, row.id);
  return <article className="card"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-extrabold">{row.material_description}</h2><p className="text-sm text-muted">Geciteerd: {formatQuantity(row.quoted_quantity)} {row.unit ?? ''} · {row.quotes.quote_kind === 'meerwerk' ? 'Meerwerk' : 'Standaard'}</p><Link className="mt-1 inline-block text-sm font-bold underline" href={`/offertes/${row.quotes.id}`}>{row.quotes.quote_number} · {row.quotes.customer_name ?? 'Klant onbekend'}</Link>{assignment?.supplier_orders && <Link className="mt-1 block text-sm font-bold underline" href={`/bestellingen/${assignment.supplier_orders.id}`}>In conceptbestelling {assignment.supplier_orders.order_number}</Link>}</div><span className={`badge ${assignment?.supplier_orders ? 'badge-final' : 'badge-warning'}`}>{assignment?.supplier_orders ? 'Toegewezen' : 'Te bestellen'}</span></div><form action={action} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"><label className="label flex flex-col gap-1">Bestelhoeveelheid<input className="field" name="order_quantity" inputMode="decimal" defaultValue={row.order_quantity ?? ''} placeholder="Onbekend" /><span className="text-xs text-muted">Offertehoeveelheid blijft {formatQuantity(row.quoted_quantity)} {row.unit ?? ''}.</span></label><label className="label flex flex-col gap-1">Leverancier<select className="field" name="supplier_id" defaultValue={row.supplier_id ?? ''} disabled={Boolean(assignment?.supplier_orders)}><option value="">Nog niet gekozen</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.company_name}</option>)}</select></label><div className="flex flex-wrap gap-2">{assignment?.supplier_orders ? <Link className="btn btn-outline" href={`/bestellingen/${assignment.supplier_orders.id}`}>Open bestelling</Link> : <button className="btn btn-outline" name="status" value="to_order" type="submit">Opslaan</button>}</div></form></article>;
}

function groupBySupplierAndQuote(rows: RequirementRow[]) {
  const groups = new Map<string, { key: string; label: string; supplierId: string | null; supplierName: string; quoteId: string | null; quoteNumber: string; rows: RequirementRow[] }>();
  for (const row of rows) {
    const supplierKey = row.supplier_id ?? 'unassigned';
    const key = `${supplierKey}:${row.quote_id}`;
    const supplierName = row.suppliers?.company_name ?? 'Nog geen leverancier gekozen';
    const label = row.supplier_id ? `${supplierName} · Offerte ${row.quotes.quote_number ?? row.quote_id.slice(0, 8).toUpperCase()}` : 'Nog geen leverancier gekozen';
    const group = groups.get(key) ?? { key, label, supplierId: row.supplier_id, supplierName, quoteId: row.quote_id, quoteNumber: row.quotes.quote_number ?? row.quote_id.slice(0, 8).toUpperCase(), rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function formatQuantity(value: number | null): string {
  return value === null ? 'Onbekend' : new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 3 }).format(value);
}
