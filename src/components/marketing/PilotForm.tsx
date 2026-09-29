'use client';

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from 'react';
import { requestPilot, type PilotFormState } from '@/app/pilot-actions';
import type { PilotField } from '@/lib/pilot/request';
import Icon from '@/components/ui/Icon';
import WhatsAppIcon from './WhatsAppIcon';
import { WHATSAPP_URL } from './site';

const REGIONS = [
  { value: 'vlaanderen', label: 'Vlaanderen of Brussel' },
  { value: 'nederland', label: 'Nederland' },
  { value: 'elders', label: 'Elders' },
];

const ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

export default function PilotForm() {
  const [state, formAction, pending] = useActionState(requestPilot, { status: 'idle' } satisfies PilotFormState);
  const formRef = useRef<HTMLFormElement>(null);
  const sourceRef = useRef<HTMLInputElement>(null);
  const errors: Partial<Record<PilotField, string>> = state.status === 'invalid' ? state.fieldErrors : {};

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source: Record<string, string> = {};
    for (const key of ATTRIBUTION_KEYS) {
      const value = params.get(key);
      if (value) source[key] = value;
    }
    if (document.referrer && !document.referrer.startsWith(window.location.origin)) source.referrer = document.referrer;
    if (sourceRef.current) sourceRef.current.value = JSON.stringify(source);
  }, []);

  useEffect(() => {
    if (state.status !== 'invalid' || !formRef.current) return;
    const firstInvalid = formRef.current.querySelector<HTMLElement>('[aria-invalid="true"]');
    firstInvalid?.focus();
  }, [state]);

  // Submit through a transition instead of the form action prop, so React
  // does not reset the fields when the server returns an error.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  }

  if (state.status === 'sent') {
    return (
      <div className="lp-form-card lp-form-done" role="status" aria-live="polite">
        <span className="lp-done-icon"><Icon name="check" size={28} /></span>
        <h3>{state.firstName ? `Bedankt, ${state.firstName}.` : 'Bedankt.'} Je aanvraag is binnen.</h3>
        <p>Edouard belt je zo snel mogelijk terug om de pilot samen op te starten.</p>
        <a className="btn btn-outline lp-whatsapp" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon /> Liever meteen een WhatsApp
        </a>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="lp-form-card" noValidate>
      <h3 className="lp-form-title">Aanmelden voor de pilot</h3>

      <Field name="name" label="Naam" error={errors.name}>
        {(props) => <input {...props} type="text" autoComplete="name" required maxLength={120} />}
      </Field>
      <Field name="company" label="Bedrijfsnaam" optional error={errors.company}>
        {(props) => <input {...props} type="text" autoComplete="organization" maxLength={160} />}
      </Field>
      <div className="lp-form-pair">
        <Field name="phone" label="Telefoon" error={errors.phone}>
          {(props) => <input {...props} type="tel" inputMode="tel" autoComplete="tel" required maxLength={40} />}
        </Field>
        <Field name="email" label="E-mail" optional error={errors.email}>
          {(props) => <input {...props} type="email" autoComplete="email" maxLength={254} />}
        </Field>
      </div>

      <fieldset className="lp-choice" aria-describedby={errors.region ? 'region-error' : undefined}>
        <legend className="label">Waar werk je vooral?</legend>
        <div className="lp-choice-options">
          {REGIONS.map((region, index) => (
            <label key={region.value} className="lp-choice-option">
              <input
                type="radio"
                name="region"
                value={region.value}
                required
                aria-invalid={index === 0 && errors.region ? true : undefined}
              />
              <span>{region.label}</span>
            </label>
          ))}
        </div>
        {errors.region && <p id="region-error" className="lp-field-error">{errors.region}</p>}
      </fieldset>

      <Field name="quotesPerMonth" label="Hoeveel offertes maak je per maand?" optional error={errors.quotesPerMonth}>
        {(props) => (
          <select {...props} defaultValue="">
            <option value="">Kies een antwoord</option>
            <option value="minder-dan-10">Minder dan 10</option>
            <option value="10-30">10 tot 30</option>
            <option value="meer-dan-30">Meer dan 30</option>
          </select>
        )}
      </Field>
      <Field name="note" label="Hoe maak je nu je offertes?" optional error={errors.note}>
        {(props) => <textarea {...props} rows={3} maxLength={1000} className={`${props.className} lp-textarea`} />}
      </Field>

      {/* Bots fill every field; people never see this one. */}
      <div className="lp-honeypot" aria-hidden="true">
        <label>Website <input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <input ref={sourceRef} type="hidden" name="source" defaultValue="{}" />

      {state.status === 'failed' && (
        <div role="alert" className="alert alert-critical lp-form-alert">
          <p>
            Je aanvraag kon niet verstuurd worden. Probeer het opnieuw, of stuur Edouard meteen een{' '}
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">WhatsApp</a>.
          </p>
        </div>
      )}

      <button type="submit" className="btn btn-primary lp-submit" disabled={pending}>
        {pending ? 'Versturen…' : 'Word pilotklant'}
      </button>
      <p className="lp-form-note">We gebruiken je gegevens alleen om je te contacteren over de pilot.</p>
    </form>
  );
}

type ControlProps = {
  id: string;
  name: string;
  className: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
};

function Field({
  name,
  label,
  optional = false,
  error,
  children,
}: {
  name: PilotField;
  label: string;
  optional?: boolean;
  error?: string;
  children: (props: ControlProps) => React.ReactNode;
}) {
  const id = `pilot-${name}`;
  const errorId = `${id}-error`;
  return (
    <div className="lp-field">
      <label htmlFor={id} className="label">
        {label} {optional && <span className="lp-optional">optioneel</span>}
      </label>
      {children({
        id,
        name,
        className: 'field',
        ...(error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {}),
      })}
      {error && <p id={errorId} className="lp-field-error">{error}</p>}
    </div>
  );
}
