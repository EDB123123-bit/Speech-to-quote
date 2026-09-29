import type { CSSProperties, ReactNode } from 'react';
import { C, formatEuros } from './brand';

/*
 * Pieces of the Werkoffertes app, rebuilt with the exact values from the
 * app's globals.css (radii, weights, colours) so every frame shows the real
 * product look. Sizes are the app's logical CSS pixels; scenes scale them up.
 */

export type IconName = 'mic' | 'check' | 'mail' | 'speaker' | 'play' | 'file';

export function Icon({ name, size = 24, color = 'currentColor', strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'mic':
      return (
        <svg {...common}>
          <rect x="9" y="2" width="6" height="11" rx="3" fill={color} stroke="none" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
        </svg>
      );
    case 'check':
      return <svg {...common}><path d="m4 12.5 5 5L20 6.5" /></svg>;
    case 'mail':
      return <svg {...common}><path d="M3 5.5h18v13H3v-13Z" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></svg>;
    case 'speaker':
      return <svg {...common}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5Z" fill={color} /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>;
    case 'play':
      return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M8 5.5v13l11-6.5-11-6.5Z" /></svg>;
    case 'file':
      return <svg {...common}><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h4" /></svg>;
  }
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ padding: 20, borderRadius: 24, background: C.surface, boxShadow: '0 1px 2px rgba(58,42,28,.06), 0 18px 40px -18px rgba(58,42,28,.28)', ...style }}>{children}</div>;
}

export function Eyebrow({ children, color = C.muted, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return <p style={{ margin: '0 0 5px', color, fontSize: 13, fontWeight: 800, letterSpacing: '0.085em', textTransform: 'uppercase', ...style }}>{children}</p>;
}

export function Pill({ children, tone }: { children: ReactNode; tone: 'warning' | 'success' | 'final' | 'neutral' }) {
  const tones = {
    warning: { background: C.warningBg, color: C.warning },
    success: { background: C.successBg, color: C.success },
    final: { background: C.accent, color: C.accentInk },
    neutral: { background: C.paperStrong, color: C.body },
  } as const;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 30, padding: '4px 11px', borderRadius: 999, fontSize: 13, fontWeight: 800, ...tones[tone] }}>
      {children}
    </span>
  );
}

export type Line = {
  description: string;
  meta?: string;
  totalCents: number | null;
  needsWork?: boolean;
  suggestion?: boolean;
};

export function LineItem({ line, style, children }: { line: Line; style?: CSSProperties; children?: ReactNode }) {
  return (
    <div
      style={{
        overflow: 'hidden',
        borderRadius: 22,
        background: line.needsWork ? C.warningSurface : C.surface,
        border: line.needsWork ? `2px solid ${C.warningLine}` : '2px solid transparent',
        boxShadow: '0 1px 2px rgba(32,42,88,.08)',
        ...style,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center', padding: '15px 17px' }}>
        <span>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{line.description}</span>
          {line.needsWork ? (
            <span style={{ display: 'inline-block', marginTop: 8 }}><Pill tone="warning">Prijs toevoegen / verifiëren</Pill></span>
          ) : (
            <span style={{ display: 'block', marginTop: 4, color: C.muted, fontSize: 15, fontWeight: 550, fontVariantNumeric: 'tabular-nums' }}>{line.meta}</span>
          )}
        </span>
        <span style={{ fontSize: 17, fontWeight: 850, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {line.totalCents === null ? 'Onbekend' : formatEuros(line.totalCents)}
        </span>
      </div>
      {children}
    </div>
  );
}

export function Totals({ subtotalCents, vatCents, complete }: { subtotalCents: number; vatCents: number; complete: boolean }) {
  const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '3px 0', color: C.body, fontSize: 16, fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={{ padding: '16px 18px', borderRadius: 24, background: C.surface }}>
      <div style={row}><span>{complete ? 'Subtotaal' : 'Subtotaal gekende werken'}</span><span>{formatEuros(subtotalCents)}</span></div>
      <div style={row}><span>Btw 6%</span><span>{formatEuros(vatCents)}</span></div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, marginTop: 11, paddingTop: 12, borderTop: `2px solid ${C.ink}` }}>
        <strong style={{ fontSize: 17 }}>{complete ? 'Totaal incl. btw' : 'Totaal gekende werken'}</strong>
        <strong style={{ fontSize: 26, fontWeight: 850, fontVariantNumeric: 'tabular-nums' }}>{formatEuros(subtotalCents + vatCents)}</strong>
      </div>
    </div>
  );
}

export function Button({ children, tone = 'primary', pressed = 0, style }: { children: ReactNode; tone?: 'primary' | 'quiet' | 'outline' | 'accent'; pressed?: number; style?: CSSProperties }) {
  const tones = {
    primary: { background: C.ink, color: '#fff', borderColor: 'transparent' },
    quiet: { background: C.paperStrong, color: C.ink, borderColor: 'transparent' },
    outline: { background: C.surface, color: C.ink, borderColor: C.fieldBorder },
    accent: { background: C.accent, color: C.ink, borderColor: 'transparent' },
  } as const;
  return (
    <span
      style={{
        display: 'inline-flex',
        minHeight: 54,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        padding: '13px 18px',
        border: '2px solid',
        borderRadius: 18,
        fontSize: 16,
        fontWeight: 800,
        lineHeight: 1.2,
        transform: `scale(${1 - pressed * 0.035})`,
        ...tones[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Field({ label, value, tall = false }: { label: string; value: ReactNode; tall?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      <span style={{ fontSize: 15, fontWeight: 800 }}>{label}</span>
      <div style={{ minHeight: tall ? 96 : 52, padding: '13px 15px', border: `2px solid ${C.fieldBorder}`, borderRadius: 17, background: C.surface, fontSize: 16, fontWeight: 600, lineHeight: 1.45, color: C.ink }}>
        {value}
      </div>
    </div>
  );
}

export function Alert({ children, tone }: { children: ReactNode; tone: 'success' | 'warning' }) {
  const colors = tone === 'success' ? { background: C.successBg, color: C.success } : { background: C.warningBg, color: C.warning };
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 16, borderRadius: 18, fontSize: 15, fontWeight: 650, lineHeight: 1.45, ...colors }}>
      {children}
    </div>
  );
}

/** A finger tap: an expanding ring that fades out. `t` runs 0..1. */
export function Tap({ t, size = 90, style }: { t: number; size?: number; style?: CSSProperties }) {
  if (t <= 0 || t >= 1) return null;
  return (
    <span
      style={{
        position: 'absolute',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: 999,
        border: `4px solid ${C.accentInk}`,
        background: 'rgba(32,42,88,.12)',
        opacity: 1 - t,
        transform: `scale(${0.6 + t * 0.7})`,
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
}
