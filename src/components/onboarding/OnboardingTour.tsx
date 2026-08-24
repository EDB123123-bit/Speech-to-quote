'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { completeOnboarding, getOnboardingStatus } from '@/app/onboarding-actions';
import { ONBOARDING_RESTART_EVENT } from './events';

type Step = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  tip?: string;
  selector?: string;
  showFlow?: boolean;
};

export const ONBOARDING_STEPS: Step[] = [
  {
    id: 'welcome',
    eyebrow: 'Welkom bij Werkoffertes',
    title: 'Van aanvraag tot factuur',
    body: 'Werkoffertes houdt de hele klus bij. De offerte is altijd het vertrekpunt.',
    showFlow: true,
  },
  {
    id: 'settings',
    eyebrow: 'Eenmalig instellen',
    title: 'Vul je bedrijf en mailbox in',
    body: 'Bij Instellingen vul je je bedrijfsgegevens in. Verbind Gmail of Outlook om documenten vanuit je eigen adres te versturen en Gmail-aanvragen in te lezen.',
    tip: 'Je hoeft geen vaste prijslijst klaar te hebben. Je vult verkoopprijzen per klus in.',
    selector: '[data-tour="nav-instellingen"]',
  },
  {
    id: 'new-quote',
    eyebrow: 'Nieuwe aanvraag',
    title: 'Maak een nieuwe offerte',
    body: 'Kies wat voor jou het snelst werkt: spreek de klus in, start handmatig of haal een aanvraag uit Gmail.',
    tip: 'Ontbrekende gegevens blijven leeg en worden duidelijk gemarkeerd. Zo weet je wat je nog moet nakijken.',
    selector: '[data-tour="new-quote"]',
  },
  {
    id: 'review',
    eyebrow: 'Nakijken en versturen',
    title: 'Controleer het concept',
    body: 'Open de offerte en kijk de klant, regels, aantallen, btw en prijzen na. Een ontbrekende prijs blijft onbekend; € 0 gebruik je alleen als de prijs echt nul is.',
    tip: 'De klant krijgt een veilige link en hoeft geen account te maken. Na aanvaarding kan de offerte niet meer veranderen.',
    selector: '[data-tour="nav-offertes"]',
  },
  {
    id: 'operations',
    eyebrow: 'Na aanvaarding',
    title: 'Taken en materiaal komen vrij',
    body: 'Voorbereide taken verschijnen in Taken. Alleen fysieke materialen komen in Te bestellen; daar kies je een leverancier en maak je een bestelling.',
    tip: 'Extra of onverwacht werk zet je in een aparte meerwerkofferte bij de oorspronkelijke offerte.',
    selector: '[data-tour="nav-taken"]',
  },
  {
    id: 'invoice',
    eyebrow: 'Laatste stap',
    title: 'Maak de factuur',
    body: 'Bij Facturen maak je een factuur vanuit een aanvaarde standaard- of meerwerkofferte. Controleer eerst het concept en geef de factuur daarna uit.',
    tip: 'Je kunt deze uitleg later altijd opnieuw openen via Uitleg bekijken.',
    selector: '[data-tour="nav-facturen"]',
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function isInternalPath(pathname: string): boolean {
  return pathname !== '/login'
    && !pathname.startsWith('/auth/')
    && !pathname.startsWith('/offerte/');
}

export default function OnboardingTour() {
  const pathname = usePathname();
  if (!isInternalPath(pathname)) return null;

  return <InternalOnboardingTour />;
}

function InternalOnboardingTour() {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const finish = useCallback(() => {
    setActive(false);
    void completeOnboarding().catch(() => {
      // Keep the app usable. If saving failed, the tour is offered again later.
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getOnboardingStatus()
      .then((result) => {
        if (!cancelled && result.show) {
          setStepIndex(0);
          setActive(true);
        }
      })
      .catch(() => {
        // A temporary network error should never block the rest of the app.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function restart() {
      setStepIndex(0);
      setActive(true);
    }

    window.addEventListener(ONBOARDING_RESTART_EVENT, restart);
    return () => window.removeEventListener(ONBOARDING_RESTART_EVENT, restart);
  }, []);

  const step = ONBOARDING_STEPS[stepIndex];

  const measure = useCallback(() => {
    if (!active || !step?.selector) {
      setRect(null);
      return;
    }

    const element = Array.from(document.querySelectorAll<HTMLElement>(step.selector)).find((candidate) => {
      const box = candidate.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    if (!element) {
      setRect(null);
      return;
    }

    const box = element.getBoundingClientRect();
    setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
  }, [active, step]);

  useEffect(() => {
    if (!active) return;

    const animationFrame = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, measure]);

  useEffect(() => {
    if (!active) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'),
      );
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [active, finish, stepIndex]);

  if (!active || !step) return null;

  function next() {
    if (stepIndex === ONBOARDING_STEPS.length - 1) {
      finish();
      return;
    }
    setStepIndex((current) => current + 1);
  }

  return (
    <div className="onboarding-layer">
      <div className={`onboarding-click-guard${rect ? ' is-clear' : ''}`} aria-hidden />
      {rect && (
        <div
          aria-hidden
          className="onboarding-spotlight"
          style={{
            top: Math.max(6, rect.top - 6),
            left: Math.max(6, rect.left - 6),
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
        tabIndex={-1}
        className={`onboarding-dialog${step.showFlow ? ' is-welcome' : ''}`}
      >
        <div className="onboarding-progress-row">
          <p className="eyebrow">{step.eyebrow}</p>
          <p className="onboarding-count" aria-live="polite">
            {stepIndex + 1} van {ONBOARDING_STEPS.length}
          </p>
        </div>

        <h2 id="onboarding-title" className="onboarding-title">{step.title}</h2>
        <p id="onboarding-description" className="onboarding-body">{step.body}</p>

        {step.showFlow && (
          <ol className="onboarding-flow" aria-label="Van aanvraag tot factuur">
            {['Aanvraag', 'Offerte', 'Aanvaard', 'Werk', 'Factuur'].map((label, index) => (
              <li key={label}>
                <span>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        )}

        {step.tip && <p className="onboarding-tip">{step.tip}</p>}

        <div className="onboarding-dots" aria-hidden>
          {ONBOARDING_STEPS.map((item, index) => (
            <span key={item.id} className={index === stepIndex ? 'is-active' : ''} />
          ))}
        </div>

        <div className="onboarding-actions">
          <button type="button" onClick={finish} className="onboarding-skip">
            {stepIndex === 0 ? 'Nu niet' : 'Uitleg sluiten'}
          </button>
          <div className="onboarding-step-buttons">
            {stepIndex > 0 && (
              <button type="button" onClick={() => setStepIndex((current) => current - 1)} className="btn btn-outline">
                Vorige
              </button>
            )}
            <button type="button" onClick={next} className="btn btn-primary">
              {stepIndex === 0
                ? 'Start uitleg'
                : stepIndex === ONBOARDING_STEPS.length - 1
                  ? 'Begrepen'
                  : 'Volgende'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
