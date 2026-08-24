import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import { createSupplier } from './actions';
import SupplierFields from '@/components/SupplierFields';

export const dynamic = 'force-dynamic';

export default async function SuppliersPage() {
  const { supabase, contractor } = await requireContractor();
  const { data: suppliers } = await supabase.from('suppliers').select('*').eq('contractor_id', contractor.id).order('company_name');
  return <main className="page-shell">
    <header className="page-header"><div><p className="eyebrow">Operaties</p><h1 className="page-title">Leveranciers</h1><p className="page-subtitle">{suppliers?.length ?? 0} leveranciers</p></div></header>
    <section className="card mb-7">
      <h2 className="section-heading">Leverancier toevoegen</h2>
      <form action={createSupplier} className="mt-4 grid gap-3 md:grid-cols-2">
        <SupplierFields />
        <button className="btn btn-primary md:col-span-2" type="submit">Leverancier opslaan</button>
      </form>
    </section>
    {(!suppliers || suppliers.length === 0) ? <div className="empty-state"><strong>Nog geen leveranciers</strong>Voeg je eerste leverancier toe om materiaal te kunnen groeperen.</div> : <div className="flex flex-col gap-3">{suppliers.map((supplier) => <Link className="card block" key={supplier.id} href={`/leveranciers/${supplier.id}`}><h2 className="text-lg font-extrabold">{supplier.company_name}</h2><p className="text-sm text-muted">{supplier.contact_person || supplier.email || 'Geen contactgegevens'}</p></Link>)}</div>}
  </main>;
}
