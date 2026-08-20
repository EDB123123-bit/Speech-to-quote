'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from '@/components/LogoutButton';
import Icon, { type IconName } from '@/components/ui/Icon';

const NAV_ITEMS: { href: string; label: string; icon: IconName; matches: (path: string) => boolean }[] = [
  { href: '/offertes', label: 'Offertes', icon: 'grid', matches: (path) => path.startsWith('/offertes') },
  { href: '/facturen', label: 'Facturen', icon: 'file', matches: (path) => path.startsWith('/facturen') },
  { href: '/pijplijn', label: 'Pijplijn', icon: 'prices', matches: (path) => path.startsWith('/pijplijn') },
  { href: '/instellingen', label: 'Instellingen', icon: 'settings', matches: (path) => path.startsWith('/instellingen') },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/login' || pathname.startsWith('/auth/')) return children;

  return (
    <div className="app-shell">
      <aside className="desktop-rail" aria-label="Hoofdnavigatie">
        <Link href="/offertes" className="brand-mark" aria-label="Werkoffertes — naar offertes">
          <span className="brand-icon"><Icon name="microphone" size={18} /></span>
          <span>Werkoffertes</span>
        </Link>

        <Link href="/offertes/nieuw" data-tour="nav-nieuwe-offerte" className="new-quote-button">
          <Icon name="microphone" size={21} />
          Nieuwe offerte
        </Link>

        <nav className="rail-links">
          {NAV_ITEMS.map((item) => {
            const active = item.matches(pathname) && !(item.href === '/offertes' && pathname === '/offertes/nieuw');
            return (
              <Link key={item.href} href={item.href} data-tour={item.href === '/instellingen' ? 'nav-instellingen' : undefined} className={active ? 'rail-link is-active' : 'rail-link'}>
                <Icon name={item.icon} size={21} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="rail-footer">
          <p>Offertes van op de werf</p>
          <LogoutButton />
        </div>
      </aside>

      <div className="app-content">{children}</div>

      <nav className="mobile-tabs" aria-label="Hoofdnavigatie">
        {NAV_ITEMS.map((item) => {
          const active = item.matches(pathname) && !(item.href === '/offertes' && pathname === '/offertes/nieuw');
          return (
            <Link key={item.href} href={item.href} data-tour={item.href === '/instellingen' ? 'nav-instellingen' : undefined} className={active ? 'mobile-tab is-active' : 'mobile-tab'}>
              <Icon name={item.icon} size={24} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
