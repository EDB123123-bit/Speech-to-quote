'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { completeOnboarding, getOnboardingStatus } from '@/app/onboarding-actions';

type Step = {
  id: string;
  route?: string;
  selector?: string;
  title: string;
  body: string;
  fallbackHref?: string;
  fallbackLabel?: string;
  isLast?: boolean;
};

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welkom bij Offertes',
    body: 'In een paar tikken zetten we je klaar: eerst je prijslijst, dan je eerste gesproken offerte.',
  },
  {
    id: 'settings',
    selector: '[data-tour="nav-instellingen"]',
    title: 'Stap 1 · Instellingen',
    body: 'Klik op Instellingen om je bedrijfsgegevens en prijslijst in te stellen.',
  },
  {
    id: 'catalog',
    route: '/instellingen',
    selector: '[data-tour="catalog-form"]',
    title: 'Stap 2 · Prijslijst',
    body: 'Voeg hier je producten en prijzen toe. Zonder prijzen kan er geen offerte gemaakt worden.',
    fallbackHref: '/instellingen',
    fallbackLabel: 'Ga naar Instellingen',
  },
  {
    id: 'new-quote-nav',
    selector: '[data-tour="nav-nieuwe-offerte"]',
    title: 'Stap 3 · Nieuwe offerte',
    body: 'Klaar met je prijslijst? Klik hier om je eerste offerte te maken.',
  },
  {
    id: 'record',
    route: '/offertes/nieuw',
    selector: '[data-tour="record-button"]',
    title: 'Stap 4 · Spreek de klus in',
    body: 'Druk op de knop en beschrijf de klus hardop: wat moet er gebeuren, met welke materialen en hoeveel.',
    fallbackHref: '/offertes/nieuw',
    fallbackLabel: 'Ga naar Nieuwe offerte',
    isLast: true,
  },
];

type Rect = { top: number; left: number; width: number; height: number };

export default function OnboardingTour() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [seenPathname, setSeenPathname] = useState(pathname);

  useEffect(() => {
    let cancelled = false;
    void getOnboardingStatus().then((res) => {
      if (!cancelled && res.show) setActive(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Clicking the real nav link is the intended way to advance a nav-pointing
  // step, so treat landing on the next step's route as an implicit "Volgende".
  // Adjusted during render (React's documented pattern for reacting to a
  // prop/route change) rather than in an effect, to avoid an extra render.
  if (pathname !== seenPathname) {
    setSeenPathname(pathname);
    const next = STEPS[stepIndex + 1];
    if (active && next?.route === pathname) {
      setStepIndex((i) => i + 1);
    }
  }

  const step = STEPS[stepIndex];

  const measure = useCallback(() => {
    if (!step?.selector) {
      setRect(null);
      return;
    }
    const el = Array.from(document.querySelectorAll(step.selector)).find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useEffect(() => {
    if (!active) return;
    // Polls rather than a MutationObserver: the target may not exist yet
    // right after a client-side route change, and this is simplest way to
    // catch it appearing without wiring per-page mount callbacks. Deferred
    // one tick so the first call isn't a synchronous setState-in-effect.
    const interval = setInterval(measure, 300);
    const timeout = setTimeout(measure, 0);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, measure, pathname]);

  if (!active || !step) return null;

  function finish() {
    setActive(false);
    void completeOnboarding();
  }

  function next() {
    if (step.isLast) {
      finish();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  const needsNavigation = Boolean(step.route && step.route !== pathname);
  const hasTarget = !needsNavigation && rect !== null;

  return (
    <>
      {hasTarget && rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 rounded-xl transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(20,23,31,0.55)',
            border: '2px solid var(--accent)',
          }}
        />
      )}

      <div
        role="dialog"
        aria-label={step.title}
        className="card fixed z-50 w-[calc(100%-2rem)] max-w-sm shadow-lg"
        style={
          hasTarget && rect
            ? {
                top: Math.min(rect.top + rect.height + 16, window.innerHeight - 220),
                left: Math.max(16, Math.min(rect.left, window.innerWidth - 336 - 16)),
              }
            : { bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)' }
        }
      >
        <p className="label mb-1">{step.title}</p>
        <p className="mb-4 text-sm text-ink">{step.body}</p>

        {needsNavigation && step.fallbackHref && (
          <Link href={step.fallbackHref} className="btn btn-outline mb-3 w-full text-sm">
            {step.fallbackLabel}
          </Link>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-sm font-medium text-muted underline underline-offset-2 hover:text-ink"
          >
            Overslaan
          </button>
          <button type="button" onClick={next} className="btn btn-accent text-sm">
            {step.isLast ? 'Klaar' : 'Volgende'}
          </button>
        </div>
      </div>
    </>
  );
}
