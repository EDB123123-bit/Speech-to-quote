# Pijplijn: Kanban-style quote pipeline — design

## Purpose

The v1 spec explicitly punted on "sending/tracking quotes to customers ...
status tracking" as out of scope. This is that follow-up: a lightweight
CRM-style board so a contractor can see where every quote sits in their
sales process, and move it along by hand as reality changes.

## Scope

**In scope:**
- A new "Pijplijn" page showing quotes as cards in columns
- Two fixed columns, **Concept** and **Afgewerkt**, that always reflect the
  quote's real `status` — never independently editable
- Contractor-defined custom stages after Afgewerkt (e.g. Verzonden naar
  klant, Gewonnen, Verloren), managed in Instellingen: add, rename, delete,
  reorder
- New contractors get 4 default custom stages, fully editable/deletable
- Moving a card: drag-and-drop on wider viewports, a "Verplaats naar…" tap
  menu on narrow ones
- Dragging a card from Concept into Afgewerkt runs the existing finalize
  checks; failure snaps the card back with the existing Dutch blocker
  messages
- Card shows customer name (or "Zonder klantnaam"), created date, and the
  quote's grand total

**Explicitly out of scope:**
- Un-finalizing (Afgewerkt → Concept is never allowed)
- Any stage skipping directly from Concept to a custom stage — Concept can
  only move to Afgewerkt
- Live multi-device/multi-tab sync — the board reflects the state as of
  last page load, same as the rest of the app
- Special semantics for stage names (no built-in "won/lost" revenue
  reporting) — stages are plain user-labeled buckets
- Per-stage automation beyond the two built-in transitions described above

## Data model

New migration:

```sql
create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  name text not null,
  sort_order integer not null,
  created_at timestamptz not null default now()
);
create index pipeline_stages_contractor_idx on pipeline_stages(contractor_id, sort_order);

alter table quotes add column pipeline_stage_id uuid references pipeline_stages(id) on delete restrict;

alter table pipeline_stages enable row level security;
create policy pipeline_stages_own on pipeline_stages
  for all using (contractor_id = auth.uid()) with check (contractor_id = auth.uid());
```

`pipeline_stage_id` is only meaningful while `quotes.status = 'final'`.
While `draft`, it's ignored — the card always renders in Concept regardless
of its value. `null` while final means "in Afgewerkt, not moved further."
`on delete restrict` is a DB-level backstop; the delete action itself checks
for occupying quotes first and returns a friendly Dutch error rather than
letting the constraint fire.

`handle_new_user()` is extended (via `create or replace function`, same
migration) to also insert 4 default `pipeline_stages` rows for the new
contractor: **Verzonden naar klant** (1), **In onderhandeling** (2),
**Gewonnen** (3), **Verloren** (4).

## Move logic

Extracted as a pure function, tested the same way as `finalize-gate.ts`:

```ts
type MoveTarget = { type: 'concept' } | { type: 'afgewerkt' } | { type: 'stage'; stageId: string };

function resolveStageMove(input: {
  currentStatus: QuoteStatus;
  target: MoveTarget;
}): { allowed: true } | { allowed: false; reason: string };
```

Dropping a card back onto the column it's already in is a client-side
no-op — `KanbanBoard` never calls the action when the target column equals
the card's current column, so `resolveStageMove` only ever runs for an
actual change and never needs a "same place" case.

Rules:
- `draft` + target `afgewerkt` → allowed, delegates to finalize (see below)
- `draft` + any other target → rejected: `"Werk de offerte eerst af."`
- `final` + target `concept` → rejected: `"Een afgewerkte offerte kan niet terug naar concept."`
- `final` + target `afgewerkt` or `stage` → allowed, just repositions

The existing `/api/quotes/[id]/finalize` route's body (finalize-gate check,
status update, PDF generation + upload, pipeline event logging) is
extracted into a shared `finalizeQuote(supabase, quoteId)` helper in
`src/lib/quotes/finalize.ts`. The route calls it unchanged; a new
`moveQuoteToStage` server action calls the same helper when the move is
`draft → afgewerkt`, so there is exactly one finalize code path.

`moveQuoteToStage(quoteId, target)` (`src/app/pijplijn/board-actions.ts`,
`'use server'`):
1. Loads the quote, checks ownership via `requireContractor()`. If target
   is a `stage`, also verifies that stage's `contractor_id` matches the
   caller before proceeding — closes off passing another contractor's
   stage id.
2. Runs `resolveStageMove`. If disallowed, returns `{ ok: false, error }`.
3. If target is `afgewerkt` and quote is currently `draft`: calls
   `finalizeQuote()`; its blocker list (if any) is mapped to the same
   `messageNl` strings the quote page shows and returned as the error.
4. Otherwise: updates `quotes.pipeline_stage_id` (null for Afgewerkt, the
   stage id otherwise) and returns `{ ok: true }`.

## Stage management (Instellingen)

New section "Pijplijnfasen", component `PipelineStagesForm.tsx`, styled and
structured like the existing `CatalogForm.tsx`:
- List of existing custom stages with rename (inline field), reorder
  (up/down buttons swap `sort_order` with the neighbor), and delete.
- `deleteStage(id)`: counts quotes with `pipeline_stage_id = id`; if > 0,
  returns `"Verplaats eerst de N offerte(s) uit deze fase voordat je ze verwijdert."`
  instead of deleting.
- `createStage(name)`: inserts with `sort_order = max(sort_order) + 1` for
  that contractor (0 if none exist).
- Concept and Afgewerkt are not shown in this list — they aren't rows, so
  there's nothing here to rename or delete.

## Pages & components

- **Nav**: new "Pijplijn" link in `layout.tsx`, between "Nieuwe offerte" and
  "Instellingen".
- **`src/app/pijplijn/page.tsx`** (server component): `requireContractor()`,
  fetch all quotes + their line items (for totals) + this contractor's
  `pipeline_stages` ordered by `sort_order`. Passes everything to a client
  `KanbanBoard`.
- **`src/components/kanban/KanbanBoard.tsx`** (`'use client'`):
  - Buckets quotes into columns via a pure `groupQuotesByStage(quotes, stages)`
    function (unit-testable independent of any DnD interaction).
  - Renders Concept, Afgewerkt, then each custom stage as a column.
  - Card: customer name (or "Zonder klantnaam"), formatted created date,
    grand total via the existing `calculateTotals`/`formatEuros`. Tapping
    the card body (not a drag handle) navigates to `/offertes/:id`.
  - **Desktop/tablet** (`≥` a width breakpoint, matching the pattern used
    for mobile-vs-desktop elsewhere): `@dnd-kit/core` `DndContext` with a
    drag handle per card; dropping on a column calls `moveQuoteToStage`.
  - **Mobile** (below the breakpoint): tapping a card's "⋯" opens a small
    menu listing the other reachable stages; tapping one calls the same
    `moveQuoteToStage`.
  - A failed move (finalize blockers, or a rejected transition) snaps the
    card back to its origin column and shows the returned Dutch message in
    an `.alert-critical` banner at the top of the board.

## Error handling

- Move rejected (business rule or finalize blocker): card snaps back,
  Dutch message shown inline — same tone/wording as existing errors
  elsewhere in the app (e.g. the quote page's `blockerMessages`).
- Move fails to persist (network/DB error): same snap-back with
  `"Verplaatsen mislukt. Probeer opnieuw."`
- Stage delete blocked: inline error in the Instellingen section, same
  pattern as `CatalogForm`'s existing `deleteError` handling.
- RLS on `pipeline_stages` and the existing RLS on `quotes` mean a
  contractor can only ever see or move their own cards — no new auth
  surface.

## Testing

- `resolveStageMove`: all four rule branches.
- `groupQuotesByStage`: quotes land in the right column for every
  status/`pipeline_stage_id` combination, including a quote whose
  `pipeline_stage_id` points at a stage that no longer exists (falls back
  to Afgewerkt rather than disappearing).
- Stage CRUD actions: create assigns the next `sort_order`; delete is
  blocked while occupied and succeeds once empty; reorder swaps correctly.
- `finalizeQuote()` extraction: existing finalize-route tests continue to
  pass unchanged against the extracted helper.
- No drag-simulation or e2e tests, consistent with the project's existing
  test depth (vitest + Testing Library only).
