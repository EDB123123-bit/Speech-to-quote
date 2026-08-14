import type { ExtractionResult } from '@/lib/ai/schemas';
import type { CatalogItem } from '@/lib/supabase/types';

const STOP_WORDS = new Set([
  'arbeid', 'leggen', 'plaatsen', 'per', 'stuk', 'uur', 'meter', 'vierkante',
  'materiaal', 'vervangen', 'herstellen', 'maken', 'zetten', 'monteren',
]);

const NUMBER_WORDS: Record<string, number> = {
  een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9,
  tien: 10, elf: 11, twaalf: 12, dertien: 13, veertien: 14, vijftien: 15,
  zestien: 16, zeventien: 17, achttien: 18, negentien: 19, twintig: 20,
  dertig: 30, veertig: 40, vijftig: 50, zestig: 60, zeventig: 70,
  tachtig: 80, negentig: 90, honderd: 100,
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9²]+/g, ' ')
    .trim();
}

function significantTerms(name: string): string[] {
  return normalize(name)
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !STOP_WORDS.has(term));
}

function findCatalogMention(transcript: string, item: CatalogItem): { term: string; index: number } | null {
  const text = normalize(transcript);
  for (const term of significantTerms(item.name)) {
    const index = text.indexOf(term);
    if (index >= 0) return { term, index };
  }
  return null;
}

function findCatalogMatch(description: string, catalog: CatalogItem[]): CatalogItem | undefined {
  const text = normalize(description);
  return catalog.find((item) => significantTerms(item.name).some((term) => text.includes(term)));
}

function nearbyQuantity(transcript: string, mention: { term: string; index: number }): number | null {
  const text = normalize(transcript);
  const start = Math.max(0, mention.index - 100);
  const end = Math.min(text.length, mention.index + mention.term.length + 20);
  const window = text.slice(start, end);
  const mentionInWindow = mention.index - start;
  const candidates: Array<{ value: number; distance: number }> = [];

  for (const match of window.matchAll(/\b\d+(?:[.,]\d+)?\b/g)) {
    candidates.push({
      value: Number(match[0].replace(',', '.')),
      distance: Math.abs((match.index ?? 0) + match[0].length - mentionInWindow),
    });
  }

  for (const match of window.matchAll(/\b[a-z]+\b/g)) {
    const value = NUMBER_WORDS[match[0]];
    if (value !== undefined) {
      candidates.push({
        value,
        distance: Math.abs((match.index ?? 0) + match[0].length - mentionInWindow),
      });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.value && candidates[0].value > 0 ? candidates[0].value : null;
}

function hasClarification(questions: { questionNl: string }[], question: string): boolean {
  return questions.some((item) => item.questionNl.trim().toLowerCase() === question.trim().toLowerCase());
}

/** Protects quote generation from a valid but incomplete model response. */
export function reconcileExtraction(
  transcript: string,
  extraction: ExtractionResult,
  catalog: CatalogItem[],
): ExtractionResult {
  const tasks = extraction.tasks.map((task) => {
    const explicit = task.catalogItemId
      ? catalog.find((item) => item.id === task.catalogItemId)
      : undefined;
    const inferred = explicit ?? findCatalogMatch(task.description, catalog);
    return inferred
      ? { ...task, catalogItemId: inferred.id, unit: inferred.unit }
      : task;
  });

  const clarificationQuestions = [...extraction.clarifications];
  const matchedIds = new Set(tasks.flatMap((task) => task.catalogItemId ? [task.catalogItemId] : []));

  for (const item of catalog) {
    if (matchedIds.has(item.id)) continue;

    const mention = findCatalogMention(transcript, item);
    if (!mention) continue;

    const quantity = nearbyQuantity(transcript, mention);
    if (quantity !== null) {
      tasks.push({ catalogItemId: item.id, description: item.name, quantity, unit: item.unit });
      matchedIds.add(item.id);
      continue;
    }

    const question = `Hoeveel ${item.name} moet ik opnemen?`;
    if (!hasClarification(clarificationQuestions, question)) {
      clarificationQuestions.push({ questionNl: question });
    }
  }

  if (tasks.length === 0 && clarificationQuestions.length === 0 && transcript.trim() !== '') {
    clarificationQuestions.push({
      questionNl: 'Welke werken of materialen moet ik op deze offerte zetten?',
    });
  }

  return { tasks, clarifications: clarificationQuestions };
}
