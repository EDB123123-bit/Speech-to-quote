import Link from 'next/link';
import type { Metadata } from 'next';
import { Fraunces, Work_Sans, IBM_Plex_Mono } from 'next/font/google';
import OnboardingTour from '@/components/onboarding/OnboardingTour';
import LogoutButton from '@/components/LogoutButton';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  weight: ['500', '600'],
  display: 'swap',
});
const workSans = Work_Sans({
  subsets: ['latin'],
  variable: '--font-work-sans',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-plex-mono',
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Offertes',
  description: 'Spraakgestuurde offertes voor dakwerkers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${fraunces.variable} ${workSans.variable} ${plexMono.variable}`}>
      <body>
        <nav className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-2xl items-center gap-6 p-4 text-sm">
            <Link href="/offertes" className="font-semibold text-ink hover:text-accent">
              Offertes
            </Link>
            <Link href="/offertes/nieuw" data-tour="nav-nieuwe-offerte" className="text-muted hover:text-accent">
              Nieuwe offerte
            </Link>
            <div className="ml-auto flex items-center gap-4">
              <Link href="/instellingen" data-tour="nav-instellingen" className="text-muted hover:text-accent">
                Instellingen
              </Link>
              <LogoutButton />
            </div>
          </div>
        </nav>
        {children}
        <OnboardingTour />
      </body>
    </html>
  );
}
