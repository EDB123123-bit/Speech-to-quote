'use client';

import Link from 'next/link';
import { useDraggable } from '@dnd-kit/core';
import { formatEuros } from '@/lib/money/totals';
import { reachableTargets, type MoveTarget } from '@/lib/quotes/stage-move';
import type { PipelineStage } from '@/lib/supabase/types';
import type { QuoteWithTotal } from '@/lib/quotes/group-by-stage';

// `column` is the card's current position, expressed as the same MoveTarget
// shape reachableTargets() expects — there's no separate "position" type,
// a position and a move target are the same thing from opposite ends.
type Props = {
  quote: QuoteWithTotal;
  column: MoveTarget;
  stages: PipelineStage[];
  onMove: (target: MoveTarget) => void;
  busy: boolean;
};

export default function QuoteCard({ quote, column, stages, onMove, busy }: Props) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: quote.id });
  const targets = reachableTargets(column, stages);

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <article ref={setNodeRef} style={style} className="card flex flex-col gap-3 shadow-[0_5px_16px_rgba(58,42,28,0.05)]">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/offertes/${quote.id}`} className="flex-1 hover:text-accent">
          <p className="text-lg font-extrabold">{quote.customer_name ?? 'Zonder klantnaam'}</p>
          <p className="nums text-sm text-muted">
            {quote.quote_number ?? quote.id.split('-')[0].toUpperCase()} · {new Date(`${quote.issue_date ?? quote.created_at.slice(0, 10)}T00:00:00`).toLocaleDateString('nl-BE')}
          </p>
        </Link>

        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Sleep ${quote.customer_name ?? 'offerte'}`}
          className="cursor-grab touch-none px-1 text-muted hover:text-ink"
        >
          ⠿
        </button>
      </div>

      <p className="nums text-right text-lg font-extrabold">{formatEuros(quote.grandTotalCents)}</p>

      {targets.length > 0 && (
        <details className="relative">
          <summary className="cursor-pointer text-sm font-bold text-muted hover:text-ink">
            Verplaats naar…
          </summary>
          <ul className="card absolute right-0 z-20 mt-1 w-52 gap-1 p-2 shadow-[var(--shadow)]">
            {targets.map((t) => (
              <li key={t.label}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMove(t.target)}
                  className="min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm font-bold hover:bg-paper disabled:opacity-50"
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
