import { requireContractor } from '@/lib/auth/require-contractor';
import ProfileForm from './ProfileForm';

export default async function SettingsPage() {
  const { contractor } = await requireContractor();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Instellingen</h1>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Bedrijfsgegevens</h2>
        <p className="mb-4 text-sm text-gray-600">
          Deze gegevens verschijnen op elke offerte die je genereert.
        </p>
        <ProfileForm contractor={contractor} />
      </section>
    </main>
  );
}
