'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from '@/components/LogoutButton';
import NotificationBell from '@/components/NotificationBell';
import OnboardingHelpButton from '@/components/onboarding/OnboardingHelpButton';
import Icon, { type IconName } from '@/components/ui/Icon';

type NavItem = { href: string; label: string; icon: IconName; matches: (path: string) => boolean };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Verkoop',
    items: [
      { href: '/offertes', label: 'Offertes', icon: 'grid', matches: (path) => path.startsWith('/offertes') },
      { href: '/klanten', label: 'Klanten', icon: 'users', matches: (path) => path.startsWith('/klanten') },
      { href: '/facturen', label: 'Facturen', icon: 'file', matches: (path) => path.startsWith('/facturen') },
    ],
  },
  {
    label: 'Operaties',
    items: [
      { href: '/taken', label: 'Taken', icon: 'check', matches: (path) => path.startsWith('/taken') },
      { href: '/te-bestellen', label: 'Te bestellen', icon: 'prices', matches: (path) => path.startsWith('/te-bestellen') },
      { href: '/bestellingen', label: 'Bestellingen', icon: 'file', matches: (path) => path.startsWith('/bestellingen') },
      { href: '/leveranciers', label: 'Leveranciers', icon: 'users', matches: (path) => path.startsWith('/leveranciers') },
    ],
  },
  {
    label: 'Overig',
    items: [
      { href: '/instellingen', label: 'Instellingen', icon: 'settings', matches: (path) => path.startsWith('/instellingen') },
    ],
  },
];

const MOBILE_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

const TOUR_TARGETS: Partial<Record<string, string>> = {
  '/offertes': 'nav-offertes',
  '/facturen': 'nav-facturen',
  '/taken': 'nav-taken',
  '/instellingen': 'nav-instellingen',
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/login' || pathname.startsWith('/auth/') || pathname.startsWith('/offerte/')) return children;

  return (
    <div className="app-shell">
      <aside className="desktop-rail" aria-label="Hoofdnavigatie">
        <Link href="/offertes" className="brand-mark" aria-label="Werkoffertes — naar offertes">
          <span className="brand-icon"><Icon name="microphone" size={18} /></span>
          <span>Werkoffertes</span>
        </Link>

        <Link href="/offertes/nieuw" data-tour="new-quote" className="new-quote-button">
          <Icon name="microphone" size={21} />
          Nieuwe offerte
        </Link>

        <NotificationBell />

        <nav className="rail-links">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="rail-group">
              <p className="rail-group-label">{group.label}</p>
              {group.items.map((item) => {
                const active = item.matches(pathname) && !(item.href === '/offertes' && pathname === '/offertes/nieuw');
                return (
                  <Link key={item.href} href={item.href} data-tour={TOUR_TARGETS[item.href]} className={active ? 'rail-link is-active' : 'rail-link'}>
                    <Icon name={item.icon} size={21} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="rail-footer">
          <p>Offertes van op de werf</p>
          <div className="rail-footer-actions">
            <OnboardingHelpButton />
            <LogoutButton />
          </div>
        </div>
      </aside>

      <div className="app-content">{children}</div>

      <nav className="mobile-tabs" aria-label="Hoofdnavigatie">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = item.matches(pathname) && !(item.href === '/offertes' && pathname === '/offertes/nieuw');
          return (
            <Link key={item.href} href={item.href} data-tour={TOUR_TARGETS[item.href]} className={active ? 'mobile-tab is-active' : 'mobile-tab'}>
              <Icon name={item.icon} size={24} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
