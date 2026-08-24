import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import { deleteSupplier, updateSupplier } from '../actions';
import SupplierFields from '@/components/SupplierFields';

export const dynamic = 'force-dynamic';

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, contractor } = await requireContractor();
  const [{ data: supplier }, { count: requirementCount }] = await Promise.all([
    supabase.from('suppliers').select('*').eq('id', id).eq('contractor_id', contractor.id).maybeSingle(),
    supabase.from('material_requirements').select('id', { count: 'exact', head: true }).eq('supplier_id', id).eq('contractor_id', contractor.id),
  ]);
  if (!supplier) notFound();
  return <main className="page-shell page-narrow">
    <Link href="/leveranciers" className="back-link">← Terug naar leveranciers</Link>
    <header className="mb-6"><p className="eyebrow">Leverancier</p><h1 className="page-title">{supplier.company_name}</h1><p className="page-subtitle">{requirementCount ?? 0} materiaalvereisten gekoppeld</p></header>
    <form action={updateSupplier.bind(null, id)} className="card grid gap-3 md:grid-cols-2"><SupplierFields supplier={supplier as Record<string, unknown>} /><button className="btn btn-primary md:col-span-2" type="submit">Opslaan</button></form>
    <section className="card mt-6"><h2 className="section-heading">Leverancier verwijderen</h2><p className="mt-2 text-sm text-muted">Gekoppelde materiaalvereisten blijven bestaan en verliezen alleen deze leverancier.</p><form action={deleteSupplier.bind(null, id)} className="mt-4"><button className="btn btn-danger" type="submit">Verwijderen</button></form></section>
  </main>;
}
