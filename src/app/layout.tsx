import type { Metadata } from 'next';
import { Figtree } from 'next/font/google';
import AppShell from '@/components/AppShell';
import OnboardingTour from '@/components/onboarding/OnboardingTour';
import './globals.css';

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Offertes',
  description: 'Spraakgestuurde offertes voor dakwerkers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={figtree.variable}>
      <body>
        <AppShell>{children}</AppShell>
        <OnboardingTour />
      </body>
    </html>
  );
}
