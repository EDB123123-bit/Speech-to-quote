'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import type { ContractorNotification } from '@/lib/supabase/types';

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<ContractorNotification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch('/api/notifications', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() as Promise<{ notifications?: ContractorNotification[] }> : null)
      .then((body) => {
        if (active && body?.notifications) setNotifications(body.notifications);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const unread = notifications.filter((notification) => !notification.read_at).length;

  async function openNotification(notification: ContractorNotification) {
    if (!notification.read_at) {
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: notification.id }) });
    }
    setOpen(false);
  }

  return (
    <div className="relative mb-5">
      <button type="button" className="rail-link w-full" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <Icon name="mail" size={21} />
        Meldingen
        {unread > 0 && <span className="ml-auto rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-extrabold text-[var(--accent-ink)]">{unread}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-80 rounded-2xl border border-border bg-surface p-3 shadow-[var(--shadow)]">
          {notifications.length === 0 ? (
            <p className="p-2 text-sm font-medium text-muted">Nog geen meldingen.</p>
          ) : notifications.map((notification) => (
            <Link key={notification.id} href={notification.href} onClick={() => void openNotification(notification)} className={`block rounded-xl p-3 text-sm hover:bg-paper-strong ${notification.read_at ? '' : 'bg-paper-strong'}`}>
              <p className="font-extrabold">{notification.title}</p>
              <p className="mt-1 leading-relaxed text-muted">{notification.body}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
