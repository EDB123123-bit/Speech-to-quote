import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, formatEuros } from './brand';
import { ANSWER, CAPTIONS, STEPS, T, TRANSCRIPT } from './timeline';
import { Alert, Button, Card, Eyebrow, Field, Icon, LineItem, Pill, Tap, Totals, type Line } from './ui';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

function useLayout() {
  const { width, height } = useVideoConfig();
  return height > width ? 'tall' : 'wide';
}

function rise(frame: number, from: number, fps: number) {
  return spring({ frame: frame - from, fps, config: { damping: 200, stiffness: 170 }, durationInFrames: 22 });
}

/** Shows children between `from` and `to`, easing in from below and fading out. */
function Appear({ from, to, children, dy = 40, style }: { from: number; to: number; children: ReactNode; dy?: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from || frame >= to) return null;
  const inn = rise(frame, from, fps);
  const out = interpolate(frame, [to - 9, to], [0, 1], clamp);
  return (
    <div style={{ opacity: inn * (1 - out), transform: `translateY(${(1 - inn) * dy - out * 14}px)`, ...style }}>
      {children}
    </div>
  );
}

// ---- Sample quote ----------------------------------------------------------

const tiles: Line = { description: 'Pannen vernieuwen', meta: `45 m² × ${formatEuros(5800)} · 6% btw`, totalCents: 261000 };
const gutterOpen: Line = { description: 'Dakgoot vervangen in zink', totalCents: null, needsWork: true };
const gutterPriced: Line = { description: 'Dakgoot vervangen in zink', meta: `12 m × ${formatEuros(9500)} · 6% btw`, totalCents: 114000 };
const container: Line = { description: 'Container', meta: `Totaalprijs ${formatEuros(35000)} · 6% btw`, totalCents: 35000 };
const downpipes: Line = { description: 'Afvoerbuizen in zink', meta: `2 stuks × ${formatEuros(14500)} · 6% btw`, totalCents: 29000 };

const SUB_OPEN = 261000 + 35000;
const SUB_PRICED = SUB_OPEN + 114000;
const SUB_FULL = SUB_PRICED + 29000;
const vat = (cents: number) => Math.round(cents * 0.06);

// ---- Scenes on the product stage -------------------------------------------

function RecordGroup() {
  const frame = useCurrentFrame();
  const recording = frame >= T.recordingStart && frame < T.recordingEnd;
  const done = frame >= T.recordingEnd;
  const seconds = Math.floor(interpolate(frame, [T.recordingStart, T.recordingEnd], [0, 18], clamp));
  const pressed = interpolate(frame, [T.tap - 4, T.tap, T.tap + 6], [0, 1, 0], clamp);
  const words = TRANSCRIPT.flatMap((part) => part.text.split(/(\s+)/).filter(Boolean).map((word) => ({ word, highlight: !!part.highlight })));
  const visible = Math.floor(interpolate(frame, [T.wordsStart, T.wordsEnd], [0, words.length], clamp));

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <Card style={{ display: 'grid', justifyItems: 'center', gap: 12, padding: '22px 20px 24px' }}>
        <Eyebrow style={{ justifySelf: 'start' }}>Nieuwe offerte</Eyebrow>
        <p style={{ justifySelf: 'start', margin: '-4px 0 6px', fontSize: 26, fontWeight: 850, letterSpacing: '-0.025em' }}>Vertel wat er moet gebeuren.</p>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 26 }}>
          <span
            style={{
              display: 'inline-flex',
              width: 104,
              height: 104,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              background: recording ? C.critical : C.ink,
              color: '#fff',
              boxShadow: `0 0 0 12px ${recording ? C.criticalBg : C.accent}, 0 14px 26px rgba(20,18,15,.16)`,
              transform: `scale(${1 - pressed * 0.06})`,
            }}
          >
            <Icon name="mic" size={40} color="#fff" />
          </span>
          <Tap t={interpolate(frame, [T.tap - 2, T.tap + 16], [0, 1], clamp)} style={{ left: 52, top: 52 }} />
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 34, fontWeight: 850, fontVariantNumeric: 'tabular-nums' }}>0:{String(seconds).padStart(2, '0')}</span>
            <Waveform active={recording} frame={frame} />
          </div>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 750 }}>
          {done ? 'Opname bewaard' : recording ? 'Tik om te stoppen' : 'Tik om te beginnen'}
        </p>
      </Card>

      <Appear from={T.wordsStart - 6} to={T.processingStart + 30}>
        <Card style={{ padding: '17px 19px' }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 8px', color: C.muted, fontSize: 14, fontWeight: 800 }}>
            <Icon name="mic" size={15} color={C.muted} /> Wat ik gehoord heb
          </p>
          <p style={{ margin: 0, fontSize: 18.5, fontWeight: 650, lineHeight: 1.5, minHeight: 112 }}>
            “
            {words.map((item, index) => (
              <span
                key={index}
                style={{
                  opacity: index < visible ? 1 : 0,
                  background: item.highlight && index < visible ? C.accent : 'transparent',
                  borderRadius: 3,
                }}
              >
                {item.word}
              </span>
            ))}
            {visible >= words.length ? '”' : ''}
          </p>
        </Card>
      </Appear>
    </div>
  );
}

function Waveform({ active, frame }: { active: boolean; frame: number }) {
  const bars = [0.4, 0.75, 1, 0.6, 0.9, 0.5, 0.8, 0.45, 0.7];
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, height: 36 }}>
      {bars.map((base, index) => {
        const wobble = active ? 0.55 + 0.45 * Math.abs(Math.sin(frame / 4.2 + index * 1.7)) : 0.25;
        return <span key={index} style={{ width: 6, height: 6 + 28 * base * wobble, borderRadius: 99, background: C.ink, opacity: active ? 1 : 0.25 }} />;
      })}
    </span>
  );
}

function ProcessingGroup() {
  const frame = useCurrentFrame();
  const done = frame >= T.processingDone;
  const rows = [
    { label: 'Opname bewaard', ok: true },
    { label: 'Uitgeschreven wat je zei', ok: true },
    { label: 'Je job-specifieke prijzen verwerken', ok: done },
  ];
  const spin = (frame * 14) % 360;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 26, fontWeight: 850, letterSpacing: '-0.025em' }}>Ik maak je offerte.</p>
      <div style={{ padding: '6px 18px', borderRadius: 24, background: C.surface }}>
        {rows.map((row, index) => (
          <div key={row.label} style={{ display: 'flex', minHeight: 64, alignItems: 'center', gap: 14, borderBottom: index < 2 ? `1px solid ${C.border}` : 'none', fontSize: 17, fontWeight: 700 }}>
            <span style={{ display: 'inline-flex', width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: row.ok ? C.successBg : C.accent, color: C.success }}>
              {row.ok ? (
                <Icon name="check" size={19} color={C.success} />
              ) : (
                <span style={{ width: 18, height: 18, border: '3px solid rgba(20,18,15,.2)', borderTopColor: C.ink, borderRadius: 999, transform: `rotate(${spin}deg)` }} />
              )}
            </span>
            {row.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function LinesGroup({ withDownpipes }: { withDownpipes: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const priced = frame >= T.gutterPriced || withDownpipes;
  const focus = !priced && frame >= T.focusGutter;
  const pulse = focus ? 0.5 + 0.5 * Math.sin((frame - T.focusGutter) / 5) : 0;
  const editing = !priced && frame >= T.typePrice;
  const typed = '95'.slice(0, Math.floor(interpolate(frame, [T.typePrice + 8, T.typePrice + 26], [0, 2], clamp)));

  // Count up in whole euros so a paused frame never shows odd cents.
  const countTo = (from: number, to: number, start: number) => {
    const value = interpolate(frame, [start, start + 16], [from, to], clamp);
    return value === to ? to : Math.round(value / 100) * 100;
  };
  const subtotal = withDownpipes
    ? countTo(SUB_PRICED, SUB_FULL, T.linesAgain + 6)
    : countTo(SUB_OPEN, SUB_PRICED, T.gutterPriced);
  const editOpen = interpolate(frame, [T.typePrice, T.typePrice + 10, T.gutterPriced - 6, T.gutterPriced], [0, 1, 1, 0], clamp);
  const lines: Line[] = [tiles, priced ? gutterPriced : gutterOpen, container];
  const start = withDownpipes ? T.linesAgain : T.linesStart;

  return (
    <div style={{ display: 'grid', gap: 9 }}>
      <Eyebrow>Offertelijnen</Eyebrow>
      {lines.map((line, index) => {
        const inn = withDownpipes ? 1 : rise(frame, start + index * 7, fps);
        const isGutter = index === 1;
        return (
          <div key={line.description} style={{ opacity: inn, transform: `translateY(${(1 - inn) * 26}px)` }}>
            <LineItem
              line={line}
              style={isGutter && focus ? { boxShadow: `0 0 0 ${4 + pulse * 5}px rgba(224,162,0,${0.28 + pulse * 0.2})` } : undefined}
            >
              {isGutter && editing && (
                <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 0.8fr 1.3fr', gap: 10, maxHeight: editOpen * 90, opacity: editOpen, overflow: 'hidden', padding: `0 17px ${editOpen * 16}px` }}>
                  <MiniField label="Aantal" value="12" />
                  <MiniField label="Eenheid" value="m" />
                  <MiniField label="Prijs" value={`€ ${typed}${typed.length === 2 ? ',00' : ''}`} caret={typed.length < 2 || frame % 20 < 10} active />
                </div>
              )}
            </LineItem>
          </div>
        );
      })}
      {withDownpipes && (
        <Appear from={T.linesAgain + 4} to={T.finalizeStart} dy={24}>
          <LineItem line={downpipes} style={{ boxShadow: `0 0 0 ${interpolate(frame, [T.linesAgain + 4, T.linesAgain + 40], [5, 0], clamp)}px ${C.accent}` }} />
        </Appear>
      )}
      <div style={{ opacity: withDownpipes ? 1 : rise(frame, start + 24, fps) }}>
        <Totals subtotalCents={subtotal} vatCents={vat(subtotal)} complete={priced} />
      </div>
    </div>
  );
}

function MiniField({ label, value, caret = false, active = false }: { label: string; value: string; caret?: boolean; active?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 5 }}>
      <span style={{ fontSize: 13, fontWeight: 800 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 11px', border: `2px solid ${active ? C.ink : C.fieldBorder}`, borderRadius: 14, background: C.surface, boxShadow: active ? '0 0 0 3px rgba(188,201,255,.8)' : 'none', fontSize: 16, fontWeight: 700 }}>
        {value}
        {caret && <span style={{ width: 2, height: 20, marginLeft: 2, background: C.ink }} />}
      </span>
    </div>
  );
}

function QuestionGroup() {
  const frame = useCurrentFrame();
  const playing = frame >= T.playQuestion && frame < T.playQuestion + 44;
  const recording = frame >= T.answerStart && frame < T.answerEnd;
  const resolved = frame >= T.questionResolved;
  const answerWords = ANSWER.split(' ');
  const shown = Math.floor(interpolate(frame, [T.answerWords, T.answerEnd - 4], [0, answerWords.length], clamp));

  if (resolved) {
    return (
      <Appear from={T.questionResolved} to={T.linesAgain}>
        <Alert tone="success"><Icon name="check" size={20} color={C.success} /> Alle vragen beantwoord. Je kan de offerte afwerken.</Alert>
      </Appear>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ position: 'relative', padding: 20, borderRadius: 24, background: C.warningBg, color: C.ink }}>
        <Eyebrow color={C.warning}>Nog te doen</Eyebrow>
        <p style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>1 vraag beantwoorden</p>
        <p style={{ margin: '4px 0 14px', color: C.warning, fontSize: 14, fontWeight: 650 }}>Spreek je antwoord in of duid aan dat de vraag niet nodig is.</p>
        <div style={{ paddingTop: 14, borderTop: '1px solid rgba(107,74,0,.18)' }}>
          <Eyebrow color={C.warning}>Vraag 1 van 1</Eyebrow>
          <p style={{ margin: '0 0 14px', fontSize: 19, fontWeight: 800, lineHeight: 1.35 }}>Moeten de afvoerbuizen ook vervangen worden?</p>
          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 9 }}>
            <Button tone="quiet" pressed={interpolate(frame, [T.playQuestion - 3, T.playQuestion, T.playQuestion + 5], [0, 1, 0], clamp)}>
              {playing ? <><Icon name="speaker" size={18} /> Speelt af</> : <><Icon name="play" size={14} /> Vraag afspelen</>}
            </Button>
            <Tap t={interpolate(frame, [T.playQuestion - 2, T.playQuestion + 16], [0, 1], clamp)} style={{ left: 80, top: 27 }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
              <span style={{ display: 'inline-flex', width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: recording ? C.critical : C.ink }}>
                <Icon name="mic" size={22} color="#fff" />
              </span>
              <span style={{ fontSize: 15, fontWeight: 750, lineHeight: 1.2 }}>{recording ? 'Opnemen' : 'Antwoord'}<br />{recording ? 'loopt' : 'opnemen'}</span>
            </span>
            <Tap t={interpolate(frame, [T.answerStart - 2, T.answerStart + 16], [0, 1], clamp)} style={{ left: 196, top: 27 }} />
          </div>
        </div>
      </div>
      <Appear from={T.answerWords - 4} to={T.questionResolved}>
        <div style={{ justifySelf: 'end', maxWidth: 360, padding: '14px 17px', borderRadius: '22px 22px 6px 22px', background: C.ink, color: '#fff' }}>
          <p style={{ margin: '0 0 3px', color: C.accent, fontSize: 13, fontWeight: 800 }}>Jouw antwoord</p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, minHeight: 27 }}>“{answerWords.slice(0, shown).join(' ')}{shown >= answerWords.length ? '”' : ''}</p>
        </div>
      </Appear>
    </div>
  );
}

function FinalizeGroup() {
  const frame = useCurrentFrame();
  const ready = frame >= T.ready;
  const pressed = interpolate(frame, [T.finalizePress - 4, T.finalizePress, T.finalizePress + 6], [0, 1, 0], clamp);
  const total = SUB_FULL + vat(SUB_FULL);
  return (
    <div style={{ position: 'relative', display: 'grid', gap: 12 }}>
      <Totals subtotalCents={SUB_FULL} vatCents={vat(SUB_FULL)} complete />
      {ready ? (
        <Appear from={T.ready} to={T.sendStart}>
          <div style={{ padding: 22, borderRadius: 24, background: C.successBg, color: C.success }}>
            <span style={{ display: 'inline-flex', width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: C.success }}>
              <Icon name="check" size={28} color="#fff" />
            </span>
            <p style={{ margin: '12px 0 4px', fontSize: 25, fontWeight: 850, color: C.ink }}>Offerte is klaar</p>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>Familie Claes · {formatEuros(total)} incl. btw</p>
          </div>
        </Appear>
      ) : (
        <div style={{ position: 'relative' }}>
          <Button pressed={pressed} style={{ width: '100%', minHeight: 62, fontSize: 17 }}>Offerte afwerken · {formatEuros(total)}</Button>
          <Tap t={interpolate(frame, [T.finalizePress - 2, T.finalizePress + 16], [0, 1], clamp)} style={{ left: '50%', top: 31 }} />
        </div>
      )}
    </div>
  );
}

function SendGroup() {
  const frame = useCurrentFrame();
  const sent = frame >= T.sent;
  const pressed = interpolate(frame, [T.sendPress - 4, T.sendPress, T.sendPress + 6], [0, 1, 0], clamp);
  const total = SUB_FULL + vat(SUB_FULL);
  return (
    <div style={{ position: 'relative', height: 500 }}>
      <Appear from={T.sendStart} to={T.customerStart} style={{ position: 'absolute', left: 0, top: 0, width: 250, transform: 'rotate(-3deg)' }}>
        <div style={{ padding: '20px 18px', borderRadius: 10, background: '#fff', boxShadow: '0 20px 40px -18px rgba(58,42,28,.35)', aspectRatio: '1 / 1.3' }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 850 }}>Dakwerken Peeters</p>
          <p style={{ margin: '2px 0 14px', color: C.muted, fontSize: 10, fontWeight: 600 }}>Kerkstraat 1, 2440 Geel</p>
          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 850 }}>Offerte 2026-014</p>
          <p style={{ margin: '0 0 12px', color: C.muted, fontSize: 10, fontWeight: 600 }}>Voor familie Claes</p>
          {[tiles, gutterPriced, downpipes, container].map((line) => (
            <div key={line.description} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 600 }}>
              <span>{line.description}</span><span>{formatEuros(line.totalCents ?? 0)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, fontWeight: 850 }}>
            <span>Totaal incl. btw</span><span>{formatEuros(total)}</span>
          </div>
        </div>
      </Appear>
      <Appear from={T.sendStart + 14} to={T.customerStart} style={{ position: 'absolute', right: 0, top: 96, width: 330 }}>
        <Card style={{ display: 'grid', gap: 11, padding: 18 }}>
          <div>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 850 }}>Mailen naar de klant</p>
            <p style={{ margin: '2px 0 0', color: C.muted, fontSize: 13, fontWeight: 600 }}>Via Gmail · je eigen adres</p>
          </div>
          <Field label="Aan" value="Familie Claes" />
          <Field label="Onderwerp" value="Offerte voor uw dak" />
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: C.muted, fontSize: 12.5, fontWeight: 650 }}>
            <Icon name="file" size={15} color={C.muted} /> De offerte-pdf wordt automatisch toegevoegd.
          </p>
          {sent ? (
            <Alert tone="success"><Icon name="check" size={18} color={C.success} /> Offerte verstuurd naar familie Claes.</Alert>
          ) : (
            <div style={{ position: 'relative' }}>
              <Button pressed={pressed} style={{ width: '100%' }}><Icon name="mail" size={20} color="#fff" /> Offerte versturen</Button>
              <Tap t={interpolate(frame, [T.sendPress - 2, T.sendPress + 16], [0, 1], clamp)} style={{ left: '50%', top: 27 }} />
            </div>
          )}
        </Card>
      </Appear>
    </div>
  );
}

function CustomerGroup() {
  const frame = useCurrentFrame();
  const accepted = frame >= T.accepted;
  const pressed = interpolate(frame, [T.acceptPress - 4, T.acceptPress, T.acceptPress + 6], [0, 1, 0], clamp);
  const total = SUB_FULL + vat(SUB_FULL);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <span style={{ justifySelf: 'start' }}><Pill tone="final">Bij je klant, zonder account</Pill></span>
      <Card style={{ padding: 20 }}>
        <Eyebrow>Offerte</Eyebrow>
        <p style={{ margin: 0, fontSize: 25, fontWeight: 850, letterSpacing: '-0.02em' }}>Dakwerken Peeters</p>
        <p style={{ margin: '3px 0 14px', color: C.muted, fontSize: 14.5, fontWeight: 600 }}>Offerte 2026-014 · voor familie Claes</p>
        {[tiles, gutterPriced, downpipes, container].map((line) => (
          <div key={line.description} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>
            <span>{line.description}</span><span style={{ fontWeight: 700 }}>{formatEuros(line.totalCents ?? 0)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0 16px', fontSize: 19, fontWeight: 850, fontVariantNumeric: 'tabular-nums' }}>
          <span>Totaal incl. btw</span><span>{formatEuros(total)}</span>
        </div>
        {accepted ? (
          <Alert tone="success"><Icon name="check" size={20} color={C.success} /> Deze offerte is aanvaard. Bedankt voor je bevestiging.</Alert>
        ) : (
          <div style={{ position: 'relative' }}>
            <Button pressed={pressed} style={{ width: '100%' }}>Offerte accepteren</Button>
            <Tap t={interpolate(frame, [T.acceptPress - 2, T.acceptPress + 16], [0, 1], clamp)} style={{ left: '50%', top: 27 }} />
          </div>
        )}
      </Card>
    </div>
  );
}

// ---- Frame furniture ---------------------------------------------------------

function Captions({ size }: { size: number }) {
  const frame = useCurrentFrame();
  const caption = CAPTIONS.find((item) => frame >= item.from && frame < item.to);
  if (!caption) return null;
  const inn = interpolate(frame, [caption.from, caption.from + 10], [0, 1], clamp);
  const out = interpolate(frame, [caption.to - 8, caption.to], [0, 1], clamp);
  return (
    <p
      style={{
        margin: 0,
        fontSize: size,
        fontWeight: 850,
        lineHeight: 1.06,
        letterSpacing: '-0.032em',
        textWrap: 'balance',
        opacity: inn * (1 - out),
        transform: `translateY(${(1 - inn) * 18 - out * 10}px)`,
      }}
    >
      {caption.text}
    </p>
  );
}

function StepTracker({ size }: { size: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: size * 0.4 }}>
      {STEPS.map((step) => {
        const active = frame >= step.from && frame < step.to;
        const done = frame >= step.to;
        return (
          <span
            key={step.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: size * 0.3,
              padding: `${size * 0.32}px ${size * 0.7}px`,
              borderRadius: 999,
              border: `2px solid ${active ? C.ink : done ? C.accent : 'rgba(20,18,15,.14)'}`,
              background: active ? C.ink : done ? C.accent : 'transparent',
              color: active ? '#fff' : done ? C.accentInk : C.muted,
              fontSize: size,
              fontWeight: 800,
            }}
          >
            {done && <Icon name="check" size={size * 0.95} color={C.accentInk} strokeWidth={2.6} />}
            {step.label}
          </span>
        );
      })}
    </div>
  );
}

export function Wordmark({ size, color = C.ink }: { size: number; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.45, color, fontSize: size, fontWeight: 850, letterSpacing: '-0.01em' }}>
      <span style={{ display: 'inline-flex', width: size * 1.7, height: size * 1.7, alignItems: 'center', justifyContent: 'center', borderRadius: 999, background: C.ink }}>
        <Icon name="mic" size={size * 0.85} color="#fff" />
      </span>
      Werkoffertes
    </span>
  );
}

function Stage() {
  return (
    <>
      <Appear from={T.recordStart} to={T.processingStart}><RecordGroup /></Appear>
      <Appear from={T.processingStart} to={T.linesStart}><ProcessingGroup /></Appear>
      <Appear from={T.linesStart} to={T.questionStart}><LinesGroup withDownpipes={false} /></Appear>
      <Appear from={T.questionStart} to={T.linesAgain}><QuestionGroup /></Appear>
      <Appear from={T.linesAgain} to={T.finalizeStart} dy={0}><LinesGroup withDownpipes /></Appear>
      <Appear from={T.finalizeStart} to={T.sendStart}><FinalizeGroup /></Appear>
      <Appear from={T.sendStart} to={T.customerStart} dy={0}><SendGroup /></Appear>
      <Appear from={T.customerStart} to={T.ctaStart}><CustomerGroup /></Appear>
    </>
  );
}

export function Demo() {
  const layout = useLayout();
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [T.recordStart, T.recordStart + 12], [0, 1], clamp);
  const fadeOut = interpolate(frame, [T.ctaStart - 10, T.ctaStart], [1, 0], clamp);

  if (layout === 'wide') {
    const scale = 1.86;
    return (
      <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
        <div style={{ position: 'absolute', left: 130, top: 104 }}><StepTracker size={24} /></div>
        <div style={{ position: 'absolute', left: 130, top: 0, bottom: 0, width: 660, display: 'flex', alignItems: 'center' }}>
          <Captions size={70} />
        </div>
        <div style={{ position: 'absolute', left: 130, bottom: 96 }}><Wordmark size={26} /></div>
        <div style={{ position: 'absolute', left: 900, top: 0, width: 476 * scale, height: 1080, display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 476, height: 540, transform: `scale(${scale})`, transformOrigin: 'left center' }}>
            <StageSlots />
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  const scale = 2.2;
  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      <div style={{ position: 'absolute', left: 70, top: 44 }}><Wordmark size={26} /></div>
      <div style={{ position: 'absolute', left: 70, right: 70, top: 128 }}><StepTracker size={27} /></div>
      <div style={{ position: 'absolute', left: 70, right: 70, top: 240, height: 390, display: 'flex', alignItems: 'center' }}>
        <Captions size={78} />
      </div>
      <div style={{ position: 'absolute', left: (1080 - 460 * scale) / 2, top: 660, width: 460 * scale, height: 1180, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 460, height: 536, transform: `scale(${scale})`, transformOrigin: 'left center' }}>
          <StageSlots />
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** Every stage group is centred vertically in the same box. */
function StageSlots() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', alignItems: 'center' }}>
      <div style={{ gridArea: '1 / 1' }}><Stage /></div>
    </div>
  );
}
