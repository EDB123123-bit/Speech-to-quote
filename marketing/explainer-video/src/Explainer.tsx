import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, PHONE_LABEL, SITE_LABEL, fontFamily } from './brand';
import { Demo, Wordmark } from './Demo';
import { CAPTIONS, T } from './timeline';
import { Icon } from './ui';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

function Hook() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const tall = height > width;
  if (frame >= T.hookEnd) return null;

  const [question, answer] = CAPTIONS;
  const qIn = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 20 });
  const qOut = interpolate(frame, [question.to - 10, question.to], [0, 1], clamp);
  const aIn = spring({ frame: frame - answer.from, fps, config: { damping: 200 }, durationInFrames: 20 });
  const aOut = interpolate(frame, [T.hookEnd - 10, T.hookEnd], [0, 1], clamp);
  const pad = tall ? 90 : 160;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${pad}px` }}>
      {frame < question.to ? (
        <div style={{ opacity: qIn * (1 - qOut), transform: `translateY(${(1 - qIn) * 30}px)` }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 34, padding: '10px 22px', borderRadius: 999, background: C.paperStrong, color: C.muted, fontSize: tall ? 40 : 34, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            21:47
          </span>
          <p style={{ margin: 0, maxWidth: tall ? 900 : 1400, fontSize: tall ? 104 : 118, fontWeight: 850, lineHeight: 1.02, letterSpacing: '-0.035em', textWrap: 'balance' }}>
            {question.text}
          </p>
        </div>
      ) : (
        <div style={{ opacity: aIn * (1 - aOut), transform: `translateY(${(1 - aIn) * 30}px)` }}>
          <div style={{ marginBottom: 44 }}><Wordmark size={tall ? 58 : 54} /></div>
          <p style={{ margin: 0, maxWidth: tall ? 900 : 1400, fontSize: tall ? 104 : 118, fontWeight: 850, lineHeight: 1.02, letterSpacing: '-0.035em', textWrap: 'balance' }}>
            {answer.text}
          </p>
        </div>
      )}
    </AbsoluteFill>
  );
}

function WhatsAppMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={C.whatsapp} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

export function PilotCard({ tall, compact = false }: { tall: boolean; compact?: boolean }) {
  const title = compact ? 64 : tall ? 108 : 104;
  return (
    <div style={{ display: 'grid', gap: compact ? 22 : 40, justifyItems: 'start' }}>
      <Wordmark size={compact ? 26 : tall ? 44 : 40} />
      <p style={{ margin: 0, maxWidth: tall ? 920 : 1300, fontSize: title, fontWeight: 850, lineHeight: 1.02, letterSpacing: '-0.035em', textWrap: 'balance' }}>
        Word een van de vijf pilotklanten.
      </p>
      <p style={{ margin: 0, maxWidth: tall ? 900 : 1200, color: C.accentInk, fontSize: compact ? 26 : tall ? 46 : 42, fontWeight: 650, lineHeight: 1.3 }}>
        Gratis pilot voor dakwerkers en dakdekkers in Vlaanderen en Nederland.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: compact ? 16 : 28 }}>
        <span style={{ padding: compact ? '12px 20px' : '20px 32px', borderRadius: 999, background: C.ink, color: '#fff', fontSize: compact ? 24 : tall ? 42 : 40, fontWeight: 800 }}>
          {SITE_LABEL}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 14, fontSize: compact ? 24 : tall ? 42 : 40, fontWeight: 800 }}>
          <WhatsAppMark size={compact ? 28 : 46} /> {PHONE_LABEL}
        </span>
      </div>
    </div>
  );
}

function Cta() {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const tall = height > width;
  if (frame < T.ctaStart - 6) return null;
  const bg = interpolate(frame, [T.ctaStart - 6, T.ctaStart + 8], [0, 1], clamp);
  const inn = spring({ frame: frame - T.ctaStart, fps, config: { damping: 200 }, durationInFrames: 24 });
  return (
    <AbsoluteFill style={{ background: C.accent, opacity: bg, justifyContent: 'center', padding: tall ? '0 80px' : '0 160px' }}>
      <div style={{ opacity: inn, transform: `translateY(${(1 - inn) * 40}px)` }}>
        <PilotCard tall={tall} />
      </div>
    </AbsoluteFill>
  );
}

export function Explainer() {
  return (
    <AbsoluteFill style={{ background: C.paper, color: C.ink, fontFamily }}>
      <Hook />
      <Demo />
      <Cta />
      <Progress />
    </AbsoluteFill>
  );
}

/** A thin progress bar at the very top, so muted viewers know how long it runs. */
function Progress() {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  return <div style={{ position: 'absolute', left: 0, top: 0, height: 8, width: (frame / (durationInFrames - 1)) * width, background: C.ink, opacity: 0.85 }} />;
}

/** 1200x630 image for link previews (WhatsApp, Facebook, LinkedIn). */
export function OgImage() {
  return (
    <AbsoluteFill style={{ background: C.accent, color: C.ink, fontFamily, padding: '64px 72px', justifyContent: 'space-between' }}>
      <Wordmark size={30} />
      <p style={{ margin: 0, fontSize: 70, fontWeight: 850, lineHeight: 1.04, letterSpacing: '-0.035em' }}>
        <span style={{ display: 'block' }}>Spreek je offerte in.</span>
        <span style={{ display: 'block', whiteSpace: 'nowrap' }}>Verstuurd voor je thuis bent.</span>
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
        <p style={{ margin: 0, color: C.accentInk, fontSize: 28, fontWeight: 700, lineHeight: 1.25 }}>Gratis pilot voor dakwerkers in Vlaanderen en Nederland</p>
        <span style={{ display: 'inline-flex', flex: '0 0 auto', alignItems: 'center', gap: 10, padding: '14px 24px', borderRadius: 999, background: C.ink, color: '#fff', fontSize: 26, fontWeight: 800, whiteSpace: 'nowrap' }}>
          <Icon name="mic" size={24} color="#fff" /> Word pilotklant
        </span>
      </div>
    </AbsoluteFill>
  );
}
