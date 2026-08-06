import Link from 'next/link';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Offertes',
  description: 'Spraakgestuurde offertes voor dakwerkers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <nav className="border-b">
          <div className="mx-auto flex max-w-2xl gap-4 p-4 text-sm">
            <Link href="/offertes" className="font-medium">Offertes</Link>
            <Link href="/offertes/nieuw">Nieuwe offerte</Link>
            <Link href="/instellingen" className="ml-auto">Instellingen</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
