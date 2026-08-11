# Pijplijn Kanban Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a CRM-style Kanban board ("Pijplijn") where every quote automatically sits in a Concept or Afgewerkt column (derived from its real status), and can be manually moved through contractor-defined custom stages after that.

**Architecture:** A new `pipeline_stages` table (one row per contractor-defined stage) plus a nullable `quotes.pipeline_stage_id`. Concept/Afgewerkt are never rows — they're rendered directly from `quotes.status`. The existing finalize route's logic is extracted into a dependency-injected `finalizeQuote()` helper (mirroring the existing `generateQuote()` pattern) so the Kanban board's "drag into Afgewerkt" action and the quote page's finalize button share one code path. A `movePipelineStage()` orchestrator (same DI style) handles every other move. All business decisions (can this move happen, which stages are reachable from here, does a card belong in this column) are pure, unit-tested functions; server actions and page components are thin wrappers around them.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase (Postgres + RLS), `@dnd-kit/core` for drag-and-drop, Vitest + Testing Library.

## Global Constraints

- Every user-facing string is Dutch, matching the tone of existing copy (e.g. `"Verwijderen mislukt. Probeer opnieuw."`).
- Every mutating Supabase call checks `{ error }` and throws/returns a Dutch message on failure — no silent failures (this is the exact defect Task 4 of the original plan fixed for `saveTranscript`; don't reintroduce it here).
- Server actions follow the existing pattern: `'use server'` at the top of the file, `requireContractor()` first, `revalidatePath()` after a successful mutation.
- Money is always in integer cents; use the existing `calculateTotals`/`formatEuros`/`toTotalsInput` from `src/lib/money/totals.ts` — never reimplement VAT math.
- New pure business logic goes in `src/lib/quotes/`, gets its own `__tests__` file, and is unit tested with plain data — no live Supabase in tests, matching `finalize-gate.test.ts` and `generate.test.ts`.
- Component styling uses the existing token classes only (`.card`, `.btn`, `.btn-primary`, `.btn-accent`, `.btn-outline`, `.field`, `.label`, `.badge`, `.badge-success`, `.badge-neutral`, `.alert`, `.alert-critical`, `.nums`) — no new colors or ad-hoc Tailwind gray/red/green utility classes.
- `npx tsc --noEmit`, `npm run lint`, and `npm test -- --run` must all pass clean (excluding the pre-existing unrelated errors under `.claude/skills/`) before any task is considered done.

---

## Task 1: Database schema — pipeline stages, default seeding, types

**Files:**
- Create: `supabase/migrations/0005_pipeline_stages.sql`
- Modify: `src/lib/supabase/types.ts`

**Interfaces:**
- Produces: `PipelineStage` type, `Quote.pipeline_stage_id: string | null` — every later task imports these from `@/lib/supabase/types`.

- [ ] **Step 1: Write the migration**

```sql
-- pipeline_stages: contractor-defined stages after a quote is finalized.
-- Concept and Afgewerkt are NOT rows here — they're derived directly from
-- quotes.status, so there's nothing to keep in sync and nothing that can be
-- accidentally renamed or deleted out from under the app.
create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  name text not null,
  sort_order integer not null,
  created_at timestamptz not null default now()
);
create index pipeline_stages_contractor_idx on pipeline_stages(contractor_id, sort_order);

alter table pipeline_stages enable row level security;
create policy pipeline_stages_own on pipeline_stages
  for all using (contractor_id = auth.uid()) with check (contractor_id = auth.uid());

-- Meaningful only while status = 'final'. null while final means "sitting
-- in Afgewerkt, not moved further yet"; ignored entirely while draft.
-- on delete restrict is a DB-level backstop — the delete action checks for
-- occupying quotes itself and returns a friendly error before this could fire.
alter table quotes add column pipeline_stage_id uuid references pipeline_stages(id) on delete restrict;

-- Extend the existing signup trigger function to also seed 4 default
-- stages for every new contractor, editable/deletable like any other stage.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.contractors (id, company_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'company_name', ''));

  insert into public.pipeline_stages (contractor_id, name, sort_order) values
    (new.id, 'Verzonden naar klant', 1),
    (new.id, 'In onderhandeling', 2),
    (new.id, 'Gewonnen', 3),
    (new.id, 'Verloren', 4);

  return new;
end;
$$;
```

- [ ] **Step 2: Apply the migration to the live database**

Use the Supabase MCP tool (`apply_migration`, project ref from `.env.local`'s `NEXT_PUBLIC_SUPABASE_URL`) with the SQL above, name `pipeline_stages`. If MCP tooling isn't available in your environment, run it via the Supabase dashboard's SQL editor instead — either way, the file above must exist in the repo either way so `supabase/migrations` stays the source of truth.

- [ ] **Step 3: Verify the schema**

Run this query (via the same MCP tool or the dashboard SQL editor):

```sql
select column_name from information_schema.columns
where table_name = 'quotes' and column_name = 'pipeline_stage_id';

select count(*) from pg_policies where tablename = 'pipeline_stages';
```

Expected: the first query returns one row; the second returns `1`.

- [ ] **Step 4: Update TypeScript types**

In `src/lib/supabase/types.ts`, add a `PipelineStage` type near `CatalogItem`, and add `pipeline_stage_id` to `Quote`:

```ts
export type PipelineStage = {
  id: string;
  contractor_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};
```

In the existing `Quote` type, add one field (keep every other field as-is):

```ts
  pdf_path: string | null;
  pipeline_stage_id: string | null;
  created_at: string;
```

- [ ] **Step 5: Fix the existing test fixtures that construct a full `Quote`**

Two test files build a complete `Quote` object and will fail to type-check without the new field. In `src/lib/pdf/__tests__/quote-view-model.test.ts`, add `pipeline_stage_id: null,` next to `pdf_path: null,`. Search for any other full `Quote` literal:

```bash
grep -rn "pdf_path: null" src --include="*.test.ts" --include="*.test.tsx"
```

Add `pipeline_stage_id: null,` to each one found.

- [ ] **Step 6: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0005_pipeline_stages.sql src/lib/supabase/types.ts src/lib/pdf/__tests__/quote-view-model.test.ts
git commit -m "feat: add pipeline_stages table and quotes.pipeline_stage_id"
```

---

## Task 2: Move rules and reachable-targets (pure functions)

**Files:**
- Create: `src/lib/quotes/stage-move.ts`
- Test: `src/lib/quotes/__tests__/stage-move.test.ts`

**Interfaces:**
- Consumes: `QuoteStatus`, `PipelineStage` from `@/lib/supabase/types`.
- Produces: `MoveTarget` type, `resolveStageMove()`, `reachableTargets()` — used by Task 5 (`movePipelineStage`) and Task 7 (`KanbanBoard`'s move menu).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/quotes/__tests__/stage-move.test.ts
import { describe, it, expect } from 'vitest';
import { resolveStageMove, reachableTargets, type MoveTarget } from '@/lib/quotes/stage-move';
import type { PipelineStage } from '@/lib/supabase/types';

function stage(overrides: Partial<PipelineStage> = {}): PipelineStage {
  return {
    id: 'stage-1', contractor_id: 'c1', name: 'Verzonden naar klant',
    sort_order: 1, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

describe('resolveStageMove', () => {
  it('allows draft -> afgewerkt', () => {
    const result = resolveStageMove({ currentStatus: 'draft', target: { type: 'afgewerkt' } });
    expect(result).toEqual({ allowed: true });
  });

  it('blocks draft -> concept (no-op target, should never be called, but defends anyway)', () => {
    const result = resolveStageMove({ currentStatus: 'draft', target: { type: 'concept' } });
    expect(result.allowed).toBe(false);
  });

  it('blocks draft -> a custom stage', () => {
    const target: MoveTarget = { type: 'stage', stageId: 'stage-1' };
    const result = resolveStageMove({ currentStatus: 'draft', target });
    expect(result).toEqual({ allowed: false, reason: 'Werk de offerte eerst af.' });
  });

  it('blocks final -> concept', () => {
    const result = resolveStageMove({ currentStatus: 'final', target: { type: 'concept' } });
    expect(result).toEqual({
      allowed: false,
      reason: 'Een afgewerkte offerte kan niet terug naar concept.',
    });
  });

  it('allows final -> afgewerkt', () => {
    const result = resolveStageMove({ currentStatus: 'final', target: { type: 'afgewerkt' } });
    expect(result).toEqual({ allowed: true });
  });

  it('allows final -> a custom stage', () => {
    const target: MoveTarget = { type: 'stage', stageId: 'stage-1' };
    const result = resolveStageMove({ currentStatus: 'final', target });
    expect(result).toEqual({ allowed: true });
  });
});

describe('reachableTargets', () => {
  const stages = [stage({ id: 's1', name: 'Verzonden naar klant', sort_order: 1 }), stage({ id: 's2', name: 'Gewonnen', sort_order: 2 })];

  it('from concept, only offers afgewerkt', () => {
    const targets = reachableTargets({ type: 'concept' }, stages);
    expect(targets).toEqual([{ label: 'Afgewerkt', target: { type: 'afgewerkt' } }]);
  });

  it('from afgewerkt, offers every custom stage but not concept or afgewerkt itself', () => {
    const targets = reachableTargets({ type: 'afgewerkt' }, stages);
    expect(targets).toEqual([
      { label: 'Verzonden naar klant', target: { type: 'stage', stageId: 's1' } },
      { label: 'Gewonnen', target: { type: 'stage', stageId: 's2' } },
    ]);
  });

  it('from a custom stage, offers afgewerkt and every other stage but not itself or concept', () => {
    const targets = reachableTargets({ type: 'stage', stageId: 's1' }, stages);
    expect(targets).toEqual([
      { label: 'Afgewerkt', target: { type: 'afgewerkt' } },
      { label: 'Gewonnen', target: { type: 'stage', stageId: 's2' } },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/quotes/__tests__/stage-move.test.ts`
Expected: FAIL — `Cannot find module '@/lib/quotes/stage-move'`

- [ ] **Step 3: Implement**

```ts
// src/lib/quotes/stage-move.ts
import type { PipelineStage, QuoteStatus } from '@/lib/supabase/types';

export type MoveTarget =
  | { type: 'concept' }
  | { type: 'afgewerkt' }
  | { type: 'stage'; stageId: string };

export type StageMoveResult = { allowed: true } | { allowed: false; reason: string };

export function resolveStageMove(input: {
  currentStatus: QuoteStatus;
  target: MoveTarget;
}): StageMoveResult {
  const { currentStatus, target } = input;

  if (currentStatus === 'draft') {
    if (target.type === 'afgewerkt') return { allowed: true };
    return { allowed: false, reason: 'Werk de offerte eerst af.' };
  }

  // currentStatus === 'final'
  if (target.type === 'concept') {
    return { allowed: false, reason: 'Een afgewerkte offerte kan niet terug naar concept.' };
  }
  return { allowed: true };
}

export function reachableTargets(
  from: MoveTarget,
  stages: PipelineStage[],
): { label: string; target: MoveTarget }[] {
  const targets: { label: string; target: MoveTarget }[] = [];

  if (from.type === 'concept') {
    targets.push({ label: 'Afgewerkt', target: { type: 'afgewerkt' } });
    return targets;
  }

  if (from.type !== 'afgewerkt') {
    targets.push({ label: 'Afgewerkt', target: { type: 'afgewerkt' } });
  }

  for (const s of stages) {
    if (from.type === 'stage' && from.stageId === s.id) continue;
    targets.push({ label: s.name, target: { type: 'stage', stageId: s.id } });
  }

  return targets;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/quotes/__tests__/stage-move.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/quotes/stage-move.ts src/lib/quotes/__tests__/stage-move.test.ts
git commit -m "feat: add pure move-rule and reachable-targets logic for the pipeline board"
```

---

## Task 3: Group quotes into board columns (pure function)

**Files:**
- Create: `src/lib/quotes/group-by-stage.ts`
- Test: `src/lib/quotes/__tests__/group-by-stage.test.ts`

**Interfaces:**
- Consumes: `Quote`, `PipelineStage` from `@/lib/supabase/types`.
- Produces: `QuoteWithTotal` type, `groupQuotesByStage()` — consumed by Task 9 (`pijplijn/page.tsx`) and Task 7 (`KanbanBoard`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/quotes/__tests__/group-by-stage.test.ts
import { describe, it, expect } from 'vitest';
import { groupQuotesByStage, type QuoteWithTotal } from '@/lib/quotes/group-by-stage';
import type { PipelineStage, Quote } from '@/lib/supabase/types';

function quote(overrides: Partial<Quote> = {}): QuoteWithTotal {
  return {
    id: 'q1', contractor_id: 'c1', transcript: null, status: 'draft',
    customer_name: null, customer_address: null, customer_email: null, customer_phone: null,
    audio_path: null, audio_deleted_at: null, pdf_path: null, pipeline_stage_id: null,
    created_at: '2026-08-06T00:00:00Z', grandTotalCents: 0, ...overrides,
  };
}

function stage(overrides: Partial<PipelineStage> = {}): PipelineStage {
  return {
    id: 's1', contractor_id: 'c1', name: 'Verzonden naar klant',
    sort_order: 1, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

describe('groupQuotesByStage', () => {
  it('puts every draft quote in concept, regardless of pipeline_stage_id', () => {
    const q = quote({ id: 'q1', status: 'draft', pipeline_stage_id: 's1' });
    const result = groupQuotesByStage([q], [stage()]);
    expect(result.concept).toEqual([q]);
    expect(result.afgewerkt).toEqual([]);
  });

  it('puts a final quote with no pipeline_stage_id in afgewerkt', () => {
    const q = quote({ id: 'q1', status: 'final', pipeline_stage_id: null });
    const result = groupQuotesByStage([q], [stage()]);
    expect(result.afgewerkt).toEqual([q]);
  });

  it('puts a final quote with a valid pipeline_stage_id in that stage bucket', () => {
    const q = quote({ id: 'q1', status: 'final', pipeline_stage_id: 's1' });
    const result = groupQuotesByStage([q], [stage({ id: 's1' })]);
    expect(result.afgewerkt).toEqual([]);
    expect(result.byStage.get('s1')).toEqual([q]);
  });

  it('falls back to afgewerkt when pipeline_stage_id points at a deleted stage', () => {
    const q = quote({ id: 'q1', status: 'final', pipeline_stage_id: 'deleted-stage' });
    const result = groupQuotesByStage([q], [stage({ id: 's1' })]);
    expect(result.afgewerkt).toEqual([q]);
    expect(result.byStage.get('s1')).toEqual([]);
  });

  it('initializes every stage bucket even when empty', () => {
    const result = groupQuotesByStage([], [stage({ id: 's1' }), stage({ id: 's2', sort_order: 2 })]);
    expect(result.byStage.get('s1')).toEqual([]);
    expect(result.byStage.get('s2')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/quotes/__tests__/group-by-stage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/quotes/group-by-stage'`

- [ ] **Step 3: Implement**

```ts
// src/lib/quotes/group-by-stage.ts
import type { PipelineStage, Quote } from '@/lib/supabase/types';

export type QuoteWithTotal = Quote & { grandTotalCents: number };

export type GroupedQuotes = {
  concept: QuoteWithTotal[];
  afgewerkt: QuoteWithTotal[];
  byStage: Map<string, QuoteWithTotal[]>;
};

export function groupQuotesByStage(
  quotes: QuoteWithTotal[],
  stages: PipelineStage[],
): GroupedQuotes {
  const validStageIds = new Set(stages.map((s) => s.id));
  const byStage = new Map<string, QuoteWithTotal[]>(stages.map((s) => [s.id, []]));
  const concept: QuoteWithTotal[] = [];
  const afgewerkt: QuoteWithTotal[] = [];

  for (const q of quotes) {
    if (q.status === 'draft') {
      concept.push(q);
      continue;
    }

    if (q.pipeline_stage_id && validStageIds.has(q.pipeline_stage_id)) {
      byStage.get(q.pipeline_stage_id)!.push(q);
    } else {
      afgewerkt.push(q);
    }
  }

  return { concept, afgewerkt, byStage };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/quotes/__tests__/group-by-stage.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/quotes/group-by-stage.ts src/lib/quotes/__tests__/group-by-stage.test.ts
git commit -m "feat: add pure quote-to-column grouping logic for the pipeline board"
```

---

## Task 4: Extract `finalizeQuote` as a dependency-injected helper

The current `/api/quotes/[id]/finalize` route has zero unit tests — everything lives inline in the route handler (see `src/app/api/quotes/[id]/finalize/route.ts`). This task extracts its body into a testable helper, following the exact same dependency-injection shape `src/lib/quotes/generate.ts` already uses for `generateQuote`/`GenerateDeps`. The route becomes a thin wrapper. External behavior (the JSON responses the client already handles) does not change.

**Files:**
- Create: `src/lib/quotes/finalize.ts`
- Test: `src/lib/quotes/__tests__/finalize.test.ts`
- Modify: `src/app/api/quotes/[id]/finalize/route.ts`

**Interfaces:**
- Consumes: `checkFinalizeGate` from `@/lib/quotes/finalize-gate`, `renderQuotePdf` from `@/lib/pdf/render`, `logPipelineEvent` from `@/lib/logging/pipeline-events`.
- Produces: `FinalizeDeps` type, `finalizeQuote(deps, quoteId)` — consumed by Task 5 (`movePipelineStage`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/quotes/__tests__/finalize.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { finalizeQuote } from '@/lib/quotes/finalize';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

const contractor: Contractor = {
  id: 'c1', company_name: 'Dakwerken Janssens', address: null, vat_number: null,
  phone: null, onboarding_completed_at: null, created_at: '2026-08-06T00:00:00Z',
};

const draftQuote: Quote = {
  id: 'q1', contractor_id: 'c1', transcript: 'test', status: 'draft',
  customer_name: 'Jan Peeters', customer_address: 'Kerkstraat 1, 9000 Gent',
  customer_email: null, customer_phone: null, audio_path: null, audio_deleted_at: null,
  pdf_path: null, pipeline_stage_id: null, created_at: '2026-08-06T00:00:00Z',
};

const line: QuoteLineItem = {
  id: 'line-1', quote_id: 'q1', catalog_item_id: 'cat-1', description: 'Dakpannen',
  quantity: 80, unit: 'm²', unit_price_cents: 3000, vat_rate: 0.06,
  line_type: 'materials', sort_order: 0, created_at: '2026-08-06T00:00:00Z',
};

function makeDeps(overrides = {}) {
  return {
    loadQuote: vi.fn().mockResolvedValue(draftQuote),
    loadLineItems: vi.fn().mockResolvedValue([line]),
    loadClarifications: vi.fn().mockResolvedValue([]),
    updateStatusToFinal: vi.fn().mockResolvedValue(undefined),
    loadContractor: vi.fn().mockResolvedValue(contractor),
    renderPdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    uploadPdf: vi.fn().mockResolvedValue(undefined),
    savePdfPath: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('finalizeQuote', () => {
  it('returns blockers and does not touch status/PDF when the gate fails', async () => {
    const deps = makeDeps({ loadQuote: vi.fn().mockResolvedValue({ ...draftQuote, customer_name: null }) });
    const result = await finalizeQuote(deps, 'q1');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.blockers.map((b) => b.code)).toContain('missing_customer');
    expect(deps.updateStatusToFinal).not.toHaveBeenCalled();
    expect(deps.renderPdf).not.toHaveBeenCalled();
  });

  it('flips status to final and generates a PDF on success', async () => {
    const deps = makeDeps();
    const result = await finalizeQuote(deps, 'q1');

    expect(result).toEqual({ ok: true });
    expect(deps.updateStatusToFinal).toHaveBeenCalledWith('q1');
    expect(deps.uploadPdf).toHaveBeenCalledWith('c1/q1.pdf', expect.any(Uint8Array));
    expect(deps.savePdfPath).toHaveBeenCalledWith('q1', 'c1/q1.pdf');
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'pdf_generate', status: 'success' }),
    );
  });

  it('still reports success when PDF generation fails — the finalize itself already succeeded', async () => {
    const deps = makeDeps({ renderPdf: vi.fn().mockRejectedValue(new Error('pdf boom')) });
    const result = await finalizeQuote(deps, 'q1');

    expect(result).toEqual({ ok: true });
    expect(deps.updateStatusToFinal).toHaveBeenCalledWith('q1');
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'pdf_generate', status: 'error' }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/quotes/__tests__/finalize.test.ts`
Expected: FAIL — `Cannot find module '@/lib/quotes/finalize'`

- [ ] **Step 3: Implement `finalizeQuote`**

```ts
// src/lib/quotes/finalize.ts
import { checkFinalizeGate, type FinalizeBlocker } from '@/lib/quotes/finalize-gate';
import type { Contractor, Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export type FinalizeDeps = {
  loadQuote: (quoteId: string) => Promise<Quote | null>;
  loadLineItems: (quoteId: string) => Promise<QuoteLineItem[]>;
  loadClarifications: (quoteId: string) => Promise<QuoteClarification[]>;
  updateStatusToFinal: (quoteId: string) => Promise<void>;
  loadContractor: (contractorId: string) => Promise<Contractor | null>;
  renderPdf: (input: { contractor: Contractor; quote: Quote; lineItems: QuoteLineItem[] }) => Promise<Uint8Array>;
  uploadPdf: (path: string, pdf: Uint8Array) => Promise<void>;
  savePdfPath: (quoteId: string, path: string) => Promise<void>;
  log: (event: {
    quoteId: string;
    contractorId: string;
    step: 'pdf_generate';
    status: 'success' | 'error';
    detail: Record<string, unknown>;
  }) => Promise<void>;
};

export type FinalizeResult = { ok: true } | { ok: false; blockers: FinalizeBlocker[] } | { ok: false; error: string };

export async function finalizeQuote(deps: FinalizeDeps, quoteId: string): Promise<FinalizeResult> {
  const quote = await deps.loadQuote(quoteId);
  if (!quote) return { ok: false, error: 'Offerte niet gevonden' };

  const [lineItems, clarifications] = await Promise.all([
    deps.loadLineItems(quoteId),
    deps.loadClarifications(quoteId),
  ]);

  const blockers = checkFinalizeGate({ quote, lineItems, clarifications });
  if (blockers.length > 0) return { ok: false, blockers };

  await deps.updateStatusToFinal(quoteId);

  // PDF failure must not undo finalizing — the quote is already correct and
  // the PDF can be regenerated on demand from the download route.
  try {
    const contractor = await deps.loadContractor(quote.contractor_id);
    if (!contractor) throw new Error('Contractor niet gevonden');

    const pdf = await deps.renderPdf({
      contractor,
      quote: { ...quote, status: 'final' },
      lineItems,
    });

    const path = `${quote.contractor_id}/${quoteId}.pdf`;
    await deps.uploadPdf(path, pdf);
    await deps.savePdfPath(quoteId, path);

    await deps.log({
      quoteId, contractorId: quote.contractor_id, step: 'pdf_generate',
      status: 'success', detail: { path },
    });
  } catch (pdfError) {
    await deps.log({
      quoteId, contractorId: quote.contractor_id, step: 'pdf_generate',
      status: 'error', detail: { error: String(pdfError) },
    });
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/quotes/__tests__/finalize.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Rewrite the route as a thin wrapper**

Replace the full contents of `src/app/api/quotes/[id]/finalize/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { finalizeQuote, type FinalizeDeps } from '@/lib/quotes/finalize';
import { renderQuotePdf } from '@/lib/pdf/render';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import type { Contractor, Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supabase: Awaited<ReturnType<typeof requireContractor>>['supabase'];
  try {
    supabase = (await requireContractor()).supabase;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    }
    throw error;
  }

  const deps: FinalizeDeps = {
    loadQuote: async (quoteId) => {
      const { data } = await supabase.from('quotes').select('*').eq('id', quoteId).single();
      return data as Quote | null;
    },
    loadLineItems: async (quoteId) => {
      const { data } = await supabase.from('quote_line_items').select('*').eq('quote_id', quoteId);
      return (data ?? []) as QuoteLineItem[];
    },
    loadClarifications: async (quoteId) => {
      const { data } = await supabase.from('quote_clarifications').select('*').eq('quote_id', quoteId);
      return (data ?? []) as QuoteClarification[];
    },
    updateStatusToFinal: async (quoteId) => {
      const { error } = await supabase
        .from('quotes').update({ status: 'final' }).eq('id', quoteId).eq('status', 'draft');
      if (error) throw new Error('Afwerken mislukt. Probeer opnieuw.');
    },
    loadContractor: async (contractorId) => {
      const { data } = await supabase.from('contractors').select('*').eq('id', contractorId).single();
      return data as Contractor | null;
    },
    renderPdf: renderQuotePdf,
    uploadPdf: async (path, pdf) => {
      const { error } = await supabase.storage
        .from('quote-pdfs').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      if (error) throw new Error(error.message);
    },
    savePdfPath: async (quoteId, path) => {
      const { error } = await supabase.from('quotes').update({ pdf_path: path }).eq('id', quoteId);
      if (error) throw new Error(error.message);
    },
    log: logPipelineEvent,
  };

  const result = await finalizeQuote(deps, id);

  if (!result.ok && 'error' in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  if (!result.ok) {
    return NextResponse.json({ blockers: result.blockers }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Run the full test suite and type-check**

Run: `npx tsc --noEmit && npm run lint && npm test -- --run`
Expected: all clean, all tests pass.

- [ ] **Step 7: Manually verify the route's behavior is unchanged**

Run `npm run dev`, sign in, finalize an existing draft quote with complete data through the UI exactly as before. Confirm: the quote locks, the PDF downloads correctly, and finalizing a quote missing customer details still shows the same Dutch blocker messages on the quote page.

- [ ] **Step 8: Commit**

```bash
git add src/lib/quotes/finalize.ts src/lib/quotes/__tests__/finalize.test.ts src/app/api/quotes/[id]/finalize/route.ts
git commit -m "refactor: extract finalizeQuote as a testable, dependency-injected helper"
```

---

## Task 5: Move orchestration and the board's server action

**Files:**
- Create: `src/lib/quotes/pipeline-move.ts`
- Test: `src/lib/quotes/__tests__/pipeline-move.test.ts`
- Create: `src/app/pijplijn/board-actions.ts`

**Interfaces:**
- Consumes: `resolveStageMove`, `MoveTarget` from `@/lib/quotes/stage-move` (Task 2); `finalizeQuote`, `FinalizeDeps` from `@/lib/quotes/finalize` (Task 4).
- Produces: `movePipelineStage()`, and the `moveQuoteToStage` server action — consumed by Task 7 (`KanbanBoard`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/quotes/__tests__/pipeline-move.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { movePipelineStage } from '@/lib/quotes/pipeline-move';
import type { PipelineStage, Quote, QuoteLineItem } from '@/lib/supabase/types';

const draftQuote: Quote = {
  id: 'q1', contractor_id: 'c1', transcript: null, status: 'draft',
  // Complete enough to pass checkFinalizeGate — the "finalizes successfully"
  // test below relies on this being a real gate-passing quote, not just a
  // status flag. A separate test overrides fields to exercise the blocked path.
  customer_name: 'Jan Peeters', customer_address: 'Kerkstraat 1, 9000 Gent',
  customer_email: null, customer_phone: null,
  audio_path: null, audio_deleted_at: null, pdf_path: null, pipeline_stage_id: null,
  created_at: '2026-08-06T00:00:00Z',
};

const finalQuote: Quote = { ...draftQuote, status: 'final' };

const line: QuoteLineItem = {
  id: 'line-1', quote_id: 'q1', catalog_item_id: 'cat-1', description: 'Dakpannen',
  quantity: 80, unit: 'm²', unit_price_cents: 3000, vat_rate: 0.06,
  line_type: 'materials', sort_order: 0, created_at: '2026-08-06T00:00:00Z',
};

const ownStage: PipelineStage = {
  id: 's1', contractor_id: 'c1', name: 'Gewonnen', sort_order: 1, created_at: '2026-08-06T00:00:00Z',
};
const otherContractorStage: PipelineStage = { ...ownStage, id: 's2', contractor_id: 'someone-else' };

function makeDeps(overrides = {}) {
  return {
    loadQuote: vi.fn().mockResolvedValue(draftQuote),
    loadStage: vi.fn().mockResolvedValue(ownStage),
    setStage: vi.fn().mockResolvedValue(undefined),
    finalizeDeps: {
      loadQuote: vi.fn().mockResolvedValue(draftQuote),
      loadLineItems: vi.fn().mockResolvedValue([line]),
      loadClarifications: vi.fn().mockResolvedValue([]),
      updateStatusToFinal: vi.fn().mockResolvedValue(undefined),
      loadContractor: vi.fn().mockResolvedValue(null),
      renderPdf: vi.fn(),
      uploadPdf: vi.fn(),
      savePdfPath: vi.fn(),
      log: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('movePipelineStage', () => {
  it('returns an error when the quote does not exist', async () => {
    const deps = makeDeps({ loadQuote: vi.fn().mockResolvedValue(null) });
    const result = await movePipelineStage(deps, 'missing', { type: 'afgewerkt' }, 'c1');
    expect(result).toEqual({ ok: false, error: 'Offerte niet gevonden' });
  });

  it('rejects moving a draft quote to a custom stage', async () => {
    const deps = makeDeps();
    const result = await movePipelineStage(deps, 'q1', { type: 'stage', stageId: 's1' }, 'c1');
    expect(result).toEqual({ ok: false, error: 'Werk de offerte eerst af.' });
    expect(deps.setStage).not.toHaveBeenCalled();
  });

  it('rejects a stage id belonging to a different contractor', async () => {
    const deps = makeDeps({
      loadQuote: vi.fn().mockResolvedValue(finalQuote),
      loadStage: vi.fn().mockResolvedValue(otherContractorStage),
    });
    const result = await movePipelineStage(deps, 'q1', { type: 'stage', stageId: 's2' }, 'c1');
    expect(result).toEqual({ ok: false, error: 'Fase niet gevonden' });
    expect(deps.setStage).not.toHaveBeenCalled();
  });

  it('delegates to finalizeQuote for draft -> afgewerkt and reports its blockers', async () => {
    const finalizeDeps = makeDeps().finalizeDeps;
    finalizeDeps.loadQuote = vi.fn().mockResolvedValue({ ...draftQuote, customer_name: null });
    const deps = makeDeps({ finalizeDeps });

    const result = await movePipelineStage(deps, 'q1', { type: 'afgewerkt' }, 'c1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('klant');
    expect(deps.setStage).not.toHaveBeenCalled();
  });

  it('finalizes successfully for draft -> afgewerkt when the gate passes', async () => {
    const deps = makeDeps();
    const result = await movePipelineStage(deps, 'q1', { type: 'afgewerkt' }, 'c1');
    expect(result).toEqual({ ok: true });
    expect(deps.finalizeDeps.updateStatusToFinal).toHaveBeenCalledWith('q1');
  });

  it('sets pipeline_stage_id to null for final -> afgewerkt', async () => {
    const deps = makeDeps({ loadQuote: vi.fn().mockResolvedValue(finalQuote) });
    const result = await movePipelineStage(deps, 'q1', { type: 'afgewerkt' }, 'c1');
    expect(result).toEqual({ ok: true });
    expect(deps.setStage).toHaveBeenCalledWith('q1', null);
  });

  it('sets pipeline_stage_id to the target stage for final -> stage', async () => {
    const deps = makeDeps({ loadQuote: vi.fn().mockResolvedValue(finalQuote) });
    const result = await movePipelineStage(deps, 'q1', { type: 'stage', stageId: 's1' }, 'c1');
    expect(result).toEqual({ ok: true });
    expect(deps.setStage).toHaveBeenCalledWith('q1', 's1');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/quotes/__tests__/pipeline-move.test.ts`
Expected: FAIL — `Cannot find module '@/lib/quotes/pipeline-move'`

- [ ] **Step 3: Implement**

```ts
// src/lib/quotes/pipeline-move.ts
import { resolveStageMove, type MoveTarget } from '@/lib/quotes/stage-move';
import { finalizeQuote, type FinalizeDeps } from '@/lib/quotes/finalize';
import type { PipelineStage, Quote } from '@/lib/supabase/types';

export type PipelineMoveDeps = {
  loadQuote: (quoteId: string) => Promise<Quote | null>;
  loadStage: (stageId: string) => Promise<PipelineStage | null>;
  setStage: (quoteId: string, stageId: string | null) => Promise<void>;
  finalizeDeps: FinalizeDeps;
};

export type MoveResult = { ok: true } | { ok: false; error: string };

function finalizeErrorMessage(result: Awaited<ReturnType<typeof finalizeQuote>>): string {
  if (!result.ok && 'blockers' in result) return result.blockers.map((b) => b.messageNl).join(' ');
  if (!result.ok && 'error' in result) return result.error;
  return 'Afwerken mislukt. Probeer opnieuw.';
}

export async function movePipelineStage(
  deps: PipelineMoveDeps,
  quoteId: string,
  target: MoveTarget,
  contractorId: string,
): Promise<MoveResult> {
  const quote = await deps.loadQuote(quoteId);
  if (!quote) return { ok: false, error: 'Offerte niet gevonden' };

  if (target.type === 'stage') {
    const stage = await deps.loadStage(target.stageId);
    if (!stage || stage.contractor_id !== contractorId) {
      return { ok: false, error: 'Fase niet gevonden' };
    }
  }

  const decision = resolveStageMove({ currentStatus: quote.status, target });
  if (!decision.allowed) return { ok: false, error: decision.reason };

  if (quote.status === 'draft' && target.type === 'afgewerkt') {
    const result = await finalizeQuote(deps.finalizeDeps, quoteId);
    if (!result.ok) return { ok: false, error: finalizeErrorMessage(result) };
    return { ok: true };
  }

  const stageId = target.type === 'stage' ? target.stageId : null;
  await deps.setStage(quoteId, stageId);
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/quotes/__tests__/pipeline-move.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Write the server action**

```ts
// src/app/pijplijn/board-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { movePipelineStage } from '@/lib/quotes/pipeline-move';
import { renderQuotePdf } from '@/lib/pdf/render';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import type { MoveTarget } from '@/lib/quotes/stage-move';
import type { Contractor, PipelineStage, Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export async function moveQuoteToStage(
  quoteId: string,
  target: MoveTarget,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, contractor } = await requireContractor();

  const result = await movePipelineStage(
    {
      loadQuote: async (id) => {
        const { data } = await supabase.from('quotes').select('*').eq('id', id).single();
        return data as Quote | null;
      },
      loadStage: async (id) => {
        const { data } = await supabase.from('pipeline_stages').select('*').eq('id', id).single();
        return data as PipelineStage | null;
      },
      setStage: async (id, stageId) => {
        const { error } = await supabase
          .from('quotes').update({ pipeline_stage_id: stageId }).eq('id', id);
        if (error) throw new Error('Verplaatsen mislukt. Probeer opnieuw.');
      },
      finalizeDeps: {
        loadQuote: async (id) => {
          const { data } = await supabase.from('quotes').select('*').eq('id', id).single();
          return data as Quote | null;
        },
        loadLineItems: async (id) => {
          const { data } = await supabase.from('quote_line_items').select('*').eq('quote_id', id);
          return (data ?? []) as QuoteLineItem[];
        },
        loadClarifications: async (id) => {
          const { data } = await supabase.from('quote_clarifications').select('*').eq('quote_id', id);
          return (data ?? []) as QuoteClarification[];
        },
        updateStatusToFinal: async (id) => {
          const { error } = await supabase
            .from('quotes').update({ status: 'final' }).eq('id', id).eq('status', 'draft');
          if (error) throw new Error('Afwerken mislukt. Probeer opnieuw.');
        },
        loadContractor: async (id) => {
          const { data } = await supabase.from('contractors').select('*').eq('id', id).single();
          return data as Contractor | null;
        },
        renderPdf: renderQuotePdf,
        uploadPdf: async (path, pdf) => {
          const { error } = await supabase.storage
            .from('quote-pdfs').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
          if (error) throw new Error(error.message);
        },
        savePdfPath: async (id, path) => {
          const { error } = await supabase.from('quotes').update({ pdf_path: path }).eq('id', id);
          if (error) throw new Error(error.message);
        },
        log: logPipelineEvent,
      },
    },
    quoteId,
    target,
    contractor.id,
  );

  if (result.ok) revalidatePath('/pijplijn');
  return result;
}

export async function requireAuthForBoard(): Promise<void> {
  try {
    await requireContractor();
  } catch (error) {
    if (error instanceof UnauthorizedError) throw new Error('Niet aangemeld');
    throw error;
  }
}
```

- [ ] **Step 6: Run the full test suite and type-check**

Run: `npx tsc --noEmit && npm run lint && npm test -- --run`
Expected: all clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/quotes/pipeline-move.ts src/lib/quotes/__tests__/pipeline-move.test.ts src/app/pijplijn/board-actions.ts
git commit -m "feat: add move orchestration and the pipeline board's server action"
```

---

## Task 6: Custom stage management (validation, pure helpers, server actions)

**Files:**
- Create: `src/lib/validation/pipeline-stage.ts`
- Create: `src/lib/quotes/stage-order.ts`
- Test: `src/lib/validation/__tests__/pipeline-stage.test.ts`
- Test: `src/lib/quotes/__tests__/stage-order.test.ts`
- Create: `src/app/instellingen/pipeline-stage-actions.ts`

**Interfaces:**
- Produces: `validateStageName()`, `nextSortOrder()`, `canDeleteStage()`, `swapSortOrder()`, and the `createStage`/`renameStage`/`deleteStage`/`reorderStage` server actions — consumed by Task 8 (`PipelineStagesForm`).

- [ ] **Step 1: Write the failing validation test**

```ts
// src/lib/validation/__tests__/pipeline-stage.test.ts
import { describe, it, expect } from 'vitest';
import { validateStageName } from '@/lib/validation/pipeline-stage';

describe('validateStageName', () => {
  it('trims and accepts a normal name', () => {
    expect(validateStageName('  Gewonnen  ')).toBe('Gewonnen');
  });

  it('rejects an empty name', () => {
    expect(() => validateStageName('')).toThrow('Naam is verplicht');
  });

  it('rejects a whitespace-only name', () => {
    expect(() => validateStageName('   ')).toThrow('Naam is verplicht');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx vitest run src/lib/validation/__tests__/pipeline-stage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/validation/pipeline-stage'`

- [ ] **Step 3: Implement validation**

```ts
// src/lib/validation/pipeline-stage.ts
export function validateStageName(raw: string): string {
  const name = (raw ?? '').trim();
  if (!name) throw new Error('Naam is verplicht');
  return name;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npx vitest run src/lib/validation/__tests__/pipeline-stage.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing ordering tests**

```ts
// src/lib/quotes/__tests__/stage-order.test.ts
import { describe, it, expect } from 'vitest';
import { nextSortOrder, canDeleteStage, swapSortOrder } from '@/lib/quotes/stage-order';

describe('nextSortOrder', () => {
  it('returns 0 for an empty list', () => {
    expect(nextSortOrder([])).toBe(0);
  });

  it('returns one past the current maximum', () => {
    expect(nextSortOrder([{ sort_order: 0 }, { sort_order: 3 }])).toBe(4);
  });
});

describe('canDeleteStage', () => {
  it('allows deleting an empty stage', () => {
    expect(canDeleteStage(0)).toEqual({ allowed: true });
  });

  it('blocks deleting an occupied stage with a count in the message', () => {
    const result = canDeleteStage(3);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('Verplaats eerst de 3 offerte(s) uit deze fase voordat je ze verwijdert.');
  });
});

describe('swapSortOrder', () => {
  const stages = [
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 2 },
  ];

  it('swaps with the next stage when moving down', () => {
    expect(swapSortOrder(stages, 'a', 'down')).toEqual([
      { id: 'a', sort_order: 1 },
      { id: 'b', sort_order: 0 },
    ]);
  });

  it('swaps with the previous stage when moving up', () => {
    expect(swapSortOrder(stages, 'c', 'up')).toEqual([
      { id: 'c', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ]);
  });

  it('returns null when there is no neighbor in that direction', () => {
    expect(swapSortOrder(stages, 'a', 'up')).toBeNull();
    expect(swapSortOrder(stages, 'c', 'down')).toBeNull();
  });
});
```

- [ ] **Step 6: Run it, verify it fails**

Run: `npx vitest run src/lib/quotes/__tests__/stage-order.test.ts`
Expected: FAIL — `Cannot find module '@/lib/quotes/stage-order'`

- [ ] **Step 7: Implement ordering helpers**

```ts
// src/lib/quotes/stage-order.ts
type OrderedItem = { sort_order: number };
type IdentifiedItem = { id: string; sort_order: number };

export function nextSortOrder(existing: OrderedItem[]): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((s) => s.sort_order)) + 1;
}

export function canDeleteStage(
  occupiedCount: number,
): { allowed: true } | { allowed: false; reason: string } {
  if (occupiedCount === 0) return { allowed: true };
  return {
    allowed: false,
    reason: `Verplaats eerst de ${occupiedCount} offerte(s) uit deze fase voordat je ze verwijdert.`,
  };
}

export function swapSortOrder(
  stages: IdentifiedItem[],
  id: string,
  direction: 'up' | 'down',
): [IdentifiedItem, IdentifiedItem] | null {
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const index = sorted.findIndex((s) => s.id === id);
  if (index === -1) return null;

  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= sorted.length) return null;

  const current = sorted[index];
  const neighbor = sorted[neighborIndex];
  return [
    { id: current.id, sort_order: neighbor.sort_order },
    { id: neighbor.id, sort_order: current.sort_order },
  ];
}
```

- [ ] **Step 8: Run it, verify it passes**

Run: `npx vitest run src/lib/quotes/__tests__/stage-order.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 9: Write the server actions**

```ts
// src/app/instellingen/pipeline-stage-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import { validateStageName } from '@/lib/validation/pipeline-stage';
import { nextSortOrder, canDeleteStage, swapSortOrder } from '@/lib/quotes/stage-order';

export async function createStage(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const name = validateStageName(String(form.get('name') ?? ''));

  const { data: existing } = await supabase
    .from('pipeline_stages').select('sort_order').eq('contractor_id', contractor.id);

  const { error } = await supabase.from('pipeline_stages').insert({
    contractor_id: contractor.id,
    name,
    sort_order: nextSortOrder(existing ?? []),
  });

  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
}

export async function renameStage(id: string, form: FormData): Promise<void> {
  const { supabase } = await requireContractor();
  const name = validateStageName(String(form.get('name') ?? ''));

  const { error } = await supabase.from('pipeline_stages').update({ name }).eq('id', id);
  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
}

export async function deleteStage(id: string): Promise<void> {
  const { supabase } = await requireContractor();

  const { count } = await supabase
    .from('quotes').select('id', { count: 'exact', head: true }).eq('pipeline_stage_id', id);

  const decision = canDeleteStage(count ?? 0);
  if (!decision.allowed) throw new Error(decision.reason);

  const { error } = await supabase.from('pipeline_stages').delete().eq('id', id);
  if (error) throw new Error('Verwijderen mislukt. Probeer opnieuw.');
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
}

export async function reorderStage(id: string, direction: 'up' | 'down'): Promise<void> {
  const { supabase, contractor } = await requireContractor();

  const { data: stages } = await supabase
    .from('pipeline_stages').select('id, sort_order').eq('contractor_id', contractor.id);

  const swap = swapSortOrder(stages ?? [], id, direction);
  if (!swap) return; // already at the edge — nothing to do

  for (const item of swap) {
    const { error } = await supabase
      .from('pipeline_stages').update({ sort_order: item.sort_order }).eq('id', item.id);
    if (error) throw new Error('Herordenen mislukt. Probeer opnieuw.');
  }
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
}
```

- [ ] **Step 10: Run the full test suite and type-check**

Run: `npx tsc --noEmit && npm run lint && npm test -- --run`
Expected: all clean, all tests pass.

- [ ] **Step 11: Commit**

```bash
git add src/lib/validation/pipeline-stage.ts src/lib/validation/__tests__/pipeline-stage.test.ts \
  src/lib/quotes/stage-order.ts src/lib/quotes/__tests__/stage-order.test.ts \
  src/app/instellingen/pipeline-stage-actions.ts
git commit -m "feat: add custom pipeline stage CRUD (validation, ordering, server actions)"
```

---

## Task 7: `KanbanBoard` and `QuoteCard` components

Every card always exposes an accessible "Verplaats naar…" menu (built with the native `<details>`/`<summary>` pattern already used elsewhere in this codebase, e.g. `QuoteEditor`'s "Wat ik gehoord heb") listing every reachable stage — this works identically on mouse, touch, and keyboard, and is what mobile relies on. On top of that, `@dnd-kit/core` adds real drag-and-drop as a progressive enhancement for pointer devices. Both call the exact same server action, so there is one behavior to reason about, not two.

No optimistic client-side move: a card only appears in its new column after the server action succeeds and the page is revalidated (`router.refresh()`). This means a rejected move never needs a "snap back" animation — the card simply never left, and dnd-kit's own drag-return animation handles the visual feedback while the request is in flight.

**Files:**
- Create: `src/components/kanban/KanbanBoard.tsx`
- Create: `src/components/kanban/QuoteCard.tsx`
- Test: `src/components/kanban/__tests__/KanbanBoard.test.tsx`
- Modify: `package.json` (add `@dnd-kit/core`)

**Interfaces:**
- Consumes: `groupQuotesByStage`, `QuoteWithTotal` (Task 3); `reachableTargets`, `MoveTarget` (Task 2); `moveQuoteToStage` (Task 5); `formatEuros` from `@/lib/money/totals`; `PipelineStage` from `@/lib/supabase/types`.
- Produces: `KanbanBoard` — consumed by Task 9 (`pijplijn/page.tsx`).

- [ ] **Step 1: Add the dependency**

Run: `npm install @dnd-kit/core@^6.3.1`

- [ ] **Step 2: Write `QuoteCard`**

```tsx
// src/components/kanban/QuoteCard.tsx
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
    <div ref={setNodeRef} style={style} className="card flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/offertes/${quote.id}`} className="flex-1 hover:text-accent">
          <p className="font-medium">{quote.customer_name ?? 'Zonder klantnaam'}</p>
          <p className="nums text-sm text-muted">
            {new Date(quote.created_at).toLocaleDateString('nl-BE')}
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

      <p className="nums text-right font-medium">{formatEuros(quote.grandTotalCents)}</p>

      {targets.length > 0 && (
        <details className="relative">
          <summary className="cursor-pointer text-sm text-muted hover:text-ink">
            Verplaats naar…
          </summary>
          <ul className="card absolute right-0 z-20 mt-1 w-48 gap-1 p-2">
            {targets.map((t) => (
              <li key={t.label}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onMove(t.target)}
                  className="w-full rounded px-2 py-1 text-left text-sm hover:bg-paper disabled:opacity-50"
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `KanbanBoard`**

```tsx
// src/components/kanban/KanbanBoard.tsx
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
    const result = await moveQuoteToStage(quoteId, target);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
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
```

- [ ] **Step 4: Write the component test**

```tsx
// src/components/kanban/__tests__/KanbanBoard.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PipelineStage } from '@/lib/supabase/types';
import type { QuoteWithTotal } from '@/lib/quotes/group-by-stage';

const { moveQuoteToStage } = vi.hoisted(() => ({ moveQuoteToStage: vi.fn() }));
vi.mock('@/app/pijplijn/board-actions', () => ({ moveQuoteToStage }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const KanbanBoard = (await import('@/components/kanban/KanbanBoard')).default;

function quote(overrides: Partial<QuoteWithTotal> = {}): QuoteWithTotal {
  return {
    id: 'q1', contractor_id: 'c1', transcript: null, status: 'draft',
    customer_name: 'Jan Peeters', customer_address: null, customer_email: null, customer_phone: null,
    audio_path: null, audio_deleted_at: null, pdf_path: null, pipeline_stage_id: null,
    created_at: '2026-08-06T00:00:00Z', grandTotalCents: 12345, ...overrides,
  };
}

const stages: PipelineStage[] = [
  { id: 's1', contractor_id: 'c1', name: 'Gewonnen', sort_order: 1, created_at: '2026-08-06T00:00:00Z' },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('KanbanBoard', () => {
  it('renders a quote under its column and shows its total', () => {
    render(<KanbanBoard quotes={[quote()]} stages={stages} />);
    expect(screen.getByText('Concept (1)')).toBeInTheDocument();
    expect(screen.getByText('Jan Peeters')).toBeInTheDocument();
    expect(screen.getByText('€ 123,45')).toBeInTheDocument();
  });

  it('moves a card via the "Verplaats naar…" menu and refreshes on success', async () => {
    moveQuoteToStage.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<KanbanBoard quotes={[quote({ status: 'final' })]} stages={stages} />);

    await user.click(screen.getByText('Verplaats naar…'));
    await user.click(screen.getByRole('button', { name: 'Gewonnen' }));

    expect(moveQuoteToStage).toHaveBeenCalledWith('q1', { type: 'stage', stageId: 's1' });
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the Dutch error and does not refresh when a move is rejected', async () => {
    moveQuoteToStage.mockResolvedValueOnce({ ok: false, error: 'Werk de offerte eerst af.' });
    const user = userEvent.setup();
    render(<KanbanBoard quotes={[quote({ status: 'final' })]} stages={stages} />);

    await user.click(screen.getByText('Verplaats naar…'));
    await user.click(screen.getByRole('button', { name: 'Gewonnen' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Werk de offerte eerst af.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/components/kanban/__tests__/KanbanBoard.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Run the full test suite, lint, and type-check**

Run: `npx tsc --noEmit && npm run lint && npm test -- --run`
Expected: all clean, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/components/kanban
git commit -m "feat: add KanbanBoard and QuoteCard components with drag-and-drop plus an accessible move menu"
```

---

## Task 8: Instellingen — "Pijplijnfasen" stage management UI

**Files:**
- Create: `src/app/instellingen/PipelineStagesForm.tsx`
- Test: `src/components/__tests__/PipelineStagesForm.test.tsx`
- Modify: `src/app/instellingen/page.tsx`

**Interfaces:**
- Consumes: `createStage`, `renameStage`, `deleteStage`, `reorderStage` (Task 6); `PipelineStage` from `@/lib/supabase/types`.

- [ ] **Step 1: Write `PipelineStagesForm`**

```tsx
// src/app/instellingen/PipelineStagesForm.tsx
'use client';

import { useState } from 'react';
import type { PipelineStage } from '@/lib/supabase/types';
import { createStage, deleteStage, renameStage, reorderStage } from './pipeline-stage-actions';

export default function PipelineStagesForm({ stages }: { stages: PipelineStage[] }) {
  const [error, setError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);

  async function handleAdd(form: FormData) {
    setAddError(null);
    try {
      await createStage(form);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Opslaan mislukt.');
    }
  }

  async function handleRename(id: string, form: FormData) {
    setError(null);
    try {
      await renameStage(id, form);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt.');
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteStage(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    setError(null);
    try {
      await reorderStage(id, direction);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Herordenen mislukt. Probeer opnieuw.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {sorted.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
            Nog geen fasen ingesteld.
          </li>
        )}
        {sorted.map((stage, index) => (
          <li key={stage.id} className="card flex items-center gap-2">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label={`${stage.name} omhoog verplaatsen`}
                disabled={index === 0}
                onClick={() => void handleReorder(stage.id, 'up')}
                className="text-muted hover:text-ink disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`${stage.name} omlaag verplaatsen`}
                disabled={index === sorted.length - 1}
                onClick={() => void handleReorder(stage.id, 'down')}
                className="text-muted hover:text-ink disabled:opacity-30"
              >
                ▼
              </button>
            </div>

            <form
              action={(form) => void handleRename(stage.id, form)}
              className="flex flex-1 items-center gap-2"
            >
              <input name="name" defaultValue={stage.name} className="field" />
              <button type="submit" className="btn btn-outline text-sm">Opslaan</button>
            </form>

            <button
              type="button"
              onClick={() => void handleDelete(stage.id)}
              aria-label={`Verwijder ${stage.name}`}
              className="text-sm font-medium text-critical underline underline-offset-2"
            >
              Verwijderen
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="alert alert-critical">{error}</p>}

      <form action={handleAdd} className="card flex flex-col gap-3">
        <h3 className="font-semibold">Nieuwe fase toevoegen</h3>
        <input name="name" required placeholder="Naam (bv. Verzonden naar klant)" className="field" />
        {addError && <p role="alert" className="alert alert-critical">{addError}</p>}
        <button type="submit" className="btn btn-primary">Toevoegen</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Write the component test**

```tsx
// src/components/__tests__/PipelineStagesForm.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PipelineStage } from '@/lib/supabase/types';

const { createStage, deleteStage, renameStage, reorderStage } = vi.hoisted(() => ({
  createStage: vi.fn(),
  deleteStage: vi.fn(),
  renameStage: vi.fn(),
  reorderStage: vi.fn(),
}));

vi.mock('@/app/instellingen/pipeline-stage-actions', () => ({
  createStage, deleteStage, renameStage, reorderStage,
}));

const PipelineStagesForm = (await import('@/app/instellingen/PipelineStagesForm')).default;

const stage: PipelineStage = {
  id: 's1', contractor_id: 'c1', name: 'Gewonnen', sort_order: 0, created_at: '2026-08-06T00:00:00Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PipelineStagesForm', () => {
  it('surfaces the Dutch error from a failed delete', async () => {
    deleteStage.mockRejectedValueOnce(new Error('Verplaats eerst de 3 offerte(s) uit deze fase voordat je ze verwijdert.'));
    const user = userEvent.setup();
    render(<PipelineStagesForm stages={[stage]} />);

    await user.click(screen.getByRole('button', { name: `Verwijder ${stage.name}` }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Verplaats eerst de 3 offerte(s)');
  });

  it('disables the up arrow on the first stage and the down arrow on the last', () => {
    const second: PipelineStage = { ...stage, id: 's2', name: 'Verloren', sort_order: 1 };
    render(<PipelineStagesForm stages={[stage, second]} />);

    expect(screen.getByRole('button', { name: 'Gewonnen omhoog verplaatsen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Verloren omlaag verplaatsen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gewonnen omlaag verplaatsen' })).toBeEnabled();
  });

  it('calls reorderStage with the right direction', async () => {
    const second: PipelineStage = { ...stage, id: 's2', name: 'Verloren', sort_order: 1 };
    const user = userEvent.setup();
    render(<PipelineStagesForm stages={[stage, second]} />);

    await user.click(screen.getByRole('button', { name: 'Gewonnen omlaag verplaatsen' }));
    expect(reorderStage).toHaveBeenCalledWith('s1', 'down');
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run src/components/__tests__/PipelineStagesForm.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 4: Wire it into the Instellingen page**

In `src/app/instellingen/page.tsx`, add the import, fetch the stages, and render a new section. Full replacement:

```tsx
import { requireContractor } from '@/lib/auth/require-contractor';
import CatalogForm from '@/components/CatalogForm';
import type { CatalogItem, PipelineStage } from '@/lib/supabase/types';
import ProfileForm from './ProfileForm';
import PipelineStagesForm from './PipelineStagesForm';

export default async function SettingsPage() {
  const { supabase, contractor } = await requireContractor();
  const [{ data: catalogItems }, { data: stages }] = await Promise.all([
    supabase.from('catalog_items').select('*').order('name', { ascending: true }),
    supabase.from('pipeline_stages').select('*').order('sort_order', { ascending: true }),
  ]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-8 text-3xl font-semibold">Instellingen</h1>

      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">Bedrijfsgegevens</h2>
        <p className="mb-4 text-sm text-muted">
          Deze gegevens verschijnen op elke offerte die je genereert.
        </p>
        <ProfileForm contractor={contractor} />
      </section>

      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">Prijslijst</h2>
        <p className="mb-4 text-sm text-muted">
          Je eigen prijzen. Deze worden gebruikt om je gesproken beschrijving om te zetten in een offerte.
        </p>
        <CatalogForm items={(catalogItems ?? []) as CatalogItem[]} />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Pijplijnfasen</h2>
        <p className="mb-4 text-sm text-muted">
          De fasen die een offerte doorloopt nadat ze is afgewerkt, zoals je ze wil bijhouden in Pijplijn.
        </p>
        <PipelineStagesForm stages={(stages ?? []) as PipelineStage[]} />
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Run the full test suite, lint, and type-check**

Run: `npx tsc --noEmit && npm run lint && npm test -- --run`
Expected: all clean, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/instellingen/PipelineStagesForm.tsx src/components/__tests__/PipelineStagesForm.test.tsx src/app/instellingen/page.tsx
git commit -m "feat: add Pijplijnfasen stage management to Instellingen"
```

---

## Task 9: The Pijplijn page and nav entry

**Files:**
- Create: `src/app/pijplijn/page.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `KanbanBoard` (Task 7); `calculateTotals`, `toTotalsInput` from `@/lib/money/totals`; `requireContractor`.

- [ ] **Step 1: Write the page**

```tsx
// src/app/pijplijn/page.tsx
import { requireContractor } from '@/lib/auth/require-contractor';
import { calculateTotals, toTotalsInput } from '@/lib/money/totals';
import type { PipelineStage, Quote, QuoteLineItem } from '@/lib/supabase/types';
import type { QuoteWithTotal } from '@/lib/quotes/group-by-stage';
import KanbanBoard from '@/components/kanban/KanbanBoard';

export default async function PijplijnPage() {
  const { supabase } = await requireContractor();

  const [{ data: quotes }, { data: stages }] = await Promise.all([
    supabase.from('quotes').select('*').order('created_at', { ascending: false }),
    supabase.from('pipeline_stages').select('*').order('sort_order', { ascending: true }),
  ]);

  const quoteRows = (quotes ?? []) as Quote[];
  const quoteIds = quoteRows.map((q) => q.id);

  const { data: lineItems } =
    quoteIds.length > 0
      ? await supabase.from('quote_line_items').select('*').in('quote_id', quoteIds)
      : { data: [] as QuoteLineItem[] };

  const lineItemsByQuote = new Map<string, QuoteLineItem[]>();
  for (const item of (lineItems ?? []) as QuoteLineItem[]) {
    const list = lineItemsByQuote.get(item.quote_id) ?? [];
    list.push(item);
    lineItemsByQuote.set(item.quote_id, list);
  }

  const quotesWithTotals: QuoteWithTotal[] = quoteRows.map((quote) => ({
    ...quote,
    grandTotalCents: calculateTotals(toTotalsInput(lineItemsByQuote.get(quote.id) ?? [])).grandTotalCents,
  }));

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-3xl font-semibold">Pijplijn</h1>
      <KanbanBoard quotes={quotesWithTotals} stages={(stages ?? []) as PipelineStage[]} />
    </main>
  );
}
```

- [ ] **Step 2: Add the nav link**

In `src/app/layout.tsx`, add a "Pijplijn" link between "Nieuwe offerte" and the right-aligned group:

```tsx
            <Link href="/offertes/nieuw" data-tour="nav-nieuwe-offerte" className="text-muted hover:text-accent">
              Nieuwe offerte
            </Link>
            <Link href="/pijplijn" className="text-muted hover:text-accent">
              Pijplijn
            </Link>
            <div className="ml-auto flex items-center gap-4">
```

- [ ] **Step 3: Run the full test suite, lint, and a production build**

Run: `npx tsc --noEmit && npm run lint && npm test -- --run && npm run build`
Expected: all clean, all tests pass, build succeeds, and the route table includes `/pijplijn`.

- [ ] **Step 4: Manually verify end to end**

Run `npm run dev`, sign in with an existing account:
1. Open Pijplijn — confirm your existing quotes appear under Concept or Afgewerkt correctly, with totals matching what's shown on each quote's own page.
2. Drag a draft quote's card into Afgewerkt (desktop) — confirm it either finalizes and moves, or (if it's missing customer details) shows the Dutch blocker message and stays in Concept.
3. Use the "Verplaats naar…" menu on a finalized quote to move it into a custom stage, then again into another — confirm each move persists after a page reload.
4. In Instellingen → Pijplijnfasen, rename a stage, reorder two stages, and try deleting a stage that has quotes in it (confirm the blocking message), then move its quotes out and delete it successfully.

- [ ] **Step 5: Commit**

```bash
git add src/app/pijplijn/page.tsx src/app/layout.tsx
git commit -m "feat: add the Pijplijn page and nav entry"
```

- [ ] **Step 6: Push**

```bash
git push -u origin main
```
