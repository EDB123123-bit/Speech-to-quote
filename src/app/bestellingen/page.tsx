import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import type { MaterialRequirement, Quote, Supplier, SupplierOrder, SupplierOrderStatus } from '@/lib/supabase/types';

type OrderRow = SupplierOrder & {
  suppliers: Pick<Supplier, 'id' | 'company_name'>;
  quotes: Pick<Quote, 'id' | 'quote_number' | 'customer_name' | 'quote_kind'>;
};
type LegacyRow = MaterialRequirement & {
  quotes: Pick<Quote, 'id' | 'quote_number' | 'customer_name' | 'quote_kind'>;
  suppliers: Pick<Supplier, 'id' | 'company_name'> | null;
};

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const { supabase, contractor } = await requireContractor();
  const [{ data: orders }, { data: legacyRequirements }, { data: linkedLines }] = await Promise.all([
    supabase.from('supplier_orders').select('*, suppliers!inner(id, company_name), quotes!inner(id, quote_number, customer_name, quote_kind)').eq('contractor_id', contractor.id).is('cancelled_at', null).order('created_at', { ascending: false }),
    supabase.from('material_requirements').select('*, quotes!inner(id, quote_number, customer_name, quote_kind), suppliers(id, company_name)').eq('contractor_id', contractor.id).eq('status', 'ordered').order('updated_at', { ascending: false }),
    supabase.from('supplier_order_lines').select('material_requirement_id').not('material_requirement_id', 'is', null),
  ]);
  const rows = (orders ?? []) as unknown as OrderRow[];
  const linkedIds = new Set((linkedLines ?? []).map((line) => line.material_requirement_id).filter(Boolean));
  const legacyRows = ((legacyRequirements ?? []) as unknown as LegacyRow[]).filter((row) => !linkedIds.has(row.id));

  return <main className="page-shell">
    <header className="page-header"><div><p className="eyebrow">Operaties</p><h1 className="page-title">Bestellingen</h1><p className="page-subtitle">{rows.length} leveranciersbestelling{rows.length === 1 ? '' : 'en'}</p></div><Link href="/te-bestellen" className="btn btn-outline">Naar Te bestellen</Link></header>
    {rows.length === 0 && legacyRows.length === 0 ? <div className="empty-state"><strong>Nog geen bestellingen</strong><p>Maak een conceptbestelling vanuit <Link className="font-bold underline" href="/te-bestellen">Te bestellen</Link>.</p></div> : <div className="flex flex-col gap-3">
      {rows.map((row) => <OrderCard key={row.id} row={row} />)}
    </div>}
    {legacyRows.length > 0 && <section className="mt-8"><h2 className="section-heading">Bestaande materiaalbevestigingen</h2><p className="section-copy">Deze regels waren al als besteld gemarkeerd vóór leveranciersbestellingen beschikbaar waren.</p><div className="flex flex-col gap-3">{legacyRows.map((row) => <LegacyMaterialCard key={row.id} row={row} />)}</div></section>}
  </main>;
}

function OrderCard({ row }: { row: OrderRow }) {
  const status = row.status as SupplierOrderStatus;
  return <article className="card"><div className="flex flex-wrap items-start justify-between gap-3"><div><Link className="text-lg font-extrabold underline" href={`/bestellingen/${row.id}`}>{row.order_number}</Link><p className="text-sm text-muted">{row.suppliers.company_name} · Offerte {row.quotes.quote_number ?? row.quote_id.slice(0, 8).toUpperCase()} · {row.quotes.quote_kind === 'meerwerk' ? 'Meerwerk' : 'Standaard'}</p><Link className="mt-1 inline-block text-sm font-bold underline" href={`/offertes/${row.quote_id}`}>{row.quotes.customer_name ?? 'Klant onbekend'}</Link><p className="mt-1 text-xs text-muted">Aangemaakt {formatDate(row.created_at)}{row.sent_at ? ` · Verzonden ${formatDate(row.sent_at)}` : ''}</p></div><span className={`badge ${status === 'sent' ? 'badge-success' : 'badge-neutral'}`}>{status === 'sent' ? 'Verzonden' : 'Concept'}</span></div><div className="mt-3 flex flex-wrap gap-2"><Link className="btn btn-outline min-h-11" href={`/bestellingen/${row.id}`}>Open bestelling</Link><Link className="btn btn-outline min-h-11" href={`/leveranciers/${row.supplier_id}`}>Leverancier</Link><Link className="btn btn-outline min-h-11" href={`/offertes/${row.quote_id}`}>Offerte</Link></div></article>;
}

function LegacyMaterialCard({ row }: { row: LegacyRow }) {
  return <article className="card"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold">{row.material_description}</h3><p className="text-sm text-muted">{formatQuantity(row.order_quantity)} {row.unit ?? ''} · {row.suppliers?.company_name ?? 'Geen leverancier'} · {row.quotes.quote_kind === 'meerwerk' ? 'Meerwerk' : 'Standaard'}</p><Link className="mt-1 inline-block text-sm font-bold underline" href={`/offertes/${row.quote_id}`}>{row.quotes.quote_number ?? row.quote_id.slice(0, 8).toUpperCase()} · {row.quotes.customer_name ?? 'Klant onbekend'}</Link></div><span className="badge badge-success">Besteld</span></div></article>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('nl-BE', { dateStyle: 'medium' }).format(new Date(value));
}

function formatQuantity(value: number | null): string {
  return value === null ? 'Onbekend' : new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 3 }).format(value);
}
