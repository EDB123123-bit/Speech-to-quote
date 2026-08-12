'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { groupQuotesByStage, type QuoteWithTotal } from '@/lib/quotes/group-by-stage';
import type { MoveTarget } from '@/lib/quotes/stage-move';
import type { PipelineStage } from '@/lib/supabase/types';
import { moveQuoteToStage } from '@/app/pijplijn/board-actions';
import QuoteCard from '@/components/kanban/QuoteCard';

type Column = { key: string; label: string; target: MoveTarget; quotes: QuoteWithTotal[] };

function Droppable({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className="flex min-h-[200px] w-72 shrink-0 flex-col gap-3 rounded-2xl border border-border bg-paper p-3">
      {children}
    </div>
  );
}

export default function KanbanBoard({
  quotes,
  stages,
}: {
  quotes: QuoteWithTotal[];
  stages: PipelineStage[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const grouped = groupQuotesByStage(quotes, stages);

  const columns: Column[] = [
    { key: 'concept', label: 'Concept', target: { type: 'concept' }, quotes: grouped.concept },
    { key: 'afgewerkt', label: 'Afgewerkt', target: { type: 'afgewerkt' }, quotes: grouped.afgewerkt },
    ...stages.map((s) => ({
      key: s.id,
      label: s.name,
      target: { type: 'stage' as const, stageId: s.id },
      quotes: grouped.byStage.get(s.id) ?? [],
    })),
  ];

  function columnOf(quoteId: string): Column | undefined {
    return columns.find((c) => c.quotes.some((q) => q.id === quoteId));
  }

  async function move(quoteId: string, target: MoveTarget) {
    setBusyId(quoteId);
    setError(null);
    try {
      const result = await moveQuoteToStage(quoteId, target);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError('Verplaatsen mislukt. Probeer opnieuw.');
    } finally {
      setBusyId(null);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const from = columnOf(String(active.id));
    if (!from || from.key === over.id) return;

    const targetColumn = columns.find((c) => c.key === over.id);
    if (!targetColumn) return;

    void move(String(active.id), targetColumn.target);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert" className="alert alert-critical">{error}</p>}

      <DndContext onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <div key={column.key} className="flex flex-col gap-2">
              <h2 className="label">
                {column.label} <span className="nums">({column.quotes.length})</span>
              </h2>
              <Droppable id={column.key}>
                {column.quotes.map((quote) => (
                  <QuoteCard
                    key={quote.id}
                    quote={quote}
                    column={column.target}
                    stages={stages}
                    busy={busyId === quote.id}
                    onMove={(target) => void move(quote.id, target)}
                  />
                ))}
              </Droppable>
            </div>
          ))}
        </div>
      </DndContext>
    </div>
  );
}
