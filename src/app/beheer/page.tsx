import type { Metadata } from 'next';
import AdminOverview from '@/components/admin/AdminOverview';
import { loadAdminOverview, summarize } from '@/lib/admin/overview';
import { requireAdmin } from '@/lib/admin/require-admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Beheer',
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const { admin } = await requireAdmin();
  const { accounts, pilotRequests, pilotRequestsFailed } = await loadAdminOverview(admin);

  return (
    <AdminOverview
      accounts={accounts}
      pilotRequests={pilotRequests}
      pilotRequestsFailed={pilotRequestsFailed}
      summary={summarize(accounts, pilotRequests)}
    />
  );
}
