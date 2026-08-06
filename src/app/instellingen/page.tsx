import { requireContractor } from '@/lib/auth/require-contractor';
import CatalogForm from '@/components/CatalogForm';
import type { CatalogItem } from '@/lib/supabase/types';
import ProfileForm from './ProfileForm';

export default async function SettingsPage() {
  const { supabase, contractor } = await requireContractor();
  const { data } = await supabase
    .from('catalog_items')
    .select('*')
    .order('name', { ascending: true });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Instellingen</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Bedrijfsgegevens</h2>
        <p className="mb-4 text-sm text-gray-600">
          Deze gegevens verschijnen op elke offerte die je genereert.
        </p>
        <ProfileForm contractor={contractor} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Prijslijst</h2>
        <p className="mb-4 text-sm text-gray-600">
          Je eigen prijzen. Deze worden gebruikt om je gesproken beschrijving om te zetten in een offerte.
        </p>
        <CatalogForm items={(data ?? []) as CatalogItem[]} />
      </section>
    </main>
  );
}
