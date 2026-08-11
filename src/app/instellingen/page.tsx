import { requireContractor } from '@/lib/auth/require-contractor';
import CatalogForm from '@/components/CatalogForm';
import type { CatalogItem, PipelineStage } from '@/lib/supabase/types';
import ProfileForm from './ProfileForm';
import PipelineStagesForm from './PipelineStagesForm';

export default async function SettingsPage() {
  const { supabase, contractor } = await requireContractor();
  const [{ data: catalogItems }, { data: stages }] = await Promise.all([
    supabase.from('catalog_items').select('*').order('name', { ascending: true }),
    supabase.from('pipeline_stages').select('*').order('sort_order', { ascending: true }),
  ]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-8 text-3xl font-semibold">Instellingen</h1>

      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">Bedrijfsgegevens</h2>
        <p className="mb-4 text-sm text-muted">
          Deze gegevens verschijnen op elke offerte die je genereert.
        </p>
        <ProfileForm contractor={contractor} />
      </section>

      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">Prijslijst</h2>
        <p className="mb-4 text-sm text-muted">
          Je eigen prijzen. Deze worden gebruikt om je gesproken beschrijving om te zetten in een offerte.
        </p>
        <CatalogForm items={(catalogItems ?? []) as CatalogItem[]} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Pijplijnfasen</h2>
        <p className="mb-4 text-sm text-muted">
          De fasen die een offerte doorloopt nadat ze is afgewerkt, zoals je ze wil bijhouden in Pijplijn.
        </p>
        <PipelineStagesForm stages={(stages ?? []) as PipelineStage[]} />
      </section>
    </main>
  );
}
