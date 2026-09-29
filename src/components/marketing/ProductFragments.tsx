import type { CSSProperties, ReactNode } from 'react';
import Icon from '@/components/ui/Icon';
import { formatEuros } from '@/lib/money/totals';

/*
 * Static, read-only instances of the real app screens, built from the app's
 * own markup and globals.css classes with sample data. They are illustrations,
 * so their inner controls are hidden from assistive tech and the figure
 * carries a plain-language description instead.
 */

export const SAMPLE = {
  transcript: [
    { text: '45 vierkante meter pannen vernieuwen', highlight: true },
    { text: ', aan 58 euro per vierkante meter. ', highlight: false },
    { text: '12 meter dakgoot vervangen in zink', highlight: true },
    { text: '. ', highlight: false },
    { text: 'Container erbij', highlight: true },
    { text: ', 350 euro. Het huis is ouder dan tien jaar.', highlight: false },
  ],
  tilesCents: 45 * 5800,
  containerCents: 35000,
} as const;

const knownSubtotal = SAMPLE.tilesCents + SAMPLE.containerCents;
const knownVat = Math.round(knownSubtotal * 0.06);

function Illustration({
  label,
  className,
  innerClassName,
  children,
}: {
  label: string;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  return (
    <figure className={className} aria-label={label}>
      <div className={innerClassName} aria-hidden="true">{children}</div>
    </figure>
  );
}

function step(i: number): CSSProperties {
  return { '--i': i } as CSSProperties;
}

const transcriptParts = SAMPLE.transcript.map((part, index, all) => ({
  ...part,
  markIndex: all.slice(0, index).filter((earlier) => earlier.highlight).length,
}));

/** Static bar heights: the app's live waveform animates height, which a marketing page should not loop. */
const WAVEFORM_HEIGHTS = [12, 22, 30, 18, 34, 26, 14, 28, 20, 32, 16];

/** Hero: what the roofer said and the quote lines it became. */
export function HeroStage() {
  return (
    <Illustration
      className="lp-stage"
      innerClassName="lp-stage-grid"
      label="Voorbeeld: een dakwerker spreekt de klus in en krijgt offertelijnen met aantallen, prijzen en 6% btw terug. Eén lijn zonder prijs staat gemarkeerd."
    >
      <div className="lp-stage-said">
        <p className="lp-stage-heading">Wat je zegt</p>
        <div className="card lp-transcript">
          <p className="lp-transcript-label"><Icon name="microphone" size={16} /> Wat ik gehoord heb</p>
          <p className="lp-transcript-text">
            “
            {transcriptParts.map((part) =>
              part.highlight ? (
                <mark key={part.text} style={step(part.markIndex)}>{part.text}</mark>
              ) : (
                <span key={part.text}>{part.text}</span>
              ),
            )}
            ”
          </p>
        </div>
      </div>

      <p className="lp-stage-step">
        <span>Een halve minuut later</span>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
      </p>

      <div className="lp-stage-quote">
        <p className="lp-stage-heading">Wat erop komt <span className="lp-sample-tag">Voorbeeld</span></p>
        <div className="line-items lp-lines">
          <div className="line-item lp-line" style={step(0)}>
            <div className="line-summary">
              <span>
                <span className="line-description">Pannen vernieuwen</span>
                <span className="line-meta">45 m² × {formatEuros(5800)} · 6% btw</span>
              </span>
              <span className="line-total">{formatEuros(SAMPLE.tilesCents)}</span>
            </div>
          </div>
          <div className="line-item needs-work lp-line" style={step(1)}>
            <div className="line-summary">
              <span>
                <span className="line-description">Dakgoot vervangen in zink</span>
                <span className="status-pill is-warning mt-2">Prijs toevoegen / verifiëren</span>
              </span>
              <span className="line-total">Onbekend</span>
            </div>
          </div>
          <div className="line-item lp-line" style={step(2)}>
            <div className="line-summary">
              <span>
                <span className="line-description">Container</span>
                <span className="line-meta">Totaalprijs {formatEuros(SAMPLE.containerCents)} · 6% btw</span>
              </span>
              <span className="line-total">{formatEuros(SAMPLE.containerCents)}</span>
            </div>
          </div>
        </div>

        <div className="totals-card lp-totals">
          <div className="totals-row"><span>Subtotaal gekende werken</span><span>{formatEuros(knownSubtotal)}</span></div>
          <div className="totals-row"><span>Btw 6%</span><span>{formatEuros(knownVat)}</span></div>
          <div className="totals-grand"><strong>Totaal gekende werken</strong><strong>{formatEuros(knownSubtotal + knownVat)}</strong></div>
        </div>
      </div>
    </Illustration>
  );
}

/** Step 1: the recording screen with the app's own example sentences. */
export function RecordFragment() {
  return (
    <Illustration
      className="lp-fragment"
      label="Het opnamescherm van Werkoffertes met voorbeeldzinnen zoals ‘45 vierkante meter pannen vernieuwen’ en een grote opnameknop."
    >
      <div className="example-card lp-example-card">
        <p className="eyebrow">Bijvoorbeeld</p>
        <ul>
          <li>“45 vierkante meter pannen vernieuwen.”</li>
          <li>“12 meter dakgoot vervangen in zink.”</li>
          <li>“Twee dagen werk, met container.”</li>
          <li>“Het gebouw is ouder dan tien jaar.”</li>
        </ul>
      </div>
      <div className="record-card lp-record-card">
        <div className="voice-recorder" data-variant="hero">
          <span className="voice-button is-recording"><Icon name="microphone" size={40} /></span>
          <p className="voice-timer">0:18</p>
          <div className="waveform lp-waveform">
            {WAVEFORM_HEIGHTS.map((height, index) => <span key={index} style={{ height }} />)}
          </div>
        </div>
      </div>
    </Illustration>
  );
}

/** Step 2: a follow-up question the app asks out loud. */
export function ClarificationFragment() {
  return (
    <Illustration
      className="lp-fragment"
      label="Werkoffertes vraagt: moeten de afvoerbuizen ook vervangen worden? Je kunt de vraag laten voorlezen, je antwoord inspreken of de vraag wegklikken."
    >
      <section className="clarification-card">
        <p className="eyebrow text-warning">Nog te doen</p>
        <p className="lp-clarification-title"><span className="nums">1</span> vraag beantwoorden</p>
        <p className="mb-4 mt-1 text-sm font-semibold text-warning">Spreek je antwoord in of duid aan dat de vraag niet nodig is.</p>
        <div className="clarification-item">
          <p className="eyebrow text-warning">Vraag 1 van 1</p>
          <p className="clarification-question">Moeten de afvoerbuizen ook vervangen worden?</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="btn btn-quiet">▶ Vraag afspelen</span>
            <span className="voice-recorder" data-variant="compact">
              <span className="voice-button"><Icon name="microphone" size={22} /></span>
              <span className="voice-label">Antwoord opnemen</span>
            </span>
            <span className="btn btn-quiet">Niet van toepassing</span>
          </div>
        </div>
      </section>
    </Illustration>
  );
}

/** Step 3: what the customer sees behind the link. */
export function CustomerQuoteFragment() {
  return (
    <Illustration
      className="lp-fragment"
      label="De klant opent de offerte via een link, ziet de werken en het totaal en klikt op ‘Offerte accepteren’. Een account is niet nodig."
    >
      <div className="card lp-customer-card">
        <p className="eyebrow">Offerte</p>
        <p className="lp-customer-company">Dakwerken Peeters</p>
        <p className="lp-customer-meta">Offerte 2026-014 · voor familie Claes</p>
        <div className="lp-customer-rows">
          <div><span>Pannen vernieuwen · 45 m²</span><span>{formatEuros(SAMPLE.tilesCents)}</span></div>
          <div><span>Dakgoot vervangen in zink · 12 m</span><span>{formatEuros(114000)}</span></div>
          <div><span>Afvoerbuizen in zink · 2 stuks</span><span>{formatEuros(29000)}</span></div>
          <div><span>Container</span><span>{formatEuros(SAMPLE.containerCents)}</span></div>
        </div>
        <div className="lp-customer-total"><span>Totaal incl. btw</span><span>{formatEuros(Math.round((SAMPLE.tilesCents + 114000 + 29000 + SAMPLE.containerCents) * 1.06))}</span></div>
        <span className="btn btn-primary w-full">Offerte accepteren</span>
      </div>
    </Illustration>
  );
}

/** Trust: a line without a spoken price stays open, in the app and for the customer. */
export function UnpricedLineFragment() {
  return (
    <div className="lp-unpriced" aria-hidden="true">
      <div>
        <p className="lp-mini-label">In de app</p>
        <div className="line-item needs-work">
          <div className="line-summary">
            <span>
              <span className="line-description">Dakgoot vervangen in zink</span>
              <span className="status-pill is-warning mt-2">Prijs toevoegen / verifiëren</span>
            </span>
            <span className="line-total">Onbekend</span>
          </div>
        </div>
      </div>
      <div>
        <p className="lp-mini-label">Bij je klant</p>
        <div className="card lp-customer-card lp-customer-mini">
          <div className="lp-customer-rows">
            <div><span>Pannen vernieuwen · 45 m²</span><span>{formatEuros(SAMPLE.tilesCents)}</span></div>
            <div><span>Dakgoot vervangen in zink · 12 m</span><span className="lp-tbd">Prijs nog te bepalen</span></div>
            <div><span>Container</span><span>{formatEuros(SAMPLE.containerCents)}</span></div>
          </div>
          <div className="lp-customer-total"><span>Totaal gekende werken</span><span>{formatEuros(knownSubtotal + knownVat)}</span></div>
        </div>
      </div>
    </div>
  );
}

/** Trust: a price reused from an earlier quote is marked as a suggestion. */
export function SuggestedPriceFragment() {
  return (
    <div className="line-item" aria-hidden="true">
      <div className="line-summary">
        <span>
          <span className="line-description">Nokpannen plaatsen</span>
          <span className="line-meta">9 m × {formatEuros(4200)} · 21% btw</span>
          <span className="lp-suggested">Voorgesteld op basis van eerdere offerte</span>
        </span>
        <span className="line-total">{formatEuros(9 * 4200)}</span>
      </div>
    </div>
  );
}

/** Trust: finishing is blocked while a question is open. */
export function FinalizeGateFragment() {
  return (
    <div className="lp-gate" aria-hidden="true">
      <p className="task-summary">Nog te doen: 1 vraag.</p>
      <span className="btn btn-primary w-full lp-disabled">Offerte afwerken · {formatEuros(knownSubtotal + knownVat)}</span>
    </div>
  );
}
