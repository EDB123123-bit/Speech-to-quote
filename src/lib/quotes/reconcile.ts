import type { ExtractionResult } from '@/lib/ai/schemas';
import type { LineClassification } from '@/lib/supabase/types';
import { filterPriceClarifications } from './clarifications';

type ReconcileInput = {
  tasks: Array<{ description: string; quantity: number | null; unit: string | null; unitPriceCents?: number | null; priceExplicit?: boolean; classification?: Exclude<LineClassification, 'unclassified'>; catalogItemId?: string | null }>;
  clarifications: Array<{ questionNl: string }>;
};

/**
 * Normalizes model output without consulting a catalogue. Missing prices and
 * missing dimensions remain missing; they are valid draft-quote states.
 */
export function reconcileExtraction(transcript: string, extraction: ReconcileInput, _legacyCatalog?: unknown): ExtractionResult {
  void _legacyCatalog;
  const tasks = extraction.tasks
    .map((task) => ({
      ...task,
      description: task.description.trim(),
      quantity: task.quantity !== null && task.quantity > 0 ? task.quantity : null,
      unit: task.unit?.trim() || null,
      unitPriceCents: task.priceExplicit === true && task.unitPriceCents !== null && task.unitPriceCents !== undefined && task.unitPriceCents >= 0
        ? task.unitPriceCents
        : null,
      priceExplicit: task.priceExplicit === true,
      classification: task.classification ?? 'labor_service',
    }))
    .filter((task) => task.description.length > 0);

  const clarificationQuestions = filterPriceClarifications(extraction.clarifications);
  if (tasks.length === 0 && clarificationQuestions.length === 0 && transcript.trim() !== '') {
    clarificationQuestions.push({
      questionNl: 'Welke werken of materialen moet ik op deze offerte zetten?',
    });
  }

  return { tasks, clarifications: clarificationQuestions };
}
