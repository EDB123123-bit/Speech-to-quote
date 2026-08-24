import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';
import OnboardingTour from '@/components/onboarding/OnboardingTour';
import './globals.css';

export const metadata: Metadata = {
  title: 'Offertes',
  description: 'Spraakgestuurde offertes voor dakwerkers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <AppShell>{children}</AppShell>
        <OnboardingTour />
      </body>
    </html>
  );
}
