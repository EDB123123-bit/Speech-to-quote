# Speech-to-quote v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first web app where a Flemish roofworker records a spoken job description and gets back an editable, VAT-correct price quote as a PDF, with an AI voice conversation resolving anything the extraction was unsure about.

**Architecture:** A Next.js App Router app on Vercel. One synchronous API route owns the voice→quote pipeline: audio upload → OpenAI Whisper transcription → Claude extraction against the contractor's own price catalog → persisted draft quote. A second set of routes drives a turn-by-turn voice clarification loop (OpenAI TTS asks, Whisper hears the answer, Claude resolves it). Supabase provides Postgres, Auth, and Storage. Every pipeline step writes a structured row to `pipeline_events` for remote debugging.

**Tech Stack:** Next.js 15 (App Router, TypeScript strict), React 19, Tailwind CSS, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), OpenAI SDK (Whisper + TTS), Anthropic SDK (extraction/clarification), Zod (LLM output validation), `@react-pdf/renderer` (PDF), Vitest + `@testing-library/react` (tests).

**Source spec:** `docs/superpowers/specs/2026-08-06-quote-generation-design.md`

## Global Constraints

- Node 20+ (dev environment is Node 22). Package manager: npm.
- Next.js App Router only — no `pages/` directory.
- TypeScript `strict: true`. No `any` in committed code.
- **All user-visible copy is Dutch.** Labels, buttons, errors, clarification questions, and PDF text. Code identifiers, comments, and commit messages stay English.
- **VAT rates are exactly `0.06` or `0.21`.** No other value is valid anywhere. Never defaulted silently — always explicitly chosen by the contractor.
- **All money is integer cents** (`*_cents`, TypeScript `number`). Never floats for currency. Quantities may be fractional.
- **No secrets client-side.** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are server-only; never prefixed `NEXT_PUBLIC_`.
- **Every pipeline step logs to `pipeline_events`** — on both success and error paths.
- Every table has Row Level Security enabled, scoped to `auth.uid()`.
- Tests run with `npm test`. Every task ends with a green test run and a commit.

## Deliberate refinements to the spec

These are intentional improvements made while planning. They do not change behavior the user approved; they remove ambiguity in how it is stored.

1. **Money stored as integer cents**, not `numeric` euros. The spec wrote `materials_price numeric`; columns are `materials_price_cents integer`. Exact arithmetic, no float drift.
2. **`quote_line_items` carries one `unit_price_cents` plus `line_type`**, instead of both `materials_price` and `labor_price` on every row. The spec's model left "what does `labor_price` mean on a materials row?" undefined. A catalog item still defines both rates; expansion into two rows (materials + labor) happens server-side and deterministically.
3. **Extraction returns *tasks*, not line items.** Claude returns `{catalogItemId, description, quantity, unit}` per task; the server expands each into a materials row and a labor row. Keeps the LLM output small and makes expansion a pure, testable function.

---

## File Structure

**Config / infrastructure**
- `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example` — project setup
- `supabase/migrations/0001_initial_schema.sql` — all six tables + RLS

**Pure logic (no I/O — the bulk of test coverage lives here)**
- `src/lib/money/totals.ts` — VAT grouping, per-rate subtotals, grand total
- `src/lib/quotes/expand.ts` — extraction tasks → materials/labor line item rows
- `src/lib/quotes/finalize-gate.ts` — is this quote allowed to become `final`?
- `src/lib/clarifications/retry.ts` — retry cap decision logic
- `src/lib/validation/catalog.ts` — catalog item validation

**Data access / infrastructure**
- `src/lib/supabase/client.ts`, `server.ts`, `admin.ts` — Supabase clients
- `src/lib/supabase/types.ts` — hand-written DB row types
- `src/lib/logging/pipeline-events.ts` — structured logging helper

**AI adapters (thin wrappers, mocked in tests)**
- `src/lib/ai/schemas.ts` — Zod schemas for all LLM output
- `src/lib/ai/transcribe.ts` — Whisper
- `src/lib/ai/tts.ts` — OpenAI TTS
- `src/lib/ai/extract.ts` — Claude extraction
- `src/lib/ai/clarify.ts` — Claude clarification-answer processing

**API routes**
- `src/app/api/quotes/generate/route.ts`
- `src/app/api/quotes/[id]/clarifications/[cid]/prompt-audio/route.ts`
- `src/app/api/quotes/[id]/clarifications/[cid]/answer/route.ts`
- `src/app/api/quotes/[id]/finalize/route.ts`
- `src/app/api/quotes/[id]/pdf/route.ts`
- `src/app/api/cron/cleanup-audio/route.ts`

**PDF**
- `src/lib/pdf/QuoteDocument.tsx` — `@react-pdf/renderer` layout

**Pages (Dutch routes)**
- `src/app/login/page.tsx`, `src/app/instellingen/page.tsx`
- `src/app/offertes/page.tsx`, `offertes/nieuw/page.tsx`, `offertes/[id]/page.tsx`

**Components**
- `src/components/VoiceRecorder.tsx`, `LineItemsEditor.tsx`, `ClarificationPanel.tsx`, `CatalogForm.tsx`, `CustomerForm.tsx`

---

### Task 1: Project scaffolding and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Test: `src/lib/__tests__/harness.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a working `npm test` (Vitest) and `npm run dev` (Next.js). Path alias `@/*` → `src/*`.

- [ ] **Step 1: Scaffold the Next.js app**

The repo already contains `CLAUDE.md`, `docs/`, and `.claude/`. None conflict with `create-next-app`, so it will proceed in place.

```bash
npx create-next-app@latest . --typescript --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack --use-npm
```

- [ ] **Step 2: Install runtime and test dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr openai @anthropic-ai/sdk zod @react-pdf/renderer
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 3: Write `vitest.config.ts`**

Default environment is `node`; component test files opt into jsdom with a `// @vitest-environment jsdom` docblock.

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 4: Write `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Add the test script to `package.json`**

Add to the `"scripts"` block:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Write the failing harness test**

Create `src/lib/__tests__/harness.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs tests and resolves the @ path alias', async () => {
    const mod = await import('@/lib/version');
    expect(mod.APP_VERSION).toBe('0.1.0');
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@/lib/version`.

- [ ] **Step 8: Create the module to make it pass**

Create `src/lib/version.ts`:

```ts
export const APP_VERSION = '0.1.0';
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 10: Write `.env.example`**

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI providers (server-only — never expose to the browser)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Model selection
EXTRACTION_MODEL=claude-sonnet-5
TRANSCRIPTION_MODEL=whisper-1
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy

# Protects the audio-cleanup cron route
CRON_SECRET=
```

- [ ] **Step 11: Confirm `.env.local` is git-ignored**

`create-next-app` adds `.env*` to `.gitignore`. Verify with `grep -n "env" .gitignore` and add `.env.local` if missing.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest test harness"
```

---

### Task 2: Database schema and RLS

**Files:**
- Create: `supabase/migrations/0001_initial_schema.sql`
- Create: `src/lib/supabase/types.ts`
- Test: `src/lib/supabase/__tests__/types.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: six tables (`contractors`, `catalog_items`, `quotes`, `quote_line_items`, `quote_clarifications`, `pipeline_events`), and the TypeScript row types every later task imports: `Contractor`, `CatalogItem`, `Quote`, `QuoteLineItem`, `QuoteClarification`, `PipelineEvent`, plus the unions `VatRate = 0.06 | 0.21`, `LineType = 'materials' | 'labor'`, `QuoteStatus = 'draft' | 'final'`, `ClarificationStatus = 'pending' | 'resolved' | 'dismissed'`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0001_initial_schema.sql`:

```sql
-- Contractors extend Supabase auth.users with business details for the PDF letterhead.
create table contractors (
  id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null,
  address text,
  vat_number text,
  phone text,
  created_at timestamptz not null default now()
);

-- The contractor's own price list. vat_rate is explicit — never defaulted.
create table catalog_items (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  name text not null,
  unit text not null,
  materials_price_cents integer not null check (materials_price_cents >= 0),
  labor_price_cents integer not null check (labor_price_cents >= 0),
  vat_rate numeric(4,2) not null check (vat_rate in (0.06, 0.21)),
  created_at timestamptz not null default now()
);
create index catalog_items_contractor_idx on catalog_items(contractor_id);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  transcript text,
  status text not null default 'draft' check (status in ('draft', 'final')),
  customer_name text,
  customer_address text,
  customer_email text,
  customer_phone text,
  audio_path text,
  audio_deleted_at timestamptz,
  pdf_path text,
  created_at timestamptz not null default now()
);
create index quotes_contractor_idx on quotes(contractor_id, created_at desc);

-- Prices and vat_rate are COPIED here at generation time so later catalog
-- edits never retroactively change an existing quote. Nullable because
-- unmatched/ad-hoc items are created empty for the contractor to fill in.
create table quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  catalog_item_id uuid references catalog_items(id) on delete set null,
  description text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  unit_price_cents integer check (unit_price_cents >= 0),
  vat_rate numeric(4,2) check (vat_rate in (0.06, 0.21)),
  line_type text not null check (line_type in ('materials', 'labor')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index quote_line_items_quote_idx on quote_line_items(quote_id, sort_order);

create table quote_clarifications (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  question_nl text not null,
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'dismissed')),
  retry_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index quote_clarifications_quote_idx on quote_clarifications(quote_id, created_at);

-- Structured pipeline logs, queried directly in the Supabase dashboard.
create table pipeline_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes(id) on delete cascade,
  contractor_id uuid not null references contractors(id) on delete cascade,
  step text not null check (step in (
    'upload', 'transcribe', 'extract', 'clarification_answer',
    'tts_generate', 'pdf_generate', 'audio_cleanup'
  )),
  status text not null check (status in ('success', 'error')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index pipeline_events_quote_idx on pipeline_events(quote_id, created_at desc);
create index pipeline_events_contractor_idx on pipeline_events(contractor_id, created_at desc);

-- Row Level Security: a contractor sees only their own data.
alter table contractors enable row level security;
alter table catalog_items enable row level security;
alter table quotes enable row level security;
alter table quote_line_items enable row level security;
alter table quote_clarifications enable row level security;
alter table pipeline_events enable row level security;

create policy contractors_self on contractors
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy catalog_items_own on catalog_items
  for all using (contractor_id = auth.uid()) with check (contractor_id = auth.uid());

create policy quotes_own on quotes
  for all using (contractor_id = auth.uid()) with check (contractor_id = auth.uid());

create policy quote_line_items_own on quote_line_items
  for all using (
    exists (select 1 from quotes q where q.id = quote_id and q.contractor_id = auth.uid())
  ) with check (
    exists (select 1 from quotes q where q.id = quote_id and q.contractor_id = auth.uid())
  );

create policy quote_clarifications_own on quote_clarifications
  for all using (
    exists (select 1 from quotes q where q.id = quote_id and q.contractor_id = auth.uid())
  ) with check (
    exists (select 1 from quotes q where q.id = quote_id and q.contractor_id = auth.uid())
  );

-- Logs are readable by their owner; only the service role writes them.
create policy pipeline_events_own_read on pipeline_events
  for select using (contractor_id = auth.uid());

-- A contractor row is created automatically on signup.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.contractors (id, company_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'company_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Apply the migration**

Either via the Supabase MCP tool `apply_migration` (name: `0001_initial_schema`, query: the SQL above), or with the CLI:

```bash
npx supabase db push
```

- [ ] **Step 3: Verify the tables exist**

Use the Supabase MCP `list_tables` tool, or run in the SQL editor:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
```

Expected: `catalog_items`, `contractors`, `pipeline_events`, `quote_clarifications`, `quote_line_items`, `quotes`.

- [ ] **Step 4: Create the private storage buckets**

In the Supabase dashboard (Storage), or via SQL:

```sql
insert into storage.buckets (id, name, public) values ('quote-audio', 'quote-audio', false);
insert into storage.buckets (id, name, public) values ('quote-pdfs', 'quote-pdfs', false);
```

Both are private — access is via signed URLs generated server-side.

- [ ] **Step 5: Write the failing types test**

Create `src/lib/supabase/__tests__/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { VAT_RATES, isVatRate } from '@/lib/supabase/types';

describe('VAT rate helpers', () => {
  it('exposes exactly the two legal Belgian rates for this app', () => {
    expect(VAT_RATES).toEqual([0.06, 0.21]);
  });

  it('accepts legal rates', () => {
    expect(isVatRate(0.06)).toBe(true);
    expect(isVatRate(0.21)).toBe(true);
  });

  it('rejects anything else, including null and 0', () => {
    expect(isVatRate(0)).toBe(false);
    expect(isVatRate(0.12)).toBe(false);
    expect(isVatRate(null)).toBe(false);
    expect(isVatRate(undefined)).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test src/lib/supabase/__tests__/types.test.ts`
Expected: FAIL — cannot resolve `@/lib/supabase/types`.

- [ ] **Step 7: Write the types module**

Create `src/lib/supabase/types.ts`:

```ts
export const VAT_RATES = [0.06, 0.21] as const;
export type VatRate = (typeof VAT_RATES)[number];

export function isVatRate(value: unknown): value is VatRate {
  return VAT_RATES.includes(value as VatRate);
}

export type LineType = 'materials' | 'labor';
export type QuoteStatus = 'draft' | 'final';
export type ClarificationStatus = 'pending' | 'resolved' | 'dismissed';
export type PipelineStep =
  | 'upload'
  | 'transcribe'
  | 'extract'
  | 'clarification_answer'
  | 'tts_generate'
  | 'pdf_generate'
  | 'audio_cleanup';

export type Contractor = {
  id: string;
  company_name: string;
  address: string | null;
  vat_number: string | null;
  phone: string | null;
  created_at: string;
};

export type CatalogItem = {
  id: string;
  contractor_id: string;
  name: string;
  unit: string;
  materials_price_cents: number;
  labor_price_cents: number;
  vat_rate: VatRate;
  created_at: string;
};

export type Quote = {
  id: string;
  contractor_id: string;
  transcript: string | null;
  status: QuoteStatus;
  customer_name: string | null;
  customer_address: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  audio_path: string | null;
  audio_deleted_at: string | null;
  pdf_path: string | null;
  created_at: string;
};

export type QuoteLineItem = {
  id: string;
  quote_id: string;
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number | null;
  vat_rate: VatRate | null;
  line_type: LineType;
  sort_order: number;
  created_at: string;
};

export type QuoteClarification = {
  id: string;
  quote_id: string;
  question_nl: string;
  status: ClarificationStatus;
  retry_count: number;
  created_at: string;
};

export type PipelineEvent = {
  id: string;
  quote_id: string | null;
  contractor_id: string;
  step: PipelineStep;
  status: 'success' | 'error';
  detail: Record<string, unknown>;
  created_at: string;
};
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0001_initial_schema.sql src/lib/supabase/types.ts src/lib/supabase/__tests__/types.test.ts
git commit -m "feat: add database schema, RLS policies, and row types"
```

---

### Task 3: Money and VAT totals (pure logic)

This is the correctness core of the app — a wrong total is a wrong invoice. It has no I/O, so it gets thorough test coverage.

**Files:**
- Create: `src/lib/money/totals.ts`
- Test: `src/lib/money/__tests__/totals.test.ts`

**Interfaces:**
- Consumes: `VatRate` from `@/lib/supabase/types`
- Produces:
  - `type TotalsLineItem = { quantity: number; unitPriceCents: number; vatRate: VatRate }`
  - `type VatGroup = { vatRate: VatRate; subtotalCents: number; vatAmountCents: number }`
  - `type QuoteTotals = { vatGroups: VatGroup[]; subtotalCents: number; vatTotalCents: number; grandTotalCents: number }`
  - `lineSubtotalCents(item: TotalsLineItem): number`
  - `calculateTotals(items: TotalsLineItem[]): QuoteTotals`
  - `formatEuros(cents: number): string` — Dutch/Belgian formatting, e.g. `"€ 1.234,56"`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/money/__tests__/totals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { lineSubtotalCents, calculateTotals, formatEuros } from '@/lib/money/totals';

describe('lineSubtotalCents', () => {
  it('multiplies quantity by unit price', () => {
    expect(lineSubtotalCents({ quantity: 80, unitPriceCents: 4500, vatRate: 0.06 })).toBe(360000);
  });

  it('handles fractional quantities', () => {
    expect(lineSubtotalCents({ quantity: 80.5, unitPriceCents: 4500, vatRate: 0.06 })).toBe(362250);
  });

  it('rounds a fractional cent result to the nearest cent', () => {
    // 0.5 * 333 = 166.5 -> 167
    expect(lineSubtotalCents({ quantity: 0.5, unitPriceCents: 333, vatRate: 0.06 })).toBe(167);
  });
});

describe('calculateTotals', () => {
  it('returns all-zero totals for an empty quote', () => {
    expect(calculateTotals([])).toEqual({
      vatGroups: [],
      subtotalCents: 0,
      vatTotalCents: 0,
      grandTotalCents: 0,
    });
  });

  it('computes a single-rate quote', () => {
    const totals = calculateTotals([
      { quantity: 80, unitPriceCents: 4500, vatRate: 0.06 }, // 360000
      { quantity: 10, unitPriceCents: 2000, vatRate: 0.06 }, //  20000
    ]);
    expect(totals.subtotalCents).toBe(380000);
    expect(totals.vatGroups).toEqual([
      { vatRate: 0.06, subtotalCents: 380000, vatAmountCents: 22800 },
    ]);
    expect(totals.vatTotalCents).toBe(22800);
    expect(totals.grandTotalCents).toBe(402800);
  });

  it('groups mixed VAT rates separately and sorts them ascending', () => {
    const totals = calculateTotals([
      { quantity: 1, unitPriceCents: 100000, vatRate: 0.21 },
      { quantity: 1, unitPriceCents: 200000, vatRate: 0.06 },
    ]);
    expect(totals.vatGroups).toEqual([
      { vatRate: 0.06, subtotalCents: 200000, vatAmountCents: 12000 },
      { vatRate: 0.21, subtotalCents: 100000, vatAmountCents: 21000 },
    ]);
    expect(totals.subtotalCents).toBe(300000);
    expect(totals.vatTotalCents).toBe(33000);
    expect(totals.grandTotalCents).toBe(333000);
  });

  it('rounds VAT once per group, not per line', () => {
    // Two lines of 1667 cents at 6%. Per-line rounding would give 100+100=200.
    // Correct: group subtotal 3334 * 0.06 = 200.04 -> 200. Same here, so use a
    // case where they differ: 3 lines of 1667 -> 5001 * 0.06 = 300.06 -> 300,
    // whereas per-line would be 3 * 100 = 300. Use 833 cents instead:
    // per-line 833*0.06 = 49.98 -> 50, x3 = 150.
    // grouped: 2499 * 0.06 = 149.94 -> 150. Use 850: per-line 51 x3 = 153;
    // grouped 2550 * 0.06 = 153. Pick a true divergence: 1650 at 21%.
    // per-line: 346.5 -> 347, x2 = 694. grouped: 3300 * 0.21 = 693.
    const totals = calculateTotals([
      { quantity: 1, unitPriceCents: 1650, vatRate: 0.21 },
      { quantity: 1, unitPriceCents: 1650, vatRate: 0.21 },
    ]);
    expect(totals.vatGroups[0].vatAmountCents).toBe(693);
  });

  it('ignores nothing — every line contributes to its group', () => {
    const totals = calculateTotals([
      { quantity: 2, unitPriceCents: 1000, vatRate: 0.06 },
      { quantity: 3, unitPriceCents: 1000, vatRate: 0.06 },
      { quantity: 1, unitPriceCents: 5000, vatRate: 0.21 },
    ]);
    expect(totals.vatGroups).toHaveLength(2);
    expect(totals.subtotalCents).toBe(10000);
  });
});

describe('formatEuros', () => {
  it('formats with Belgian Dutch separators', () => {
    expect(formatEuros(123456)).toBe('€ 1.234,56');
  });

  it('always shows two decimals', () => {
    expect(formatEuros(500)).toBe('€ 5,00');
  });

  it('formats zero', () => {
    expect(formatEuros(0)).toBe('€ 0,00');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/money`
Expected: FAIL — cannot resolve `@/lib/money/totals`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/money/totals.ts`:

```ts
import { VAT_RATES, type VatRate } from '@/lib/supabase/types';

export type TotalsLineItem = {
  quantity: number;
  unitPriceCents: number;
  vatRate: VatRate;
};

export type VatGroup = {
  vatRate: VatRate;
  subtotalCents: number;
  vatAmountCents: number;
};

export type QuoteTotals = {
  vatGroups: VatGroup[];
  subtotalCents: number;
  vatTotalCents: number;
  grandTotalCents: number;
};

export function lineSubtotalCents(item: TotalsLineItem): number {
  return Math.round(item.quantity * item.unitPriceCents);
}

export function calculateTotals(items: TotalsLineItem[]): QuoteTotals {
  const subtotalByRate = new Map<VatRate, number>();

  for (const item of items) {
    const current = subtotalByRate.get(item.vatRate) ?? 0;
    subtotalByRate.set(item.vatRate, current + lineSubtotalCents(item));
  }

  // VAT is rounded once per rate group, not per line — matches how the
  // amount appears on a Belgian invoice.
  const vatGroups: VatGroup[] = VAT_RATES.filter((rate) => subtotalByRate.has(rate)).map(
    (rate) => {
      const subtotalCents = subtotalByRate.get(rate) ?? 0;
      return {
        vatRate: rate,
        subtotalCents,
        vatAmountCents: Math.round(subtotalCents * rate),
      };
    },
  );

  const subtotalCents = vatGroups.reduce((sum, g) => sum + g.subtotalCents, 0);
  const vatTotalCents = vatGroups.reduce((sum, g) => sum + g.vatAmountCents, 0);

  return {
    vatGroups,
    subtotalCents,
    vatTotalCents,
    grandTotalCents: subtotalCents + vatTotalCents,
  };
}

export function formatEuros(cents: number): string {
  const formatted = new Intl.NumberFormat('nl-BE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `€ ${formatted}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/lib/money`
Expected: PASS, all cases.

If `formatEuros` fails on separator characters, log the actual output — some Node ICU builds emit a non-breaking space. If so, normalise in the implementation with `.replace(/ /g, ' ')` and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/lib/money
git commit -m "feat: add VAT-aware quote totals calculation"
```

---

### Task 4: Expand extracted tasks into line items (pure logic)

Claude returns one entry per *task* ("80 m² dakpannen leggen"). Each becomes two `quote_line_items` rows: materials and labor. This split is deterministic, so it lives here rather than in the prompt.

**Files:**
- Create: `src/lib/quotes/expand.ts`
- Test: `src/lib/quotes/__tests__/expand.test.ts`

**Interfaces:**
- Consumes: `CatalogItem`, `LineType`, `VatRate` from `@/lib/supabase/types`
- Produces:
  - `type ExtractedTask = { catalogItemId: string | null; description: string; quantity: number; unit: string }`
  - `type NewLineItem = { catalog_item_id: string | null; description: string; quantity: number; unit: string; unit_price_cents: number | null; vat_rate: VatRate | null; line_type: LineType; sort_order: number }`
  - `expandTasksToLineItems(tasks: ExtractedTask[], catalog: CatalogItem[]): NewLineItem[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/quotes/__tests__/expand.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { expandTasksToLineItems } from '@/lib/quotes/expand';
import type { CatalogItem } from '@/lib/supabase/types';

const tiles: CatalogItem = {
  id: 'cat-1',
  contractor_id: 'contractor-1',
  name: 'Dakpannen leggen (kleitegels)',
  unit: 'm²',
  materials_price_cents: 3000,
  labor_price_cents: 1500,
  vat_rate: 0.06,
  created_at: '2026-08-06T00:00:00Z',
};

describe('expandTasksToLineItems', () => {
  it('expands a matched task into a materials row and a labor row', () => {
    const rows = expandTasksToLineItems(
      [{ catalogItemId: 'cat-1', description: 'Dakpannen leggen', quantity: 80, unit: 'm²' }],
      [tiles],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      catalog_item_id: 'cat-1',
      description: 'Dakpannen leggen (kleitegels) – materiaal',
      quantity: 80,
      unit: 'm²',
      unit_price_cents: 3000,
      vat_rate: 0.06,
      line_type: 'materials',
    });
    expect(rows[1]).toMatchObject({
      catalog_item_id: 'cat-1',
      description: 'Dakpannen leggen (kleitegels) – arbeid',
      unit_price_cents: 1500,
      vat_rate: 0.06,
      line_type: 'labor',
    });
  });

  it('copies prices from the catalog so later catalog edits do not change the quote', () => {
    const rows = expandTasksToLineItems(
      [{ catalogItemId: 'cat-1', description: 'x', quantity: 1, unit: 'm²' }],
      [tiles],
    );
    expect(rows[0].unit_price_cents).toBe(tiles.materials_price_cents);
    expect(rows[1].unit_price_cents).toBe(tiles.labor_price_cents);
  });

  it('expands an unmatched task into two empty rows for the contractor to price', () => {
    const rows = expandTasksToLineItems(
      [{ catalogItemId: null, description: 'Zinken dakgoot vervangen', quantity: 12, unit: 'm' }],
      [tiles],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      catalog_item_id: null,
      description: 'Zinken dakgoot vervangen – materiaal',
      quantity: 12,
      unit: 'm',
      unit_price_cents: null,
      vat_rate: null,
      line_type: 'materials',
    });
    expect(rows[1].line_type).toBe('labor');
    expect(rows[1].unit_price_cents).toBeNull();
  });

  it('treats a catalogItemId that is not in the catalog as unmatched', () => {
    const rows = expandTasksToLineItems(
      [{ catalogItemId: 'does-not-exist', description: 'Iets', quantity: 1, unit: 'stuk' }],
      [tiles],
    );
    expect(rows[0].catalog_item_id).toBeNull();
    expect(rows[0].unit_price_cents).toBeNull();
  });

  it('assigns increasing sort_order so rows keep a stable display sequence', () => {
    const rows = expandTasksToLineItems(
      [
        { catalogItemId: 'cat-1', description: 'A', quantity: 1, unit: 'm²' },
        { catalogItemId: null, description: 'B', quantity: 2, unit: 'm' },
      ],
      [tiles],
    );
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2, 3]);
  });

  it('returns nothing for no tasks', () => {
    expect(expandTasksToLineItems([], [tiles])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/quotes`
Expected: FAIL — cannot resolve `@/lib/quotes/expand`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/quotes/expand.ts`:

```ts
import type { CatalogItem, LineType, VatRate } from '@/lib/supabase/types';

export type ExtractedTask = {
  catalogItemId: string | null;
  description: string;
  quantity: number;
  unit: string;
};

export type NewLineItem = {
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number | null;
  vat_rate: VatRate | null;
  line_type: LineType;
  sort_order: number;
};

const SUFFIX: Record<LineType, string> = {
  materials: 'materiaal',
  labor: 'arbeid',
};

export function expandTasksToLineItems(
  tasks: ExtractedTask[],
  catalog: CatalogItem[],
): NewLineItem[] {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const rows: NewLineItem[] = [];

  for (const task of tasks) {
    const match = task.catalogItemId ? byId.get(task.catalogItemId) : undefined;
    // A catalogItemId the model invented is treated as unmatched rather than
    // trusted — we never price a line we cannot trace to a real catalog row.
    const baseName = match ? match.name : task.description;
    const unit = match ? match.unit : task.unit;

    for (const lineType of ['materials', 'labor'] as const) {
      rows.push({
        catalog_item_id: match ? match.id : null,
        description: `${baseName} – ${SUFFIX[lineType]}`,
        quantity: task.quantity,
        unit,
        unit_price_cents: match
          ? lineType === 'materials'
            ? match.materials_price_cents
            : match.labor_price_cents
          : null,
        vat_rate: match ? match.vat_rate : null,
        line_type: lineType,
        sort_order: rows.length,
      });
    }
  }

  return rows;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/lib/quotes`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quotes
git commit -m "feat: expand extracted tasks into materials and labor line items"
```

---

### Task 5: Supabase clients and authentication

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
- Create: `src/lib/auth/require-contractor.ts`
- Create: `src/app/login/page.tsx`, `src/app/login/LoginForm.tsx`
- Create: `src/middleware.ts`
- Test: `src/lib/auth/__tests__/require-contractor.test.ts`

**Interfaces:**
- Consumes: `Contractor` from `@/lib/supabase/types`
- Produces:
  - `createBrowserSupabase()` — browser client, anon key
  - `createServerSupabase()` — RLS-scoped server client reading the auth cookie
  - `createAdminSupabase()` — service-role client, bypasses RLS (logging + storage cleanup only)
  - `requireContractor(): Promise<{ supabase, contractor: Contractor }>` — throws `UnauthorizedError` when no session
  - `class UnauthorizedError extends Error`

- [ ] **Step 1: Write the browser client**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Write the server client**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Write the admin client**

Create `src/lib/supabase/admin.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. Bypasses RLS — use ONLY for writing pipeline_events
 * and for storage cleanup. Never expose to the browser.
 */
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```

- [ ] **Step 4: Write the failing auth-guard test**

Create `src/lib/auth/__tests__/require-contractor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateServerSupabase = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => mockCreateServerSupabase(),
}));

import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';

const contractor = {
  id: 'user-1',
  company_name: 'Dakwerken Janssens',
  address: null,
  vat_number: null,
  phone: null,
  created_at: '2026-08-06T00:00:00Z',
};

function supabaseStub(user: { id: string } | null, row: typeof contractor | null) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: row, error: row ? null : { message: 'not found' } }),
        }),
      }),
    }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('requireContractor', () => {
  it('returns the contractor when a session exists', async () => {
    mockCreateServerSupabase.mockResolvedValue(supabaseStub({ id: 'user-1' }, contractor));
    const result = await requireContractor();
    expect(result.contractor.company_name).toBe('Dakwerken Janssens');
  });

  it('throws UnauthorizedError when there is no session', async () => {
    mockCreateServerSupabase.mockResolvedValue(supabaseStub(null, null));
    await expect(requireContractor()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws UnauthorizedError when the contractor row is missing', async () => {
    mockCreateServerSupabase.mockResolvedValue(supabaseStub({ id: 'user-1' }, null));
    await expect(requireContractor()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test src/lib/auth`
Expected: FAIL — cannot resolve `@/lib/auth/require-contractor`.

- [ ] **Step 6: Write the auth guard**

Create `src/lib/auth/require-contractor.ts`:

```ts
import { createServerSupabase } from '@/lib/supabase/server';
import type { Contractor } from '@/lib/supabase/types';

export class UnauthorizedError extends Error {
  constructor() {
    super('Niet aangemeld');
    this.name = 'UnauthorizedError';
  }
}

export async function requireContractor() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();

  if (!data.user) throw new UnauthorizedError();

  const { data: contractor } = await supabase
    .from('contractors')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (!contractor) throw new UnauthorizedError();

  return { supabase, contractor: contractor as Contractor };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test src/lib/auth`
Expected: PASS, 3 tests.

- [ ] **Step 8: Write the session-refresh middleware**

Create `src/middleware.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const isPublic = request.nextUrl.pathname.startsWith('/login');

  if (!data.user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (data.user && isPublic) {
    return NextResponse.redirect(new URL('/offertes', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron).*)'],
};
```

- [ ] **Step 9: Write the login page**

Create `src/app/login/page.tsx`:

```tsx
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-6 text-2xl font-bold">Aanmelden</h1>
      <LoginForm />
    </main>
  );
}
```

Create `src/app/login/LoginForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createBrowserSupabase();

    const { error: authError } =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { company_name: companyName } },
          });

    setBusy(false);
    if (authError) {
      setError('Aanmelden mislukt. Controleer je e-mailadres en wachtwoord.');
      return;
    }
    router.push('/offertes');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === 'signup' && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Bedrijfsnaam</span>
          <input
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="rounded border p-3"
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">E-mailadres</span>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border p-3"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Wachtwoord</span>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border p-3"
        />
      </label>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={busy} className="rounded bg-black p-3 text-white disabled:opacity-50">
        {busy ? 'Bezig…' : mode === 'login' ? 'Aanmelden' : 'Account aanmaken'}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
        className="text-sm underline"
      >
        {mode === 'login' ? 'Nog geen account? Registreer je hier.' : 'Al een account? Meld je aan.'}
      </button>
    </form>
  );
}
```

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/supabase src/lib/auth src/app/login src/middleware.ts
git commit -m "feat: add Supabase clients, auth guard, and login page"
```

---

### Task 6: Contractor profile settings

The PDF letterhead needs the contractor's business details, so this comes before PDF generation.

**Files:**
- Create: `src/app/instellingen/page.tsx`, `src/app/instellingen/ProfileForm.tsx`
- Create: `src/app/instellingen/actions.ts`
- Test: `src/app/instellingen/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `requireContractor` from `@/lib/auth/require-contractor`, `Contractor` type
- Produces:
  - `parseProfileInput(form: FormData): { company_name: string; address: string | null; vat_number: string | null; phone: string | null }` — throws `Error` with a Dutch message when `company_name` is blank
  - `saveProfile(form: FormData): Promise<void>` — server action

- [ ] **Step 1: Write the failing parser test**

Create `src/app/instellingen/__tests__/actions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseProfileInput } from '@/app/instellingen/actions';

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe('parseProfileInput', () => {
  it('parses all fields', () => {
    const result = parseProfileInput(
      formOf({
        company_name: 'Dakwerken Janssens',
        address: 'Kerkstraat 1, 9000 Gent',
        vat_number: 'BE0123456789',
        phone: '0470123456',
      }),
    );
    expect(result).toEqual({
      company_name: 'Dakwerken Janssens',
      address: 'Kerkstraat 1, 9000 Gent',
      vat_number: 'BE0123456789',
      phone: '0470123456',
    });
  });

  it('trims whitespace', () => {
    const result = parseProfileInput(formOf({ company_name: '  Dakwerken  ' }));
    expect(result.company_name).toBe('Dakwerken');
  });

  it('turns blank optional fields into null', () => {
    const result = parseProfileInput(formOf({ company_name: 'X', address: '   ' }));
    expect(result.address).toBeNull();
    expect(result.vat_number).toBeNull();
  });

  it('rejects a blank company name with a Dutch message', () => {
    expect(() => parseProfileInput(formOf({ company_name: '  ' }))).toThrow('Bedrijfsnaam is verplicht');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test src/app/instellingen`
Expected: FAIL — cannot resolve `@/app/instellingen/actions`.

- [ ] **Step 3: Write the server action**

Create `src/app/instellingen/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';

function optional(form: FormData, key: string): string | null {
  const value = (form.get(key) as string | null)?.trim();
  return value ? value : null;
}

export function parseProfileInput(form: FormData) {
  const companyName = (form.get('company_name') as string | null)?.trim() ?? '';
  if (!companyName) throw new Error('Bedrijfsnaam is verplicht');

  return {
    company_name: companyName,
    address: optional(form, 'address'),
    vat_number: optional(form, 'vat_number'),
    phone: optional(form, 'phone'),
  };
}

export async function saveProfile(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const input = parseProfileInput(form);

  const { error } = await supabase.from('contractors').update(input).eq('id', contractor.id);
  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');

  revalidatePath('/instellingen');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/app/instellingen`
Expected: PASS, 4 tests.

Note: `parseProfileInput` is exported from a `'use server'` module purely so it can be unit-tested. If Next.js rejects exporting a synchronous function from a server-action file, move `parseProfileInput` to `src/app/instellingen/parse.ts` and re-import it in `actions.ts` — update the test import to match.

- [ ] **Step 5: Write the settings page**

Create `src/app/instellingen/page.tsx`:

```tsx
import { requireContractor } from '@/lib/auth/require-contractor';
import ProfileForm from './ProfileForm';

export default async function SettingsPage() {
  const { contractor } = await requireContractor();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Instellingen</h1>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Bedrijfsgegevens</h2>
        <p className="mb-4 text-sm text-gray-600">
          Deze gegevens verschijnen op elke offerte die je genereert.
        </p>
        <ProfileForm contractor={contractor} />
      </section>
    </main>
  );
}
```

Create `src/app/instellingen/ProfileForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { Contractor } from '@/lib/supabase/types';
import { saveProfile } from './actions';

export default function ProfileForm({ contractor }: { contractor: Contractor }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function action(form: FormData) {
    setStatus('saving');
    try {
      await saveProfile(form);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Bedrijfsnaam</span>
        <input name="company_name" required defaultValue={contractor.company_name} className="rounded border p-3" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Adres</span>
        <input name="address" defaultValue={contractor.address ?? ''} className="rounded border p-3" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">BTW-nummer</span>
        <input name="vat_number" defaultValue={contractor.vat_number ?? ''} placeholder="BE0123456789" className="rounded border p-3" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Telefoonnummer</span>
        <input name="phone" defaultValue={contractor.phone ?? ''} className="rounded border p-3" />
      </label>

      <button type="submit" disabled={status === 'saving'} className="rounded bg-black p-3 text-white disabled:opacity-50">
        {status === 'saving' ? 'Bezig met opslaan…' : 'Opslaan'}
      </button>

      {status === 'saved' && <p className="text-sm text-green-700">Gegevens opgeslagen.</p>}
      {status === 'error' && <p role="alert" className="text-sm text-red-600">Opslaan mislukt. Probeer opnieuw.</p>}
    </form>
  );
}
```

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/app/instellingen
git commit -m "feat: add contractor profile settings page"
```

---

### Task 7: Price catalog CRUD

Extraction has nothing to match against without a catalog, so this must work before the voice pipeline is built.

**Files:**
- Create: `src/lib/validation/catalog.ts`
- Create: `src/app/instellingen/catalog-actions.ts`
- Create: `src/components/CatalogForm.tsx`
- Modify: `src/app/instellingen/page.tsx` (add the catalog section)
- Test: `src/lib/validation/__tests__/catalog.test.ts`

**Interfaces:**
- Consumes: `isVatRate`, `VatRate`, `CatalogItem`; `requireContractor`
- Produces:
  - `type CatalogItemInput = { name: string; unit: string; materials_price_cents: number; labor_price_cents: number; vat_rate: VatRate }`
  - `parseEurosToCents(input: string): number` — accepts `"45"`, `"45,50"`, `"45.50"`; throws on anything else
  - `validateCatalogInput(raw: Record<string, string>): CatalogItemInput` — throws `Error` with a Dutch message
  - `createCatalogItem(form: FormData)`, `deleteCatalogItem(id: string)` — server actions

- [ ] **Step 1: Write the failing validation tests**

Create `src/lib/validation/__tests__/catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseEurosToCents, validateCatalogInput } from '@/lib/validation/catalog';

describe('parseEurosToCents', () => {
  it('parses a whole-euro amount', () => {
    expect(parseEurosToCents('45')).toBe(4500);
  });

  it('parses a comma decimal separator (Belgian convention)', () => {
    expect(parseEurosToCents('45,50')).toBe(4550);
  });

  it('parses a dot decimal separator', () => {
    expect(parseEurosToCents('45.50')).toBe(4550);
  });

  it('parses zero', () => {
    expect(parseEurosToCents('0')).toBe(0);
  });

  it('rounds to the nearest cent', () => {
    expect(parseEurosToCents('45,555')).toBe(4556);
  });

  it('rejects a non-numeric value', () => {
    expect(() => parseEurosToCents('abc')).toThrow('Ongeldig bedrag');
  });

  it('rejects an empty value', () => {
    expect(() => parseEurosToCents('')).toThrow('Ongeldig bedrag');
  });

  it('rejects a negative amount', () => {
    expect(() => parseEurosToCents('-5')).toThrow('Bedrag mag niet negatief zijn');
  });
});

describe('validateCatalogInput', () => {
  const valid = {
    name: 'Dakpannen leggen',
    unit: 'm²',
    materials_price: '30',
    labor_price: '15',
    vat_rate: '0.06',
  };

  it('accepts a complete item', () => {
    expect(validateCatalogInput(valid)).toEqual({
      name: 'Dakpannen leggen',
      unit: 'm²',
      materials_price_cents: 3000,
      labor_price_cents: 1500,
      vat_rate: 0.06,
    });
  });

  it('accepts the 21% rate', () => {
    expect(validateCatalogInput({ ...valid, vat_rate: '0.21' }).vat_rate).toBe(0.21);
  });

  it('rejects a missing name', () => {
    expect(() => validateCatalogInput({ ...valid, name: '  ' })).toThrow('Naam is verplicht');
  });

  it('rejects a missing unit', () => {
    expect(() => validateCatalogInput({ ...valid, unit: '' })).toThrow('Eenheid is verplicht');
  });

  it('rejects a missing VAT rate — it is never defaulted', () => {
    expect(() => validateCatalogInput({ ...valid, vat_rate: '' })).toThrow('Kies een btw-tarief');
  });

  it('rejects an illegal VAT rate', () => {
    expect(() => validateCatalogInput({ ...valid, vat_rate: '0.12' })).toThrow('Kies een btw-tarief');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/validation`
Expected: FAIL — cannot resolve `@/lib/validation/catalog`.

- [ ] **Step 3: Write the validation module**

Create `src/lib/validation/catalog.ts`:

```ts
import { isVatRate, type VatRate } from '@/lib/supabase/types';

export type CatalogItemInput = {
  name: string;
  unit: string;
  materials_price_cents: number;
  labor_price_cents: number;
  vat_rate: VatRate;
};

export function parseEurosToCents(input: string): number {
  const normalised = (input ?? '').trim().replace(',', '.');
  if (normalised === '') throw new Error('Ongeldig bedrag');

  const value = Number(normalised);
  if (!Number.isFinite(value)) throw new Error('Ongeldig bedrag');
  if (value < 0) throw new Error('Bedrag mag niet negatief zijn');

  return Math.round(value * 100);
}

export function validateCatalogInput(raw: Record<string, string>): CatalogItemInput {
  const name = (raw.name ?? '').trim();
  if (!name) throw new Error('Naam is verplicht');

  const unit = (raw.unit ?? '').trim();
  if (!unit) throw new Error('Eenheid is verplicht');

  // Never defaulted — an unset or illegal rate is a hard error.
  const vatRate = Number(raw.vat_rate);
  if (!isVatRate(vatRate)) throw new Error('Kies een btw-tarief (6% of 21%)');

  return {
    name,
    unit,
    materials_price_cents: parseEurosToCents(raw.materials_price ?? ''),
    labor_price_cents: parseEurosToCents(raw.labor_price ?? ''),
    vat_rate: vatRate,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/lib/validation`
Expected: PASS, 14 tests.

- [ ] **Step 5: Write the catalog server actions**

Create `src/app/instellingen/catalog-actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import { validateCatalogInput } from '@/lib/validation/catalog';

export async function createCatalogItem(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();

  const input = validateCatalogInput({
    name: String(form.get('name') ?? ''),
    unit: String(form.get('unit') ?? ''),
    materials_price: String(form.get('materials_price') ?? ''),
    labor_price: String(form.get('labor_price') ?? ''),
    vat_rate: String(form.get('vat_rate') ?? ''),
  });

  const { error } = await supabase
    .from('catalog_items')
    .insert({ ...input, contractor_id: contractor.id });

  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
  revalidatePath('/instellingen');
}

export async function deleteCatalogItem(id: string): Promise<void> {
  const { supabase } = await requireContractor();
  const { error } = await supabase.from('catalog_items').delete().eq('id', id);
  if (error) throw new Error('Verwijderen mislukt. Probeer opnieuw.');
  revalidatePath('/instellingen');
}
```

- [ ] **Step 6: Write the catalog UI component**

Create `src/components/CatalogForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { CatalogItem } from '@/lib/supabase/types';
import { formatEuros } from '@/lib/money/totals';
import { createCatalogItem, deleteCatalogItem } from '@/app/instellingen/catalog-actions';

export default function CatalogForm({ items }: { items: CatalogItem[] }) {
  const [error, setError] = useState<string | null>(null);

  async function action(form: FormData) {
    setError(null);
    try {
      await createCatalogItem(form);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-2">
        {items.length === 0 && (
          <li className="rounded border border-dashed p-4 text-sm text-gray-600">
            Nog geen prijzen ingesteld. Voeg minstens één item toe voordat je een offerte opneemt.
          </li>
        )}
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-gray-600">
                Per {item.unit} · materiaal {formatEuros(item.materials_price_cents)} · arbeid{' '}
                {formatEuros(item.labor_price_cents)} · btw {item.vat_rate === 0.06 ? '6%' : '21%'}
              </p>
            </div>
            <button
              onClick={() => deleteCatalogItem(item.id)}
              className="text-sm text-red-600 underline"
              aria-label={`Verwijder ${item.name}`}
            >
              Verwijderen
            </button>
          </li>
        ))}
      </ul>

      <form action={action} className="flex flex-col gap-3 rounded border p-4">
        <h3 className="font-semibold">Nieuw item toevoegen</h3>
        <input name="name" required placeholder="Omschrijving (bv. Dakpannen leggen)" className="rounded border p-3" />
        <input name="unit" required placeholder="Eenheid (bv. m², stuk, uur)" className="rounded border p-3" />
        <input name="materials_price" required inputMode="decimal" placeholder="Materiaalprijs per eenheid (€)" className="rounded border p-3" />
        <input name="labor_price" required inputMode="decimal" placeholder="Arbeidsprijs per eenheid (€)" className="rounded border p-3" />
        <select name="vat_rate" required defaultValue="" className="rounded border p-3">
          <option value="" disabled>Kies btw-tarief…</option>
          <option value="0.06">6% (renovatie, gebouw ouder dan 10 jaar)</option>
          <option value="0.21">21% (standaardtarief)</option>
        </select>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-black p-3 text-white">Toevoegen</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Add the catalog section to the settings page**

In `src/app/instellingen/page.tsx`, import `CatalogForm`, fetch the items, and render a second section. Replace the file body with:

```tsx
import { requireContractor } from '@/lib/auth/require-contractor';
import CatalogForm from '@/components/CatalogForm';
import type { CatalogItem } from '@/lib/supabase/types';
import ProfileForm from './ProfileForm';

export default async function SettingsPage() {
  const { supabase, contractor } = await requireContractor();
  const { data } = await supabase
    .from('catalog_items')
    .select('*')
    .order('name', { ascending: true });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Instellingen</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Bedrijfsgegevens</h2>
        <p className="mb-4 text-sm text-gray-600">
          Deze gegevens verschijnen op elke offerte die je genereert.
        </p>
        <ProfileForm contractor={contractor} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Prijslijst</h2>
        <p className="mb-4 text-sm text-gray-600">
          Je eigen prijzen. Deze worden gebruikt om je gesproken beschrijving om te zetten in een offerte.
        </p>
        <CatalogForm items={(data ?? []) as CatalogItem[]} />
      </section>
    </main>
  );
}
```

- [ ] **Step 8: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/lib/validation src/app/instellingen src/components/CatalogForm.tsx
git commit -m "feat: add price catalog management with VAT rate per item"
```

---

### Task 8: Pipeline event logging

Every later task calls this. It must never throw — a logging failure must not break the pipeline it is observing.

**Files:**
- Create: `src/lib/logging/pipeline-events.ts`
- Test: `src/lib/logging/__tests__/pipeline-events.test.ts`

**Interfaces:**
- Consumes: `createAdminSupabase`, `PipelineStep` type
- Produces:
  - `logPipelineEvent(args: { quoteId: string | null; contractorId: string; step: PipelineStep; status: 'success' | 'error'; detail?: Record<string, unknown> }): Promise<void>`
  - `serialiseError(error: unknown): Record<string, unknown>`
  - `truncate(text: string, max?: number): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/logging/__tests__/pipeline-events.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({ from: () => ({ insert }) }),
}));

import { logPipelineEvent, serialiseError, truncate } from '@/lib/logging/pipeline-events';

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('kort', 10)).toBe('kort');
  });

  it('cuts long text and marks it', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde… [afgekapt]');
  });
});

describe('serialiseError', () => {
  it('captures name, message, and stack from an Error', () => {
    const result = serialiseError(new TypeError('kapot'));
    expect(result.name).toBe('TypeError');
    expect(result.message).toBe('kapot');
    expect(typeof result.stack).toBe('string');
  });

  it('handles a non-Error value', () => {
    expect(serialiseError('gewoon een string')).toEqual({ message: 'gewoon een string' });
  });
});

describe('logPipelineEvent', () => {
  it('inserts a row with the given fields', async () => {
    await logPipelineEvent({
      quoteId: 'quote-1',
      contractorId: 'contractor-1',
      step: 'transcribe',
      status: 'success',
      detail: { durationMs: 1200 },
    });

    expect(insert).toHaveBeenCalledWith({
      quote_id: 'quote-1',
      contractor_id: 'contractor-1',
      step: 'transcribe',
      status: 'success',
      detail: { durationMs: 1200 },
    });
  });

  it('defaults detail to an empty object', async () => {
    await logPipelineEvent({
      quoteId: null,
      contractorId: 'contractor-1',
      step: 'upload',
      status: 'error',
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ detail: {} }));
  });

  it('never throws when the insert fails — logging must not break the pipeline', async () => {
    insert.mockResolvedValue({ error: { message: 'db down' } });
    await expect(
      logPipelineEvent({ quoteId: null, contractorId: 'c1', step: 'extract', status: 'success' }),
    ).resolves.toBeUndefined();
  });

  it('never throws when the client itself blows up', async () => {
    insert.mockRejectedValue(new Error('network'));
    await expect(
      logPipelineEvent({ quoteId: null, contractorId: 'c1', step: 'extract', status: 'success' }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/logging`
Expected: FAIL — cannot resolve `@/lib/logging/pipeline-events`.

- [ ] **Step 3: Write the logger**

Create `src/lib/logging/pipeline-events.ts`:

```ts
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { PipelineStep } from '@/lib/supabase/types';

export function truncate(text: string, max = 2000): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [afgekapt]`;
}

export function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ? truncate(error.stack, 4000) : undefined,
    };
  }
  return { message: String(error) };
}

export async function logPipelineEvent(args: {
  quoteId: string | null;
  contractorId: string;
  step: PipelineStep;
  status: 'success' | 'error';
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createAdminSupabase();
    await supabase.from('pipeline_events').insert({
      quote_id: args.quoteId,
      contractor_id: args.contractorId,
      step: args.step,
      status: args.status,
      detail: args.detail ?? {},
    });
  } catch {
    // Observability must never take down the thing it observes.
    // Vercel's platform logs still capture the surrounding request.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/lib/logging`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/logging
git commit -m "feat: add structured pipeline event logging"
```

---

### Task 9: Whisper transcription adapter

**Files:**
- Create: `src/lib/ai/openai-client.ts`
- Create: `src/lib/ai/transcribe.ts`
- Test: `src/lib/ai/__tests__/transcribe.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `getOpenAI(): OpenAI` — lazily constructed singleton
  - `class TranscriptionError extends Error`
  - `transcribeAudio(audio: File): Promise<string>` — Dutch transcript; throws `TranscriptionError` on API failure or an empty result

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ai/__tests__/transcribe.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@/lib/ai/openai-client', () => ({
  getOpenAI: () => ({ audio: { transcriptions: { create } } }),
}));

import { transcribeAudio, TranscriptionError } from '@/lib/ai/transcribe';

function audioFile() {
  return new File([new Uint8Array([1, 2, 3])], 'opname.webm', { type: 'audio/webm' });
}

beforeEach(() => create.mockReset());

describe('transcribeAudio', () => {
  it('returns the transcript text', async () => {
    create.mockResolvedValue({ text: 'Tachtig vierkante meter dakpannen vervangen.' });
    await expect(transcribeAudio(audioFile())).resolves.toBe(
      'Tachtig vierkante meter dakpannen vervangen.',
    );
  });

  it('requests Dutch explicitly so Flemish audio is not misdetected', async () => {
    create.mockResolvedValue({ text: 'iets' });
    await transcribeAudio(audioFile());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ language: 'nl' }));
  });

  it('trims surrounding whitespace', async () => {
    create.mockResolvedValue({ text: '  dakgoot vervangen  ' });
    await expect(transcribeAudio(audioFile())).resolves.toBe('dakgoot vervangen');
  });

  it('throws TranscriptionError when the API fails', async () => {
    create.mockRejectedValue(new Error('rate limited'));
    await expect(transcribeAudio(audioFile())).rejects.toBeInstanceOf(TranscriptionError);
  });

  it('throws TranscriptionError when the transcript is empty', async () => {
    create.mockResolvedValue({ text: '   ' });
    await expect(transcribeAudio(audioFile())).rejects.toBeInstanceOf(TranscriptionError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/ai`
Expected: FAIL — cannot resolve `@/lib/ai/transcribe`.

- [ ] **Step 3: Write the OpenAI client**

Create `src/lib/ai/openai-client.ts`:

```ts
import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}
```

- [ ] **Step 4: Write the transcription adapter**

Create `src/lib/ai/transcribe.ts`:

```ts
import { getOpenAI } from '@/lib/ai/openai-client';

export class TranscriptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TranscriptionError';
  }
}

export async function transcribeAudio(audio: File): Promise<string> {
  let text: string;

  try {
    const result = await getOpenAI().audio.transcriptions.create({
      file: audio,
      model: process.env.TRANSCRIPTION_MODEL ?? 'whisper-1',
      // Pinned to Dutch: Flemish audio is otherwise sometimes detected as
      // German or Afrikaans, which wrecks the transcript.
      language: 'nl',
    });
    text = (result.text ?? '').trim();
  } catch (error) {
    throw new TranscriptionError('Transcriptie mislukt', { cause: error });
  }

  if (!text) throw new TranscriptionError('Transcriptie leverde geen tekst op');
  return text;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test src/lib/ai`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai
git commit -m "feat: add Whisper transcription adapter"
```

---

### Task 10: Claude extraction with catalog matching

Turns a Dutch transcript plus the contractor's catalog into tasks and clarifications. The model never invents prices — it only references catalog IDs.

**Files:**
- Create: `src/lib/ai/schemas.ts`
- Create: `src/lib/ai/anthropic-client.ts`
- Create: `src/lib/ai/extract.ts`
- Test: `src/lib/ai/__tests__/extract.test.ts`

**Interfaces:**
- Consumes: `CatalogItem`; `ExtractedTask` from `@/lib/quotes/expand`
- Produces:
  - `ExtractionResultSchema` (Zod) and `type ExtractionResult = { tasks: ExtractedTask[]; clarifications: { questionNl: string }[] }`
  - `class ExtractionError extends Error`
  - `buildExtractionPrompt(transcript: string, catalog: CatalogItem[]): string`
  - `extractQuoteTasks(transcript: string, catalog: CatalogItem[]): Promise<ExtractionResult>` — retries once internally on a malformed response

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ai/__tests__/extract.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@/lib/ai/anthropic-client', () => ({
  getAnthropic: () => ({ messages: { create } }),
}));

import { extractQuoteTasks, buildExtractionPrompt, ExtractionError } from '@/lib/ai/extract';
import type { CatalogItem } from '@/lib/supabase/types';

const catalog: CatalogItem[] = [
  {
    id: 'cat-1',
    contractor_id: 'c1',
    name: 'Dakpannen leggen (kleitegels)',
    unit: 'm²',
    materials_price_cents: 3000,
    labor_price_cents: 1500,
    vat_rate: 0.06,
    created_at: '2026-08-06T00:00:00Z',
  },
];

function reply(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

beforeEach(() => create.mockReset());

describe('buildExtractionPrompt', () => {
  it('includes the transcript', () => {
    const prompt = buildExtractionPrompt('tachtig vierkante meter', catalog);
    expect(prompt).toContain('tachtig vierkante meter');
  });

  it('includes every catalog item with its id and unit', () => {
    const prompt = buildExtractionPrompt('x', catalog);
    expect(prompt).toContain('cat-1');
    expect(prompt).toContain('Dakpannen leggen (kleitegels)');
    expect(prompt).toContain('m²');
  });

  it('states that prices must never be invented', () => {
    expect(buildExtractionPrompt('x', catalog).toLowerCase()).toContain('never invent');
  });
});

describe('extractQuoteTasks', () => {
  it('parses tasks and clarifications', async () => {
    create.mockResolvedValue(
      reply({
        tasks: [
          { catalogItemId: 'cat-1', description: 'Dakpannen leggen', quantity: 80, unit: 'm²' },
        ],
        clarifications: [{ questionNl: 'Welk type dakpannen wil je gebruiken?' }],
      }),
    );

    const result = await extractQuoteTasks('tachtig vierkante meter dakpannen', catalog);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].quantity).toBe(80);
    expect(result.clarifications[0].questionNl).toBe('Welk type dakpannen wil je gebruiken?');
  });

  it('accepts an empty clarification list', async () => {
    create.mockResolvedValue(reply({ tasks: [], clarifications: [] }));
    const result = await extractQuoteTasks('onduidelijk', catalog);
    expect(result.tasks).toEqual([]);
    expect(result.clarifications).toEqual([]);
  });

  it('tolerates a response wrapped in a markdown code fence', async () => {
    create.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n{"tasks":[],"clarifications":[]}\n```',
        },
      ],
    });
    await expect(extractQuoteTasks('x', catalog)).resolves.toEqual({
      tasks: [],
      clarifications: [],
    });
  });

  it('retries once when the first response is malformed', async () => {
    create
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'niet eens JSON' }] })
      .mockResolvedValueOnce(reply({ tasks: [], clarifications: [] }));

    await expect(extractQuoteTasks('x', catalog)).resolves.toEqual({
      tasks: [],
      clarifications: [],
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('throws ExtractionError when both attempts are malformed', async () => {
    create.mockResolvedValue({ content: [{ type: 'text', text: 'nog steeds geen JSON' }] });
    await expect(extractQuoteTasks('x', catalog)).rejects.toBeInstanceOf(ExtractionError);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('throws ExtractionError when the API call itself fails', async () => {
    create.mockRejectedValue(new Error('overloaded'));
    await expect(extractQuoteTasks('x', catalog)).rejects.toBeInstanceOf(ExtractionError);
  });

  it('rejects a task with a non-positive quantity', async () => {
    create.mockResolvedValue(
      reply({ tasks: [{ catalogItemId: null, description: 'x', quantity: 0, unit: 'm' }], clarifications: [] }),
    );
    await expect(extractQuoteTasks('x', catalog)).rejects.toBeInstanceOf(ExtractionError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/ai/__tests__/extract.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/extract`.

- [ ] **Step 3: Write the Zod schemas**

Create `src/lib/ai/schemas.ts`:

```ts
import { z } from 'zod';

export const ExtractedTaskSchema = z.object({
  catalogItemId: z.string().nullable(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
});

export const ClarificationSchema = z.object({
  questionNl: z.string().min(1),
});

export const ExtractionResultSchema = z.object({
  tasks: z.array(ExtractedTaskSchema),
  clarifications: z.array(ClarificationSchema),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/** Strips a ```json fence if the model wrapped its reply in one. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}
```

- [ ] **Step 4: Write the Anthropic client**

Create `src/lib/ai/anthropic-client.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function extractionModel(): string {
  return process.env.EXTRACTION_MODEL ?? 'claude-sonnet-5';
}
```

- [ ] **Step 5: Write the extraction module**

Create `src/lib/ai/extract.ts`:

```ts
import { getAnthropic, extractionModel } from '@/lib/ai/anthropic-client';
import { ExtractionResultSchema, stripCodeFence, type ExtractionResult } from '@/lib/ai/schemas';
import type { CatalogItem } from '@/lib/supabase/types';

export class ExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExtractionError';
  }
}

export function buildExtractionPrompt(transcript: string, catalog: CatalogItem[]): string {
  const catalogLines = catalog
    .map(
      (item) =>
        `- id: ${item.id} | name: ${item.name} | unit: ${item.unit} | vat: ${item.vat_rate}`,
    )
    .join('\n');

  return `You extract quote line items from a Flemish roofworker's spoken job description.

The transcript is Dutch (Flemish), often informal, and may contain dialect or
trade jargon. Numbers may be written as words ("tachtig vierkante meter" = 80 m²).

The contractor's price catalog:
${catalogLines || '(empty)'}

Transcript:
"""
${transcript}
"""

Return ONLY a JSON object, no prose, with this exact shape:
{
  "tasks": [
    { "catalogItemId": "<id from the catalog, or null>",
      "description": "<short Dutch description of the task>",
      "quantity": <number>,
      "unit": "<unit, e.g. m², m, stuk>" }
  ],
  "clarifications": [
    { "questionNl": "<a short question in Dutch>" }
  ]
}

Rules for "tasks":
- One entry per distinct task or material mentioned. Do NOT split materials and
  labour — that happens downstream.
- Match to a catalog item by MEANING, not exact wording ("pannen leggen" matches
  "Dakpannen leggen (kleitegels)"). Use that item's id.
- If nothing in the catalog fits, set catalogItemId to null and describe the task
  in Dutch. Never invent a catalog id that is not listed above.
- Never invent prices. You are not given prices and must not guess them.
- quantity must be a positive number. If a quantity was not stated, do not guess —
  omit the task and raise a clarification instead.

Rules for "clarifications" — raise one when:
- A quantity was mentioned without a material, or a material without a quantity.
- A commonly required companion item for a mentioned task was not mentioned
  (e.g. a new gutter usually also needs downpipes and brackets; a roof
  replacement often involves onderdak or isolatie).
- A word looks like a transcription error or does not parse as a real material
  or quantity.
Each question must be short, specific, in Dutch, and answerable out loud by a
contractor standing on a roof. Return an empty array if nothing is unclear.`;
}

async function requestExtraction(prompt: string): Promise<ExtractionResult> {
  const response = await getAnthropic().messages.create({
    model: extractionModel(),
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new ExtractionError('Onverwacht antwoordformaat van het model');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(block.text));
  } catch (error) {
    throw new ExtractionError('Model gaf geen geldige JSON terug', { cause: error });
  }

  const result = ExtractionResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new ExtractionError('Model-antwoord voldoet niet aan het schema', {
      cause: result.error,
    });
  }
  return result.data;
}

export async function extractQuoteTasks(
  transcript: string,
  catalog: CatalogItem[],
): Promise<ExtractionResult> {
  const prompt = buildExtractionPrompt(transcript, catalog);

  try {
    return await requestExtraction(prompt);
  } catch (firstError) {
    if (!(firstError instanceof ExtractionError)) {
      throw new ExtractionError('Extractie mislukt', { cause: firstError });
    }
    // One retry: LLM output is non-deterministic, so a malformed reply is
    // often transient. A second failure is surfaced to the caller.
    try {
      return await requestExtraction(prompt);
    } catch (secondError) {
      throw new ExtractionError('Extractie mislukt na opnieuw proberen', {
        cause: secondError,
      });
    }
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test src/lib/ai`
Expected: PASS, all extraction and transcription tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ai
git commit -m "feat: add Claude extraction with catalog matching and clarifications"
```

---

### Task 11: POST /api/quotes/generate

Wires the whole pipeline together: upload → transcribe → extract → expand → persist, logging every step.

**Files:**
- Create: `src/lib/quotes/generate.ts`
- Create: `src/app/api/quotes/generate/route.ts`
- Test: `src/lib/quotes/__tests__/generate.test.ts`

**Interfaces:**
- Consumes: `transcribeAudio`, `extractQuoteTasks`, `expandTasksToLineItems`, `logPipelineEvent`, `requireContractor`
- Produces:
  - `generateQuote(deps: GenerateDeps, args: { audio: File; contractorId: string }): Promise<{ quoteId: string }>`
  - `type GenerateDeps` — injected collaborators, so the flow is testable without network or database
  - Route contract: `POST /api/quotes/generate`, body `multipart/form-data` with an `audio` field. `201 {quoteId}` on success; `400 {error}` when audio is missing; `409 {error}` when the catalog is empty; `401` when unauthenticated; `500 {error, quoteId}` when extraction failed but a draft was still created.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/quotes/__tests__/generate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateQuote, EmptyCatalogError } from '@/lib/quotes/generate';
import { ExtractionError } from '@/lib/ai/extract';
import type { CatalogItem } from '@/lib/supabase/types';

const catalog: CatalogItem[] = [
  {
    id: 'cat-1',
    contractor_id: 'c1',
    name: 'Dakpannen leggen',
    unit: 'm²',
    materials_price_cents: 3000,
    labor_price_cents: 1500,
    vat_rate: 0.06,
    created_at: '2026-08-06T00:00:00Z',
  },
];

function makeDeps(overrides = {}) {
  return {
    loadCatalog: vi.fn().mockResolvedValue(catalog),
    uploadAudio: vi.fn().mockResolvedValue('c1/quote-1.webm'),
    createDraftQuote: vi.fn().mockResolvedValue('quote-1'),
    transcribe: vi.fn().mockResolvedValue('tachtig vierkante meter dakpannen'),
    extract: vi.fn().mockResolvedValue({
      tasks: [{ catalogItemId: 'cat-1', description: 'Dakpannen', quantity: 80, unit: 'm²' }],
      clarifications: [{ questionNl: 'Welk type dakpannen?' }],
    }),
    saveTranscript: vi.fn().mockResolvedValue(undefined),
    saveLineItems: vi.fn().mockResolvedValue(undefined),
    saveClarifications: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const audio = () => new File([new Uint8Array([1])], 'opname.webm', { type: 'audio/webm' });

beforeEach(() => vi.clearAllMocks());

describe('generateQuote', () => {
  it('returns the new quote id', async () => {
    const deps = makeDeps();
    const result = await generateQuote(deps, { audio: audio(), contractorId: 'c1' });
    expect(result.quoteId).toBe('quote-1');
  });

  it('expands each matched task into a materials row and a labor row', async () => {
    const deps = makeDeps();
    await generateQuote(deps, { audio: audio(), contractorId: 'c1' });

    const rows = deps.saveLineItems.mock.calls[0][1];
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { line_type: string }) => r.line_type)).toEqual(['materials', 'labor']);
  });

  it('persists the transcript and the clarifications', async () => {
    const deps = makeDeps();
    await generateQuote(deps, { audio: audio(), contractorId: 'c1' });

    expect(deps.saveTranscript).toHaveBeenCalledWith('quote-1', 'tachtig vierkante meter dakpannen');
    expect(deps.saveClarifications).toHaveBeenCalledWith('quote-1', [
      { questionNl: 'Welk type dakpannen?' },
    ]);
  });

  it('refuses to start when the catalog is empty', async () => {
    const deps = makeDeps({ loadCatalog: vi.fn().mockResolvedValue([]) });
    await expect(
      generateQuote(deps, { audio: audio(), contractorId: 'c1' }),
    ).rejects.toBeInstanceOf(EmptyCatalogError);
    expect(deps.createDraftQuote).not.toHaveBeenCalled();
  });

  it('logs a success event for each pipeline step', async () => {
    const deps = makeDeps();
    await generateQuote(deps, { audio: audio(), contractorId: 'c1' });

    const steps = deps.log.mock.calls.map((call: [{ step: string }]) => call[0].step);
    expect(steps).toContain('upload');
    expect(steps).toContain('transcribe');
    expect(steps).toContain('extract');
  });

  it('logs an error event and rethrows when transcription fails', async () => {
    const deps = makeDeps({ transcribe: vi.fn().mockRejectedValue(new Error('whisper down')) });
    await expect(generateQuote(deps, { audio: audio(), contractorId: 'c1' })).rejects.toThrow();

    const errorLogs = deps.log.mock.calls
      .map((call: [{ step: string; status: string }]) => call[0])
      .filter((event: { status: string }) => event.status === 'error');
    expect(errorLogs.some((e: { step: string }) => e.step === 'transcribe')).toBe(true);
  });

  it('keeps the draft quote when extraction fails, so the contractor can fill it in manually', async () => {
    const deps = makeDeps({
      extract: vi.fn().mockRejectedValue(new ExtractionError('kapot')),
    });

    await expect(
      generateQuote(deps, { audio: audio(), contractorId: 'c1' }),
    ).rejects.toMatchObject({ quoteId: 'quote-1' });

    // Transcript is still saved — it is the contractor's record of what they said.
    expect(deps.saveTranscript).toHaveBeenCalledWith('quote-1', 'tachtig vierkante meter dakpannen');
    expect(deps.saveLineItems).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/quotes/__tests__/generate.test.ts`
Expected: FAIL — cannot resolve `@/lib/quotes/generate`.

- [ ] **Step 3: Write the orchestration module**

Create `src/lib/quotes/generate.ts`:

```ts
import { expandTasksToLineItems, type NewLineItem } from '@/lib/quotes/expand';
import type { ExtractionResult } from '@/lib/ai/schemas';
import type { CatalogItem, PipelineStep } from '@/lib/supabase/types';

export class EmptyCatalogError extends Error {
  constructor() {
    super('Voeg eerst minstens één item toe aan je prijslijst.');
    this.name = 'EmptyCatalogError';
  }
}

/** Thrown when a draft exists but extraction failed — the caller needs the id. */
export class PartialQuoteError extends Error {
  quoteId: string;
  constructor(message: string, quoteId: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PartialQuoteError';
    this.quoteId = quoteId;
  }
}

export type GenerateDeps = {
  loadCatalog: (contractorId: string) => Promise<CatalogItem[]>;
  uploadAudio: (contractorId: string, audio: File) => Promise<string>;
  createDraftQuote: (contractorId: string, audioPath: string) => Promise<string>;
  transcribe: (audio: File) => Promise<string>;
  extract: (transcript: string, catalog: CatalogItem[]) => Promise<ExtractionResult>;
  saveTranscript: (quoteId: string, transcript: string) => Promise<void>;
  saveLineItems: (quoteId: string, rows: NewLineItem[]) => Promise<void>;
  saveClarifications: (quoteId: string, items: { questionNl: string }[]) => Promise<void>;
  log: (event: {
    quoteId: string | null;
    contractorId: string;
    step: PipelineStep;
    status: 'success' | 'error';
    detail?: Record<string, unknown>;
  }) => Promise<void>;
};

export async function generateQuote(
  deps: GenerateDeps,
  args: { audio: File; contractorId: string },
): Promise<{ quoteId: string }> {
  const { contractorId, audio } = args;

  const catalog = await deps.loadCatalog(contractorId);
  if (catalog.length === 0) throw new EmptyCatalogError();

  // --- upload -------------------------------------------------------------
  let audioPath: string;
  try {
    audioPath = await deps.uploadAudio(contractorId, audio);
    await deps.log({ quoteId: null, contractorId, step: 'upload', status: 'success', detail: { audioPath } });
  } catch (error) {
    await deps.log({ quoteId: null, contractorId, step: 'upload', status: 'error', detail: { error: String(error) } });
    throw error;
  }

  const quoteId = await deps.createDraftQuote(contractorId, audioPath);

  // --- transcribe ---------------------------------------------------------
  let transcript: string;
  try {
    transcript = await deps.transcribe(audio);
    await deps.log({
      quoteId, contractorId, step: 'transcribe', status: 'success',
      detail: { transcriptLength: transcript.length, transcript },
    });
  } catch (error) {
    await deps.log({ quoteId, contractorId, step: 'transcribe', status: 'error', detail: { error: String(error) } });
    throw error;
  }

  await deps.saveTranscript(quoteId, transcript);

  // --- extract ------------------------------------------------------------
  let extraction: ExtractionResult;
  try {
    extraction = await deps.extract(transcript, catalog);
    await deps.log({
      quoteId, contractorId, step: 'extract', status: 'success',
      detail: { taskCount: extraction.tasks.length, clarificationCount: extraction.clarifications.length },
    });
  } catch (error) {
    await deps.log({ quoteId, contractorId, step: 'extract', status: 'error', detail: { error: String(error) } });
    // The draft survives: the contractor can still build the quote by hand
    // rather than losing the recording they just made.
    throw new PartialQuoteError('Automatische verwerking mislukt', quoteId, { cause: error });
  }

  await deps.saveLineItems(quoteId, expandTasksToLineItems(extraction.tasks, catalog));
  await deps.saveClarifications(quoteId, extraction.clarifications);

  return { quoteId };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/lib/quotes`
Expected: PASS, all expand and generate tests.

- [ ] **Step 5: Write the route handler**

Create `src/app/api/quotes/generate/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { transcribeAudio } from '@/lib/ai/transcribe';
import { extractQuoteTasks } from '@/lib/ai/extract';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import { generateQuote, EmptyCatalogError, PartialQuoteError, type GenerateDeps } from '@/lib/quotes/generate';
import type { CatalogItem } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
  let contractorId: string;
  let supabase: Awaited<ReturnType<typeof requireContractor>>['supabase'];

  try {
    const auth = await requireContractor();
    contractorId = auth.contractor.id;
    supabase = auth.supabase;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    }
    throw error;
  }

  const form = await request.formData();
  const audio = form.get('audio');
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: 'Geen audio ontvangen' }, { status: 400 });
  }

  const deps: GenerateDeps = {
    loadCatalog: async () => {
      const { data } = await supabase.from('catalog_items').select('*');
      return (data ?? []) as CatalogItem[];
    },
    uploadAudio: async (id, file) => {
      const path = `${id}/${crypto.randomUUID()}.webm`;
      const { error } = await supabase.storage.from('quote-audio').upload(path, file);
      if (error) throw new Error(`Upload mislukt: ${error.message}`);
      return path;
    },
    createDraftQuote: async (id, audioPath) => {
      const { data, error } = await supabase
        .from('quotes')
        .insert({ contractor_id: id, audio_path: audioPath, status: 'draft' })
        .select('id')
        .single();
      if (error || !data) throw new Error('Aanmaken van offerte mislukt');
      return data.id as string;
    },
    transcribe: transcribeAudio,
    extract: extractQuoteTasks,
    saveTranscript: async (quoteId, transcript) => {
      await supabase.from('quotes').update({ transcript }).eq('id', quoteId);
    },
    saveLineItems: async (quoteId, rows) => {
      if (rows.length === 0) return;
      const { error } = await supabase
        .from('quote_line_items')
        .insert(rows.map((row) => ({ ...row, quote_id: quoteId })));
      if (error) throw new Error('Opslaan van offertelijnen mislukt');
    },
    saveClarifications: async (quoteId, items) => {
      if (items.length === 0) return;
      const { error } = await supabase
        .from('quote_clarifications')
        .insert(items.map((item) => ({ quote_id: quoteId, question_nl: item.questionNl })));
      if (error) throw new Error('Opslaan van vragen mislukt');
    },
    log: logPipelineEvent,
  };

  try {
    const { quoteId } = await generateQuote(deps, { audio, contractorId });
    return NextResponse.json({ quoteId }, { status: 201 });
  } catch (error) {
    if (error instanceof EmptyCatalogError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof PartialQuoteError) {
      return NextResponse.json(
        {
          error: 'Automatische verwerking mislukt. Je kan de offertelijnen handmatig toevoegen.',
          quoteId: error.quoteId,
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: 'Er ging iets mis bij het verwerken van je opname. Probeer opnieuw.' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/lib/quotes src/app/api/quotes/generate
git commit -m "feat: add quote generation pipeline route"
```

---

### Task 12: VoiceRecorder component

Reused by both the initial recording and the clarification answers, so it is built once as a standalone component.

**Files:**
- Create: `src/components/VoiceRecorder.tsx`
- Test: `src/components/__tests__/VoiceRecorder.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `<VoiceRecorder onRecorded={(audio: Blob) => void} label?: string disabled?: boolean />` — renders a record/stop button, requests mic permission on first record, and shows a Dutch error when permission is denied.

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/VoiceRecorder.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoiceRecorder from '@/components/VoiceRecorder';

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = 'inactive';

  constructor(public stream: MediaStream) {
    MockMediaRecorder.instances.push(this);
  }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

function mockMicPermission(granted: boolean) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: granted
        ? vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
        : vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
    },
  });
}

beforeEach(() => {
  MockMediaRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);
});

describe('VoiceRecorder', () => {
  it('renders a record button with the given label', () => {
    mockMicPermission(true);
    render(<VoiceRecorder onRecorded={vi.fn()} label="Beschrijf de klus" />);
    expect(screen.getByRole('button', { name: /beschrijf de klus/i })).toBeInTheDocument();
  });

  it('starts recording and shows a stop button', async () => {
    mockMicPermission(true);
    render(<VoiceRecorder onRecorded={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /stoppen/i })).toBeInTheDocument());
  });

  it('calls onRecorded with the audio blob when stopped', async () => {
    mockMicPermission(true);
    const onRecorded = vi.fn();
    render(<VoiceRecorder onRecorded={onRecorded} />);

    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));
    await waitFor(() => expect(MockMediaRecorder.instances).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: /stoppen/i }));

    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    expect(onRecorded.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it('shows a Dutch error when mic permission is denied', async () => {
    mockMicPermission(false);
    render(<VoiceRecorder onRecorded={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/microfoon/i),
    );
  });

  it('does not start recording when disabled', async () => {
    mockMicPermission(true);
    render(<VoiceRecorder onRecorded={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: /opnemen/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/components`
Expected: FAIL — cannot resolve `@/components/VoiceRecorder`.

- [ ] **Step 3: Write the component**

Create `src/components/VoiceRecorder.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';

type Props = {
  onRecorded: (audio: Blob) => void;
  label?: string;
  disabled?: boolean;
};

export default function VoiceRecorder({ onRecorded, label = 'Opnemen', disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        onRecorded(new Blob(chunksRef.current, { type: 'audio/webm' }));
        setRecording(false);
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError(
        'Geen toegang tot de microfoon. Sta microfoontoegang toe in je browser, of vul de offerte handmatig in.',
      );
      setRecording(false);
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled}
        aria-label={recording ? 'Stoppen' : label}
        className={`rounded p-4 text-lg text-white disabled:opacity-50 ${
          recording ? 'bg-red-600' : 'bg-black'
        }`}
      >
        {recording ? '■ Stoppen' : `● ${label}`}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

Note: the tests query the record button by the accessible name `/opnemen/i`, which is the default `label`. The test that passes `label="Beschrijf de klus"` queries that name instead.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/components`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/VoiceRecorder.tsx src/components/__tests__/VoiceRecorder.test.tsx
git commit -m "feat: add reusable VoiceRecorder component"
```

---

### Task 13: New-quote recording page

**Files:**
- Create: `src/app/offertes/nieuw/page.tsx`, `src/app/offertes/nieuw/RecordQuote.tsx`
- Test: `src/app/offertes/nieuw/__tests__/RecordQuote.test.tsx`

**Interfaces:**
- Consumes: `<VoiceRecorder />`; `POST /api/quotes/generate`
- Produces: `<RecordQuote hasCatalogItems={boolean} />` — records, uploads, then routes to `/offertes/<id>`. Keeps the recorded blob so a failed upload can be retried without re-recording.

- [ ] **Step 1: Write the failing tests**

Create `src/app/offertes/nieuw/__tests__/RecordQuote.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecordQuote from '@/app/offertes/nieuw/RecordQuote';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

// Drive the upload directly by invoking the recorder's callback.
vi.mock('@/components/VoiceRecorder', () => ({
  default: ({ onRecorded, disabled }: { onRecorded: (b: Blob) => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={() => onRecorded(new Blob(['audio']))}>
      Opnemen
    </button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('RecordQuote', () => {
  it('tells the contractor to set up a price list first when the catalog is empty', () => {
    render(<RecordQuote hasCatalogItems={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/prijslijst/i);
    expect(screen.getByRole('button', { name: /opnemen/i })).toBeDisabled();
  });

  it('navigates to the new quote after a successful upload', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ quoteId: 'quote-9' }),
    });

    render(<RecordQuote hasCatalogItems />);
    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/offertes/quote-9'));
  });

  it('shows the server error message when the upload fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Transcriptie mislukt' }),
    });

    render(<RecordQuote hasCatalogItems />);
    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Transcriptie mislukt'));
  });

  it('offers a retry that reuses the recording instead of forcing a new one', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Transcriptie mislukt' }),
    });

    render(<RecordQuote hasCatalogItems />);
    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /opnieuw proberen/i })).toBeInTheDocument());

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ quoteId: 'quote-10' }),
    });
    await userEvent.click(screen.getByRole('button', { name: /opnieuw proberen/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/offertes/quote-10'));
  });

  it('still navigates to the draft when extraction failed but a quote id came back', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Automatische verwerking mislukt', quoteId: 'quote-11' }),
    });

    render(<RecordQuote hasCatalogItems />);
    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/offertes/quote-11'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/app/offertes`
Expected: FAIL — cannot resolve `@/app/offertes/nieuw/RecordQuote`.

- [ ] **Step 3: Write the client component**

Create `src/app/offertes/nieuw/RecordQuote.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import VoiceRecorder from '@/components/VoiceRecorder';

export default function RecordQuote({ hasCatalogItems }: { hasCatalogItems: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastRecording, setLastRecording] = useState<Blob | null>(null);

  async function upload(audio: Blob) {
    setStatus('uploading');
    setError(null);

    const form = new FormData();
    form.append('audio', audio, 'opname.webm');

    try {
      const response = await fetch('/api/quotes/generate', { method: 'POST', body: form });
      const body = await response.json();

      if (response.ok) {
        router.push(`/offertes/${body.quoteId}`);
        return;
      }
      // Extraction failed but a draft exists — send them to it rather than
      // throwing away the recording they just made.
      if (body.quoteId) {
        router.push(`/offertes/${body.quoteId}`);
        return;
      }
      setError(body.error ?? 'Er ging iets mis. Probeer opnieuw.');
      setStatus('error');
    } catch {
      setError('Geen verbinding. Controleer je internetverbinding en probeer opnieuw.');
      setStatus('error');
    }
  }

  function onRecorded(audio: Blob) {
    setLastRecording(audio);
    void upload(audio);
  }

  return (
    <div className="flex flex-col gap-4">
      {!hasCatalogItems && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          Stel eerst je prijslijst in bij Instellingen. Zonder prijzen kan er geen offerte gemaakt worden.
        </p>
      )}

      <VoiceRecorder
        onRecorded={onRecorded}
        label="Beschrijf de klus"
        disabled={!hasCatalogItems || status === 'uploading'}
      />

      {status === 'uploading' && <p className="text-sm text-gray-600">Bezig met verwerken…</p>}

      {status === 'error' && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-red-600">{error}</p>
          {lastRecording && (
            <button
              type="button"
              onClick={() => void upload(lastRecording)}
              className="rounded border p-3"
            >
              Opnieuw proberen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/app/offertes/nieuw/page.tsx`:

```tsx
import { requireContractor } from '@/lib/auth/require-contractor';
import RecordQuote from './RecordQuote';

export default async function NewQuotePage() {
  const { supabase } = await requireContractor();
  const { count } = await supabase
    .from('catalog_items')
    .select('id', { count: 'exact', head: true });

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Nieuwe offerte</h1>
      <p className="mb-6 text-sm text-gray-600">
        Beschrijf de klus hardop: wat moet er gebeuren, met welke materialen en hoeveel.
      </p>
      <RecordQuote hasCatalogItems={(count ?? 0) > 0} />
    </main>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test src/app/offertes`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/offertes/nieuw
git commit -m "feat: add new-quote recording page"
```

---

### Task 14: Line items editor with per-line VAT

**Files:**
- Create: `src/components/LineItemsEditor.tsx`
- Create: `src/app/offertes/[id]/line-item-actions.ts`
- Test: `src/components/__tests__/LineItemsEditor.test.tsx`

**Interfaces:**
- Consumes: `QuoteLineItem`, `VatRate`; `calculateTotals`, `formatEuros`
- Produces:
  - `<LineItemsEditor items={QuoteLineItem[]} onChange={(items: QuoteLineItem[]) => void} readOnly?: boolean />`
  - Server actions `updateLineItem(id, patch)`, `addLineItem(quoteId, lineType)`, `removeLineItem(id)`
  - `toTotalsInput(items: QuoteLineItem[]): TotalsLineItem[]` — skips rows with a missing price or VAT rate

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/LineItemsEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LineItemsEditor, { toTotalsInput } from '@/components/LineItemsEditor';
import type { QuoteLineItem } from '@/lib/supabase/types';

function item(overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'line-1',
    quote_id: 'quote-1',
    catalog_item_id: 'cat-1',
    description: 'Dakpannen leggen – materiaal',
    quantity: 80,
    unit: 'm²',
    unit_price_cents: 3000,
    vat_rate: 0.06,
    line_type: 'materials',
    sort_order: 0,
    created_at: '2026-08-06T00:00:00Z',
    ...overrides,
  };
}

describe('toTotalsInput', () => {
  it('includes fully priced rows', () => {
    expect(toTotalsInput([item()])).toEqual([{ quantity: 80, unitPriceCents: 3000, vatRate: 0.06 }]);
  });

  it('skips rows with no price yet', () => {
    expect(toTotalsInput([item({ unit_price_cents: null })])).toEqual([]);
  });

  it('skips rows with no VAT rate yet', () => {
    expect(toTotalsInput([item({ vat_rate: null })])).toEqual([]);
  });
});

describe('LineItemsEditor', () => {
  it('renders each line item', () => {
    render(<LineItemsEditor items={[item()]} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('Dakpannen leggen – materiaal')).toBeInTheDocument();
  });

  it('shows the running total', () => {
    render(<LineItemsEditor items={[item()]} onChange={vi.fn()} />);
    // 80 * 3000 = 240000 cents; VAT 6% = 14400; total 254400
    expect(screen.getByTestId('grand-total')).toHaveTextContent('2.544,00');
  });

  it('shows a separate subtotal per VAT rate', () => {
    render(
      <LineItemsEditor
        items={[item(), item({ id: 'line-2', vat_rate: 0.21, unit_price_cents: 1000, quantity: 1 })]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('vat-group-0.06')).toBeInTheDocument();
    expect(screen.getByTestId('vat-group-0.21')).toBeInTheDocument();
  });

  it('reports a changed quantity', async () => {
    const onChange = vi.fn();
    render(<LineItemsEditor items={[item()]} onChange={onChange} />);

    const input = screen.getByLabelText(/aantal/i);
    await userEvent.clear(input);
    await userEvent.type(input, '90');

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0];
    expect(last[0].quantity).toBe(90);
  });

  it('reports a changed VAT rate', async () => {
    const onChange = vi.fn();
    render(<LineItemsEditor items={[item()]} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText(/btw/i), '0.21');

    const last = onChange.mock.calls.at(-1)![0];
    expect(last[0].vat_rate).toBe(0.21);
  });

  it('flags a row that still needs a price or VAT rate', () => {
    render(<LineItemsEditor items={[item({ unit_price_cents: null, vat_rate: null })]} onChange={vi.fn()} />);
    expect(screen.getByText(/vul prijs en btw-tarief aan/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/components/__tests__/LineItemsEditor.test.tsx`
Expected: FAIL — cannot resolve `@/components/LineItemsEditor`.

- [ ] **Step 3: Write the component**

Create `src/components/LineItemsEditor.tsx`:

```tsx
'use client';

import type { QuoteLineItem, VatRate } from '@/lib/supabase/types';
import { calculateTotals, formatEuros, type TotalsLineItem } from '@/lib/money/totals';

export function toTotalsInput(items: QuoteLineItem[]): TotalsLineItem[] {
  return items
    .filter((item) => item.unit_price_cents !== null && item.vat_rate !== null)
    .map((item) => ({
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents as number,
      vatRate: item.vat_rate as VatRate,
    }));
}

type Props = {
  items: QuoteLineItem[];
  onChange: (items: QuoteLineItem[]) => void;
  readOnly?: boolean;
};

export default function LineItemsEditor({ items, onChange, readOnly }: Props) {
  const totals = calculateTotals(toTotalsInput(items));

  function patch(id: string, changes: Partial<QuoteLineItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const incomplete = item.unit_price_cents === null || item.vat_rate === null;
          return (
            <li key={item.id} className={`rounded border p-3 ${incomplete ? 'border-amber-400 bg-amber-50' : ''}`}>
              <input
                aria-label="Omschrijving"
                value={item.description}
                disabled={readOnly}
                onChange={(e) => patch(item.id, { description: e.target.value })}
                className="mb-2 w-full rounded border p-2"
              />

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs">
                  Aantal
                  <input
                    aria-label={`Aantal voor ${item.description}`}
                    type="number"
                    step="any"
                    value={item.quantity}
                    disabled={readOnly}
                    onChange={(e) => patch(item.id, { quantity: Number(e.target.value) })}
                    className="rounded border p-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  Eenheid
                  <input
                    aria-label={`Eenheid voor ${item.description}`}
                    value={item.unit}
                    disabled={readOnly}
                    onChange={(e) => patch(item.id, { unit: e.target.value })}
                    className="rounded border p-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  Prijs per eenheid (€)
                  <input
                    aria-label={`Prijs voor ${item.description}`}
                    type="number"
                    step="0.01"
                    value={item.unit_price_cents === null ? '' : item.unit_price_cents / 100}
                    disabled={readOnly}
                    onChange={(e) =>
                      patch(item.id, {
                        unit_price_cents:
                          e.target.value === '' ? null : Math.round(Number(e.target.value) * 100),
                      })
                    }
                    className="rounded border p-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  Btw
                  <select
                    aria-label={`Btw-tarief voor ${item.description}`}
                    value={item.vat_rate ?? ''}
                    disabled={readOnly}
                    onChange={(e) =>
                      patch(item.id, {
                        vat_rate: e.target.value === '' ? null : (Number(e.target.value) as VatRate),
                      })
                    }
                    className="rounded border p-2"
                  >
                    <option value="">Kies…</option>
                    <option value="0.06">6%</option>
                    <option value="0.21">21%</option>
                  </select>
                </label>
              </div>

              {incomplete && (
                <p className="mt-2 text-xs text-amber-800">
                  Vul prijs en btw-tarief aan voordat je de offerte afwerkt.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="rounded border p-4">
        {totals.vatGroups.map((group) => (
          <div key={group.vatRate} data-testid={`vat-group-${group.vatRate}`} className="flex justify-between text-sm">
            <span>
              Subtotaal {group.vatRate === 0.06 ? '6%' : '21%'} btw
            </span>
            <span>
              {formatEuros(group.subtotalCents)} + {formatEuros(group.vatAmountCents)} btw
            </span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t pt-2 font-bold">
          <span>Totaal incl. btw</span>
          <span data-testid="grand-total">{formatEuros(totals.grandTotalCents)}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the line-item server actions**

Create `src/app/offertes/[id]/line-item-actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import type { LineType, QuoteLineItem } from '@/lib/supabase/types';

type LineItemPatch = Partial<
  Pick<QuoteLineItem, 'description' | 'quantity' | 'unit' | 'unit_price_cents' | 'vat_rate'>
>;

export async function updateLineItem(id: string, patch: LineItemPatch): Promise<void> {
  const { supabase } = await requireContractor();
  const { error } = await supabase.from('quote_line_items').update(patch).eq('id', id);
  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
}

export async function addLineItem(quoteId: string, lineType: LineType): Promise<void> {
  const { supabase } = await requireContractor();
  const { error } = await supabase.from('quote_line_items').insert({
    quote_id: quoteId,
    description: lineType === 'materials' ? 'Nieuw item – materiaal' : 'Nieuw item – arbeid',
    quantity: 1,
    unit: 'stuk',
    unit_price_cents: null,
    vat_rate: null,
    line_type: lineType,
    sort_order: 999,
  });
  if (error) throw new Error('Toevoegen mislukt. Probeer opnieuw.');
  revalidatePath(`/offertes/${quoteId}`);
}

export async function removeLineItem(id: string): Promise<void> {
  const { supabase } = await requireContractor();
  const { error } = await supabase.from('quote_line_items').delete().eq('id', id);
  if (error) throw new Error('Verwijderen mislukt. Probeer opnieuw.');
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test src/components`
Expected: PASS, all VoiceRecorder and LineItemsEditor tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/LineItemsEditor.tsx src/components/__tests__/LineItemsEditor.test.tsx src/app/offertes/[id]/line-item-actions.ts
git commit -m "feat: add line items editor with per-line VAT and live totals"
```

---

### Task 15: Dutch text-to-speech and the prompt-audio route

**Files:**
- Create: `src/lib/ai/tts.ts`
- Create: `src/app/api/quotes/[id]/clarifications/[cid]/prompt-audio/route.ts`
- Test: `src/lib/ai/__tests__/tts.test.ts`

**Interfaces:**
- Consumes: `getOpenAI`, `requireContractor`, `logPipelineEvent`
- Produces:
  - `class TtsError extends Error`
  - `synthesizeDutchSpeech(text: string): Promise<ArrayBuffer>`
  - Route: `GET /api/quotes/:id/clarifications/:cid/prompt-audio` → `audio/mpeg` bytes, `404` when the clarification does not belong to the caller, `500` on TTS failure. Audio is generated on demand and never stored.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ai/__tests__/tts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@/lib/ai/openai-client', () => ({
  getOpenAI: () => ({ audio: { speech: { create } } }),
}));

import { synthesizeDutchSpeech, TtsError } from '@/lib/ai/tts';

beforeEach(() => create.mockReset());

describe('synthesizeDutchSpeech', () => {
  it('returns the audio bytes', async () => {
    const bytes = new ArrayBuffer(8);
    create.mockResolvedValue({ arrayBuffer: async () => bytes });
    await expect(synthesizeDutchSpeech('Welk type dakpannen?')).resolves.toBe(bytes);
  });

  it('sends the text to the configured model and voice', async () => {
    create.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(1) });
    await synthesizeDutchSpeech('Welk type dakpannen?');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ input: 'Welk type dakpannen?' }),
    );
  });

  it('rejects empty text rather than calling the API', async () => {
    await expect(synthesizeDutchSpeech('   ')).rejects.toBeInstanceOf(TtsError);
    expect(create).not.toHaveBeenCalled();
  });

  it('throws TtsError when the API fails', async () => {
    create.mockRejectedValue(new Error('quota'));
    await expect(synthesizeDutchSpeech('iets')).rejects.toBeInstanceOf(TtsError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/ai/__tests__/tts.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/tts`.

- [ ] **Step 3: Write the TTS adapter**

Create `src/lib/ai/tts.ts`:

```ts
import { getOpenAI } from '@/lib/ai/openai-client';

export class TtsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TtsError';
  }
}

export async function synthesizeDutchSpeech(text: string): Promise<ArrayBuffer> {
  const input = text.trim();
  if (!input) throw new TtsError('Geen tekst om uit te spreken');

  try {
    const response = await getOpenAI().audio.speech.create({
      model: process.env.TTS_MODEL ?? 'gpt-4o-mini-tts',
      voice: process.env.TTS_VOICE ?? 'alloy',
      input,
    });
    return await response.arrayBuffer();
  } catch (error) {
    throw new TtsError('Spraakgeneratie mislukt', { cause: error });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/lib/ai`
Expected: PASS, all AI adapter tests.

- [ ] **Step 5: Write the prompt-audio route**

Create `src/app/api/quotes/[id]/clarifications/[cid]/prompt-audio/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { synthesizeDutchSpeech } from '@/lib/ai/tts';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  const { id, cid } = await params;

  let contractorId: string;
  let supabase: Awaited<ReturnType<typeof requireContractor>>['supabase'];
  try {
    const auth = await requireContractor();
    contractorId = auth.contractor.id;
    supabase = auth.supabase;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    }
    throw error;
  }

  // RLS already scopes this to the caller; the quote_id filter guards against
  // a clarification id from a different quote being passed in.
  const { data: clarification } = await supabase
    .from('quote_clarifications')
    .select('question_nl')
    .eq('id', cid)
    .eq('quote_id', id)
    .single();

  if (!clarification) {
    return NextResponse.json({ error: 'Vraag niet gevonden' }, { status: 404 });
  }

  try {
    const audio = await synthesizeDutchSpeech(clarification.question_nl);
    await logPipelineEvent({
      quoteId: id, contractorId, step: 'tts_generate', status: 'success',
      detail: { clarificationId: cid },
    });

    return new NextResponse(audio, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    await logPipelineEvent({
      quoteId: id, contractorId, step: 'tts_generate', status: 'error',
      detail: { clarificationId: cid, error: String(error) },
    });
    return NextResponse.json({ error: 'Spraakgeneratie mislukt' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/tts.ts src/lib/ai/__tests__/tts.test.ts "src/app/api/quotes/[id]"
git commit -m "feat: add Dutch text-to-speech and clarification prompt-audio route"
```

---

### Task 16: Clarification answers with retry cap

**Files:**
- Create: `src/lib/clarifications/retry.ts`
- Create: `src/lib/ai/clarify.ts`
- Create: `src/app/api/quotes/[id]/clarifications/[cid]/answer/route.ts`
- Test: `src/lib/clarifications/__tests__/retry.test.ts`, `src/lib/ai/__tests__/clarify.test.ts`

**Interfaces:**
- Consumes: `transcribeAudio`, `getAnthropic`, `extractionModel`, `stripCodeFence`, `QuoteLineItem`, `CatalogItem`
- Produces:
  - `MAX_CLARIFICATION_RETRIES = 2`
  - `nextClarificationState(current: { retryCount: number }, resolved: boolean): { status: ClarificationStatus; retryCount: number; shouldRephrase: boolean }`
  - `ClarificationAnswerSchema` and `type ClarificationAnswer = { resolved: boolean; rephrasedQuestionNl: string | null; newTasks: ExtractedTask[]; updatedLineItems: { id: string; quantity?: number; unitPriceCents?: number | null }[] }`
  - `processClarificationAnswer(args: {...}): Promise<ClarificationAnswer>`
  - Route: `POST /api/quotes/:id/clarifications/:cid/answer`, `multipart/form-data` with `audio`. Returns `200 { resolved, question, retryCount, answerTranscript }`.

- [ ] **Step 1: Write the failing retry tests**

Create `src/lib/clarifications/__tests__/retry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextClarificationState, MAX_CLARIFICATION_RETRIES } from '@/lib/clarifications/retry';

describe('nextClarificationState', () => {
  it('resolves the clarification when the answer addressed it', () => {
    expect(nextClarificationState({ retryCount: 0 }, true)).toEqual({
      status: 'resolved',
      retryCount: 0,
      shouldRephrase: false,
    });
  });

  it('resolves even on the last allowed attempt', () => {
    expect(nextClarificationState({ retryCount: MAX_CLARIFICATION_RETRIES }, true).status).toBe('resolved');
  });

  it('asks a rephrased question on the first unhelpful answer', () => {
    expect(nextClarificationState({ retryCount: 0 }, false)).toEqual({
      status: 'pending',
      retryCount: 1,
      shouldRephrase: true,
    });
  });

  it('asks once more on the second unhelpful answer', () => {
    expect(nextClarificationState({ retryCount: 1 }, false)).toEqual({
      status: 'pending',
      retryCount: 2,
      shouldRephrase: true,
    });
  });

  it('stops rephrasing once the cap is reached, leaving it for manual resolution', () => {
    expect(nextClarificationState({ retryCount: MAX_CLARIFICATION_RETRIES }, false)).toEqual({
      status: 'pending',
      retryCount: MAX_CLARIFICATION_RETRIES,
      shouldRephrase: false,
    });
  });

  it('never exceeds the cap', () => {
    expect(nextClarificationState({ retryCount: 99 }, false).retryCount).toBe(MAX_CLARIFICATION_RETRIES);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/clarifications`
Expected: FAIL — cannot resolve `@/lib/clarifications/retry`.

- [ ] **Step 3: Write the retry logic**

Create `src/lib/clarifications/retry.ts`:

```ts
import type { ClarificationStatus } from '@/lib/supabase/types';

/**
 * A garbled answer on a windy roof must not trap the contractor in a loop.
 * After this many unhelpful answers, the question stays pending and is
 * resolved manually via the on-screen checklist instead.
 */
export const MAX_CLARIFICATION_RETRIES = 2;

export function nextClarificationState(
  current: { retryCount: number },
  resolved: boolean,
): { status: ClarificationStatus; retryCount: number; shouldRephrase: boolean } {
  if (resolved) {
    return { status: 'resolved', retryCount: current.retryCount, shouldRephrase: false };
  }

  const capped = Math.min(current.retryCount, MAX_CLARIFICATION_RETRIES);
  if (capped >= MAX_CLARIFICATION_RETRIES) {
    return { status: 'pending', retryCount: MAX_CLARIFICATION_RETRIES, shouldRephrase: false };
  }

  return { status: 'pending', retryCount: capped + 1, shouldRephrase: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/lib/clarifications`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing clarify tests**

Create `src/lib/ai/__tests__/clarify.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@/lib/ai/anthropic-client', () => ({
  getAnthropic: () => ({ messages: { create } }),
  extractionModel: () => 'test-model',
}));

import { processClarificationAnswer, ClarificationError } from '@/lib/ai/clarify';
import type { CatalogItem } from '@/lib/supabase/types';

const catalog: CatalogItem[] = [
  {
    id: 'cat-1', contractor_id: 'c1', name: 'Dakpannen leggen', unit: 'm²',
    materials_price_cents: 3000, labor_price_cents: 1500, vat_rate: 0.06,
    created_at: '2026-08-06T00:00:00Z',
  },
];

const args = {
  originalTranscript: 'tachtig vierkante meter dakpannen',
  question: 'Welk type dakpannen wil je gebruiken?',
  answerTranscript: 'Kleitegels, tachtig vierkante meter.',
  catalog,
  currentLineItems: [],
};

function reply(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

beforeEach(() => create.mockReset());

describe('processClarificationAnswer', () => {
  it('reports the question as resolved when the answer addressed it', async () => {
    create.mockResolvedValue(
      reply({ resolved: true, rephrasedQuestionNl: null, newTasks: [], updatedLineItems: [] }),
    );
    const result = await processClarificationAnswer(args);
    expect(result.resolved).toBe(true);
  });

  it('returns new tasks the answer introduced', async () => {
    create.mockResolvedValue(
      reply({
        resolved: true,
        rephrasedQuestionNl: null,
        newTasks: [{ catalogItemId: 'cat-1', description: 'Dakpannen', quantity: 80, unit: 'm²' }],
        updatedLineItems: [],
      }),
    );
    const result = await processClarificationAnswer(args);
    expect(result.newTasks).toHaveLength(1);
    expect(result.newTasks[0].quantity).toBe(80);
  });

  it('returns a rephrased question when the answer missed the point', async () => {
    create.mockResolvedValue(
      reply({
        resolved: false,
        rephrasedQuestionNl: 'Zijn het kleipannen of betonpannen?',
        newTasks: [],
        updatedLineItems: [],
      }),
    );
    const result = await processClarificationAnswer({ ...args, answerTranscript: 'euh ja' });
    expect(result.resolved).toBe(false);
    expect(result.rephrasedQuestionNl).toBe('Zijn het kleipannen of betonpannen?');
  });

  it('throws ClarificationError on a malformed response', async () => {
    create.mockResolvedValue({ content: [{ type: 'text', text: 'geen JSON' }] });
    await expect(processClarificationAnswer(args)).rejects.toBeInstanceOf(ClarificationError);
  });

  it('throws ClarificationError when the API fails', async () => {
    create.mockRejectedValue(new Error('overloaded'));
    await expect(processClarificationAnswer(args)).rejects.toBeInstanceOf(ClarificationError);
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test src/lib/ai/__tests__/clarify.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/clarify`.

- [ ] **Step 7: Write the clarify module**

Create `src/lib/ai/clarify.ts`:

```ts
import { z } from 'zod';
import { getAnthropic, extractionModel } from '@/lib/ai/anthropic-client';
import { ExtractedTaskSchema, stripCodeFence } from '@/lib/ai/schemas';
import type { CatalogItem, QuoteLineItem } from '@/lib/supabase/types';

export class ClarificationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ClarificationError';
  }
}

export const ClarificationAnswerSchema = z.object({
  resolved: z.boolean(),
  rephrasedQuestionNl: z.string().nullable(),
  newTasks: z.array(ExtractedTaskSchema),
  updatedLineItems: z.array(
    z.object({
      id: z.string(),
      quantity: z.number().positive().optional(),
      unitPriceCents: z.number().int().nonnegative().nullable().optional(),
    }),
  ),
});

export type ClarificationAnswer = z.infer<typeof ClarificationAnswerSchema>;

export function buildClarificationPrompt(args: {
  originalTranscript: string;
  question: string;
  answerTranscript: string;
  catalog: CatalogItem[];
  currentLineItems: Pick<QuoteLineItem, 'id' | 'description' | 'quantity' | 'unit'>[];
}): string {
  const catalogLines = args.catalog
    .map((item) => `- id: ${item.id} | name: ${item.name} | unit: ${item.unit}`)
    .join('\n');
  const lineItemLines = args.currentLineItems
    .map((item) => `- id: ${item.id} | ${item.description} | ${item.quantity} ${item.unit}`)
    .join('\n');

  return `A Flemish roofworker was asked a clarifying question about their quote and
answered out loud. Decide whether the answer actually addresses the question.

Original job description (Dutch):
"""
${args.originalTranscript}
"""

Question asked (Dutch): ${args.question}

Their spoken answer (Dutch):
"""
${args.answerTranscript}
"""

Catalog:
${catalogLines || '(empty)'}

Current line items:
${lineItemLines || '(none)'}

Return ONLY a JSON object with this exact shape:
{
  "resolved": <true if the answer addresses the question, false otherwise>,
  "rephrasedQuestionNl": "<if not resolved, a shorter/clearer Dutch rephrasing; otherwise null>",
  "newTasks": [
    { "catalogItemId": "<catalog id or null>", "description": "<Dutch>",
      "quantity": <positive number>, "unit": "<unit>" }
  ],
  "updatedLineItems": [
    { "id": "<existing line item id>", "quantity": <number>, "unitPriceCents": <integer or null> }
  ]
}

Rules:
- Never invent prices. Only reference catalog ids listed above.
- An answer like "euh", "weet ik niet", or silence is NOT resolved.
- If the answer resolves the question but adds no work, return empty arrays.
- Only include a line item in updatedLineItems if the answer actually changes it.`;
}

export async function processClarificationAnswer(args: {
  originalTranscript: string;
  question: string;
  answerTranscript: string;
  catalog: CatalogItem[];
  currentLineItems: Pick<QuoteLineItem, 'id' | 'description' | 'quantity' | 'unit'>[];
}): Promise<ClarificationAnswer> {
  let response;
  try {
    response = await getAnthropic().messages.create({
      model: extractionModel(),
      max_tokens: 1500,
      messages: [{ role: 'user', content: buildClarificationPrompt(args) }],
    });
  } catch (error) {
    throw new ClarificationError('Verwerken van antwoord mislukt', { cause: error });
  }

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new ClarificationError('Onverwacht antwoordformaat van het model');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(block.text));
  } catch (error) {
    throw new ClarificationError('Model gaf geen geldige JSON terug', { cause: error });
  }

  const result = ClarificationAnswerSchema.safeParse(parsed);
  if (!result.success) {
    throw new ClarificationError('Model-antwoord voldoet niet aan het schema', { cause: result.error });
  }
  return result.data;
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test src/lib/ai src/lib/clarifications`
Expected: PASS.

- [ ] **Step 9: Write the answer route**

Create `src/app/api/quotes/[id]/clarifications/[cid]/answer/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { transcribeAudio } from '@/lib/ai/transcribe';
import { processClarificationAnswer } from '@/lib/ai/clarify';
import { expandTasksToLineItems } from '@/lib/quotes/expand';
import { nextClarificationState } from '@/lib/clarifications/retry';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import type { CatalogItem, QuoteLineItem } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  const { id, cid } = await params;

  let contractorId: string;
  let supabase: Awaited<ReturnType<typeof requireContractor>>['supabase'];
  try {
    const auth = await requireContractor();
    contractorId = auth.contractor.id;
    supabase = auth.supabase;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    }
    throw error;
  }

  const form = await request.formData();
  const audio = form.get('audio');
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: 'Geen audio ontvangen' }, { status: 400 });
  }

  const [{ data: clarification }, { data: quote }, { data: catalog }, { data: lineItems }] =
    await Promise.all([
      supabase.from('quote_clarifications').select('*').eq('id', cid).eq('quote_id', id).single(),
      supabase.from('quotes').select('transcript,status').eq('id', id).single(),
      supabase.from('catalog_items').select('*'),
      supabase.from('quote_line_items').select('*').eq('quote_id', id),
    ]);

  if (!clarification || !quote) {
    return NextResponse.json({ error: 'Vraag niet gevonden' }, { status: 404 });
  }
  if (quote.status === 'final') {
    return NextResponse.json({ error: 'Deze offerte is al afgewerkt' }, { status: 409 });
  }

  try {
    const answerTranscript = await transcribeAudio(audio);

    const outcome = await processClarificationAnswer({
      originalTranscript: quote.transcript ?? '',
      question: clarification.question_nl,
      answerTranscript,
      catalog: (catalog ?? []) as CatalogItem[],
      currentLineItems: (lineItems ?? []) as QuoteLineItem[],
    });

    const state = nextClarificationState(
      { retryCount: clarification.retry_count },
      outcome.resolved,
    );

    // Apply any work the answer introduced.
    if (outcome.newTasks.length > 0) {
      const rows = expandTasksToLineItems(outcome.newTasks, (catalog ?? []) as CatalogItem[]);
      await supabase
        .from('quote_line_items')
        .insert(rows.map((row) => ({ ...row, quote_id: id, sort_order: 900 + row.sort_order })));
    }
    for (const update of outcome.updatedLineItems) {
      const patch: Record<string, unknown> = {};
      if (update.quantity !== undefined) patch.quantity = update.quantity;
      if (update.unitPriceCents !== undefined) patch.unit_price_cents = update.unitPriceCents;
      if (Object.keys(patch).length > 0) {
        await supabase.from('quote_line_items').update(patch).eq('id', update.id).eq('quote_id', id);
      }
    }

    const question =
      state.shouldRephrase && outcome.rephrasedQuestionNl
        ? outcome.rephrasedQuestionNl
        : clarification.question_nl;

    await supabase
      .from('quote_clarifications')
      .update({ status: state.status, retry_count: state.retryCount, question_nl: question })
      .eq('id', cid);

    await logPipelineEvent({
      quoteId: id, contractorId, step: 'clarification_answer', status: 'success',
      detail: {
        clarificationId: cid,
        answerTranscript,
        resolved: outcome.resolved,
        retryCount: state.retryCount,
        newTaskCount: outcome.newTasks.length,
      },
    });

    return NextResponse.json({
      resolved: state.status === 'resolved',
      question,
      retryCount: state.retryCount,
      canRetry: state.shouldRephrase,
      answerTranscript,
    });
  } catch (error) {
    await logPipelineEvent({
      quoteId: id, contractorId, step: 'clarification_answer', status: 'error',
      detail: { clarificationId: cid, error: String(error) },
    });
    return NextResponse.json(
      { error: 'Je antwoord kon niet verwerkt worden. Probeer opnieuw of vul het handmatig aan.' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 10: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/lib/clarifications src/lib/ai/clarify.ts src/lib/ai/__tests__/clarify.test.ts "src/app/api/quotes/[id]"
git commit -m "feat: add clarification answer processing with retry cap"
```

---

### Task 17: Voice clarification panel

Plays each question aloud, records the spoken answer, and moves to the next — with the same list visible as text so it still works when audio is blocked.

**Files:**
- Create: `src/components/ClarificationPanel.tsx`
- Create: `src/app/offertes/[id]/clarification-actions.ts`
- Test: `src/components/__tests__/ClarificationPanel.test.tsx`

**Interfaces:**
- Consumes: `<VoiceRecorder />`, `QuoteClarification`; the prompt-audio and answer routes
- Produces:
  - `<ClarificationPanel quoteId={string} clarifications={QuoteClarification[]} onResolved={() => void} />`
  - Server action `dismissClarification(id: string)`

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/ClarificationPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClarificationPanel from '@/components/ClarificationPanel';
import type { QuoteClarification } from '@/lib/supabase/types';

vi.mock('@/components/VoiceRecorder', () => ({
  default: ({ onRecorded }: { onRecorded: (b: Blob) => void }) => (
    <button onClick={() => onRecorded(new Blob(['antwoord']))}>Antwoord opnemen</button>
  ),
}));

const dismissClarification = vi.fn();
vi.mock('@/app/offertes/[id]/clarification-actions', () => ({
  dismissClarification: (id: string) => dismissClarification(id),
}));

function clarification(overrides: Partial<QuoteClarification> = {}): QuoteClarification {
  return {
    id: 'clar-1',
    quote_id: 'quote-1',
    question_nl: 'Welk type dakpannen wil je gebruiken?',
    status: 'pending',
    retry_count: 0,
    created_at: '2026-08-06T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  // Audio playback is unavailable in jsdom; make it a no-op that resolves.
  vi.stubGlobal('Audio', class { play = vi.fn().mockResolvedValue(undefined); pause = vi.fn(); });
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
});

describe('ClarificationPanel', () => {
  it('shows every pending question as text, so it works without audio', () => {
    render(
      <ClarificationPanel
        quoteId="quote-1"
        clarifications={[clarification(), clarification({ id: 'clar-2', question_nl: 'Hoeveel dakramen?' })]}
        onResolved={vi.fn()}
      />,
    );
    expect(screen.getByText('Welk type dakpannen wil je gebruiken?')).toBeInTheDocument();
    expect(screen.getByText('Hoeveel dakramen?')).toBeInTheDocument();
  });

  it('reports how many questions are still open', () => {
    render(
      <ClarificationPanel
        quoteId="quote-1"
        clarifications={[clarification(), clarification({ id: 'clar-2', status: 'resolved' })]}
        onResolved={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
  });

  it('marks a question resolved after a successful spoken answer', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ resolved: true, question: 'Welk type dakpannen wil je gebruiken?', retryCount: 0 }),
    });
    const onResolved = vi.fn();

    render(<ClarificationPanel quoteId="quote-1" clarifications={[clarification()]} onResolved={onResolved} />);
    await userEvent.click(screen.getByRole('button', { name: /antwoord opnemen/i }));

    await waitFor(() => expect(onResolved).toHaveBeenCalled());
  });

  it('shows the rephrased question when the answer did not resolve it', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        resolved: false,
        question: 'Zijn het kleipannen of betonpannen?',
        retryCount: 1,
        canRetry: true,
      }),
    });

    render(<ClarificationPanel quoteId="quote-1" clarifications={[clarification()]} onResolved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /antwoord opnemen/i }));

    await waitFor(() =>
      expect(screen.getByText('Zijn het kleipannen of betonpannen?')).toBeInTheDocument(),
    );
  });

  it('tells the contractor to answer manually once the retry cap is hit', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ resolved: false, question: 'Welk type?', retryCount: 2, canRetry: false }),
    });

    render(<ClarificationPanel quoteId="quote-1" clarifications={[clarification()]} onResolved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /antwoord opnemen/i }));

    await waitFor(() =>
      expect(screen.getByText(/vul dit handmatig aan/i)).toBeInTheDocument(),
    );
  });

  it('lets the contractor dismiss a question as not applicable', async () => {
    const onResolved = vi.fn();
    render(<ClarificationPanel quoteId="quote-1" clarifications={[clarification()]} onResolved={onResolved} />);

    await userEvent.click(screen.getByRole('button', { name: /niet van toepassing/i }));

    await waitFor(() => expect(dismissClarification).toHaveBeenCalledWith('clar-1'));
  });

  it('says everything is answered when nothing is pending', () => {
    render(
      <ClarificationPanel
        quoteId="quote-1"
        clarifications={[clarification({ status: 'resolved' })]}
        onResolved={vi.fn()}
      />,
    );
    expect(screen.getByText(/alle vragen beantwoord/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/components/__tests__/ClarificationPanel.test.tsx`
Expected: FAIL — cannot resolve `@/components/ClarificationPanel`.

- [ ] **Step 3: Write the dismiss server action**

Create `src/app/offertes/[id]/clarification-actions.ts`:

```ts
'use server';

import { requireContractor } from '@/lib/auth/require-contractor';

export async function dismissClarification(id: string): Promise<void> {
  const { supabase } = await requireContractor();
  const { error } = await supabase
    .from('quote_clarifications')
    .update({ status: 'dismissed' })
    .eq('id', id);
  if (error) throw new Error('Bijwerken mislukt. Probeer opnieuw.');
}
```

- [ ] **Step 4: Write the panel**

Create `src/components/ClarificationPanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import VoiceRecorder from '@/components/VoiceRecorder';
import type { QuoteClarification } from '@/lib/supabase/types';
import { dismissClarification } from '@/app/offertes/[id]/clarification-actions';

type Props = {
  quoteId: string;
  clarifications: QuoteClarification[];
  onResolved: () => void;
};

type LocalState = { question: string; status: string; capped: boolean };

export default function ClarificationPanel({ quoteId, clarifications, onResolved }: Props) {
  const [local, setLocal] = useState<Record<string, LocalState>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function stateOf(item: QuoteClarification): LocalState {
    return local[item.id] ?? { question: item.question_nl, status: item.status, capped: false };
  }

  const pending = clarifications.filter((item) => stateOf(item).status === 'pending');

  async function playQuestion(clarificationId: string) {
    try {
      const response = await fetch(
        `/api/quotes/${quoteId}/clarifications/${clarificationId}/prompt-audio`,
      );
      if (!response.ok) return; // Text is on screen; silence is an acceptable fallback.
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      await new Audio(url).play();
      URL.revokeObjectURL(url);
    } catch {
      // Audio blocked or unsupported — the written question remains visible.
    }
  }

  async function submitAnswer(clarificationId: string, audio: Blob) {
    setBusyId(clarificationId);
    setError(null);

    const form = new FormData();
    form.append('audio', audio, 'antwoord.webm');

    try {
      const response = await fetch(
        `/api/quotes/${quoteId}/clarifications/${clarificationId}/answer`,
        { method: 'POST', body: form },
      );
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? 'Verwerken mislukt. Probeer opnieuw.');
        return;
      }

      setLocal((prev) => ({
        ...prev,
        [clarificationId]: {
          question: body.question,
          status: body.resolved ? 'resolved' : 'pending',
          capped: !body.resolved && body.canRetry === false,
        },
      }));
      onResolved();
    } catch {
      setError('Geen verbinding. Probeer opnieuw.');
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(clarificationId: string) {
    await dismissClarification(clarificationId);
    setLocal((prev) => ({
      ...prev,
      [clarificationId]: { ...stateOf(clarifications.find((c) => c.id === clarificationId)!), status: 'dismissed' },
    }));
    onResolved();
  }

  if (pending.length === 0) {
    return (
      <p className="rounded border border-green-300 bg-green-50 p-4 text-sm">
        Alle vragen beantwoord. Je kan de offerte afwerken.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-amber-300 bg-amber-50 p-4">
      <h2 className="font-semibold">
        Te verduidelijken (<span data-testid="pending-count">{pending.length}</span>)
      </h2>
      <p className="text-sm text-gray-700">
        Beantwoord deze vragen hardop, of vul ze hieronder handmatig aan.
      </p>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-4">
        {pending.map((item) => {
          const state = stateOf(item);
          return (
            <li key={item.id} className="rounded border bg-white p-3">
              <p className="mb-2 font-medium">{state.question}</p>

              {state.capped && (
                <p className="mb-2 text-sm text-amber-800">
                  Ik begrijp het antwoord niet. Vul dit handmatig aan bij de offertelijnen.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void playQuestion(item.id)}
                  className="rounded border px-3 py-2 text-sm"
                >
                  ▶ Vraag afspelen
                </button>

                <VoiceRecorder
                  onRecorded={(audio) => void submitAnswer(item.id, audio)}
                  label="Antwoord opnemen"
                  disabled={busyId === item.id}
                />

                <button
                  type="button"
                  onClick={() => void dismiss(item.id)}
                  className="text-sm underline"
                >
                  Niet van toepassing
                </button>
              </div>

              {busyId === item.id && <p className="mt-2 text-sm text-gray-600">Bezig met verwerken…</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test src/components`
Expected: PASS, all component tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/ClarificationPanel.tsx src/components/__tests__/ClarificationPanel.test.tsx "src/app/offertes/[id]/clarification-actions.ts"
git commit -m "feat: add voice clarification panel with text fallback"
```

---

### Task 18: Finalize gate and customer details

The gate is the rule that stops an incomplete quote going out. It is pure logic, so it is tested exhaustively.

**Files:**
- Create: `src/lib/quotes/finalize-gate.ts`
- Create: `src/components/CustomerForm.tsx`
- Create: `src/app/api/quotes/[id]/finalize/route.ts`
- Test: `src/lib/quotes/__tests__/finalize-gate.test.ts`

**Interfaces:**
- Consumes: `Quote`, `QuoteLineItem`, `QuoteClarification`
- Produces:
  - `type FinalizeBlocker = { code: 'no_line_items' | 'incomplete_line_item' | 'pending_clarification' | 'missing_customer' | 'already_final'; messageNl: string }`
  - `checkFinalizeGate(input: { quote: Pick<Quote,'status'|'customer_name'|'customer_address'>; lineItems: QuoteLineItem[]; clarifications: QuoteClarification[] }): FinalizeBlocker[]`
  - `<CustomerForm quote={Quote} />` and server action `saveCustomerDetails(quoteId, form)`
  - Route: `POST /api/quotes/:id/finalize` → `200 {ok:true}` or `422 {blockers}`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/quotes/__tests__/finalize-gate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { checkFinalizeGate } from '@/lib/quotes/finalize-gate';
import type { QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

function line(overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'line-1', quote_id: 'q1', catalog_item_id: 'cat-1',
    description: 'Dakpannen – materiaal', quantity: 80, unit: 'm²',
    unit_price_cents: 3000, vat_rate: 0.06, line_type: 'materials',
    sort_order: 0, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

function clar(overrides: Partial<QuoteClarification> = {}): QuoteClarification {
  return {
    id: 'clar-1', quote_id: 'q1', question_nl: 'Welk type?',
    status: 'pending', retry_count: 0, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

const completeQuote = {
  status: 'draft' as const,
  customer_name: 'Jan Peeters',
  customer_address: 'Kerkstraat 1, 9000 Gent',
};

describe('checkFinalizeGate', () => {
  it('passes a complete quote', () => {
    expect(
      checkFinalizeGate({ quote: completeQuote, lineItems: [line()], clarifications: [] }),
    ).toEqual([]);
  });

  it('blocks a quote with no line items', () => {
    const blockers = checkFinalizeGate({ quote: completeQuote, lineItems: [], clarifications: [] });
    expect(blockers.map((b) => b.code)).toContain('no_line_items');
  });

  it('blocks a line item with no price', () => {
    const blockers = checkFinalizeGate({
      quote: completeQuote, lineItems: [line({ unit_price_cents: null })], clarifications: [],
    });
    expect(blockers.map((b) => b.code)).toContain('incomplete_line_item');
  });

  it('blocks a line item with no VAT rate', () => {
    const blockers = checkFinalizeGate({
      quote: completeQuote, lineItems: [line({ vat_rate: null })], clarifications: [],
    });
    expect(blockers.map((b) => b.code)).toContain('incomplete_line_item');
  });

  it('blocks a pending clarification', () => {
    const blockers = checkFinalizeGate({
      quote: completeQuote, lineItems: [line()], clarifications: [clar()],
    });
    expect(blockers.map((b) => b.code)).toContain('pending_clarification');
  });

  it('allows a resolved clarification', () => {
    expect(
      checkFinalizeGate({
        quote: completeQuote, lineItems: [line()], clarifications: [clar({ status: 'resolved' })],
      }),
    ).toEqual([]);
  });

  it('allows a dismissed clarification', () => {
    expect(
      checkFinalizeGate({
        quote: completeQuote, lineItems: [line()], clarifications: [clar({ status: 'dismissed' })],
      }),
    ).toEqual([]);
  });

  it('blocks a missing customer name', () => {
    const blockers = checkFinalizeGate({
      quote: { ...completeQuote, customer_name: null }, lineItems: [line()], clarifications: [],
    });
    expect(blockers.map((b) => b.code)).toContain('missing_customer');
  });

  it('blocks a blank customer address', () => {
    const blockers = checkFinalizeGate({
      quote: { ...completeQuote, customer_address: '   ' }, lineItems: [line()], clarifications: [],
    });
    expect(blockers.map((b) => b.code)).toContain('missing_customer');
  });

  it('blocks an already-finalized quote', () => {
    const blockers = checkFinalizeGate({
      quote: { ...completeQuote, status: 'final' }, lineItems: [line()], clarifications: [],
    });
    expect(blockers.map((b) => b.code)).toContain('already_final');
  });

  it('reports every blocker at once, not just the first', () => {
    const blockers = checkFinalizeGate({
      quote: { status: 'draft', customer_name: null, customer_address: null },
      lineItems: [],
      clarifications: [clar()],
    });
    expect(blockers.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every blocker a Dutch message', () => {
    const blockers = checkFinalizeGate({
      quote: { status: 'draft', customer_name: null, customer_address: null },
      lineItems: [line({ vat_rate: null })],
      clarifications: [clar()],
    });
    for (const blocker of blockers) {
      expect(blocker.messageNl.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/quotes/__tests__/finalize-gate.test.ts`
Expected: FAIL — cannot resolve `@/lib/quotes/finalize-gate`.

- [ ] **Step 3: Write the gate**

Create `src/lib/quotes/finalize-gate.ts`:

```ts
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export type FinalizeBlockerCode =
  | 'no_line_items'
  | 'incomplete_line_item'
  | 'pending_clarification'
  | 'missing_customer'
  | 'already_final';

export type FinalizeBlocker = { code: FinalizeBlockerCode; messageNl: string };

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim() === '';
}

export function checkFinalizeGate(input: {
  quote: Pick<Quote, 'status' | 'customer_name' | 'customer_address'>;
  lineItems: QuoteLineItem[];
  clarifications: QuoteClarification[];
}): FinalizeBlocker[] {
  const blockers: FinalizeBlocker[] = [];

  if (input.quote.status === 'final') {
    blockers.push({ code: 'already_final', messageNl: 'Deze offerte is al afgewerkt.' });
  }

  if (input.lineItems.length === 0) {
    blockers.push({ code: 'no_line_items', messageNl: 'Voeg minstens één offertelijn toe.' });
  }

  const incomplete = input.lineItems.filter(
    (item) => item.unit_price_cents === null || item.vat_rate === null,
  );
  if (incomplete.length > 0) {
    blockers.push({
      code: 'incomplete_line_item',
      messageNl: `${incomplete.length} offertelijn(en) missen nog een prijs of btw-tarief.`,
    });
  }

  const pending = input.clarifications.filter((item) => item.status === 'pending');
  if (pending.length > 0) {
    blockers.push({
      code: 'pending_clarification',
      messageNl: `Er zijn nog ${pending.length} openstaande vraag/vragen. Beantwoord of verwerp ze eerst.`,
    });
  }

  if (isBlank(input.quote.customer_name) || isBlank(input.quote.customer_address)) {
    blockers.push({
      code: 'missing_customer',
      messageNl: 'Vul de naam en het adres van de klant in.',
    });
  }

  return blockers;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/lib/quotes`
Expected: PASS, 12 gate tests plus the earlier expand and generate tests.

- [ ] **Step 5: Write the customer form**

Create `src/components/CustomerForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { Quote } from '@/lib/supabase/types';
import { saveCustomerDetails } from '@/app/offertes/[id]/customer-actions';

export default function CustomerForm({ quote }: { quote: Quote }) {
  const [saved, setSaved] = useState(false);

  async function action(form: FormData) {
    await saveCustomerDetails(quote.id, form);
    setSaved(true);
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded border p-4">
      <h2 className="font-semibold">Klantgegevens</h2>
      <input name="customer_name" required defaultValue={quote.customer_name ?? ''} placeholder="Naam klant" className="rounded border p-3" />
      <input name="customer_address" required defaultValue={quote.customer_address ?? ''} placeholder="Adres" className="rounded border p-3" />
      <input name="customer_email" type="email" defaultValue={quote.customer_email ?? ''} placeholder="E-mailadres (optioneel)" className="rounded border p-3" />
      <input name="customer_phone" defaultValue={quote.customer_phone ?? ''} placeholder="Telefoon (optioneel)" className="rounded border p-3" />
      <button type="submit" className="rounded bg-black p-3 text-white">Klantgegevens opslaan</button>
      {saved && <p className="text-sm text-green-700">Opgeslagen.</p>}
    </form>
  );
}
```

Create `src/app/offertes/[id]/customer-actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';

function optional(form: FormData, key: string): string | null {
  const value = (form.get(key) as string | null)?.trim();
  return value ? value : null;
}

export async function saveCustomerDetails(quoteId: string, form: FormData): Promise<void> {
  const { supabase } = await requireContractor();

  const { error } = await supabase
    .from('quotes')
    .update({
      customer_name: optional(form, 'customer_name'),
      customer_address: optional(form, 'customer_address'),
      customer_email: optional(form, 'customer_email'),
      customer_phone: optional(form, 'customer_phone'),
    })
    .eq('id', quoteId)
    .eq('status', 'draft');

  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
  revalidatePath(`/offertes/${quoteId}`);
}
```

- [ ] **Step 6: Write the finalize route**

Create `src/app/api/quotes/[id]/finalize/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { checkFinalizeGate } from '@/lib/quotes/finalize-gate';
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

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

  const [{ data: quote }, { data: lineItems }, { data: clarifications }] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', id).single(),
    supabase.from('quote_line_items').select('*').eq('quote_id', id),
    supabase.from('quote_clarifications').select('*').eq('quote_id', id),
  ]);

  if (!quote) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });

  const blockers = checkFinalizeGate({
    quote: quote as Quote,
    lineItems: (lineItems ?? []) as QuoteLineItem[],
    clarifications: (clarifications ?? []) as QuoteClarification[],
  });

  if (blockers.length > 0) {
    return NextResponse.json({ blockers }, { status: 422 });
  }

  const { error } = await supabase
    .from('quotes')
    .update({ status: 'final' })
    .eq('id', id)
    .eq('status', 'draft');

  if (error) {
    return NextResponse.json({ error: 'Afwerken mislukt. Probeer opnieuw.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/lib/quotes/finalize-gate.ts src/lib/quotes/__tests__/finalize-gate.test.ts src/components/CustomerForm.tsx "src/app/offertes/[id]/customer-actions.ts" "src/app/api/quotes/[id]/finalize"
git commit -m "feat: add finalize gate and customer details"
```

---

### Task 19: PDF quote document

**Files:**
- Create: `src/lib/pdf/quote-view-model.ts`
- Create: `src/lib/pdf/QuoteDocument.tsx`
- Test: `src/lib/pdf/__tests__/quote-view-model.test.ts`

**Interfaces:**
- Consumes: `Contractor`, `Quote`, `QuoteLineItem`; `calculateTotals`, `formatEuros`, `toTotalsInput`
- Produces:
  - `type QuoteViewModel = { contractor; customer; quoteNumber: string; dateNl: string; groups: { title: string; rows: {...}[] }[]; totals: QuoteTotals; showsReducedVatNotice: boolean }`
  - `buildQuoteViewModel(args: { contractor: Contractor; quote: Quote; lineItems: QuoteLineItem[] }): QuoteViewModel`
  - `<QuoteDocument model={QuoteViewModel} />` — a `@react-pdf/renderer` `Document`

The view model is separated from the PDF component so the layout-independent logic (grouping, numbering, date formatting, the 6% notice) can be unit-tested without rendering a PDF.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/pdf/__tests__/quote-view-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildQuoteViewModel } from '@/lib/pdf/quote-view-model';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

const contractor: Contractor = {
  id: 'c1', company_name: 'Dakwerken Janssens', address: 'Kerkstraat 1, 9000 Gent',
  vat_number: 'BE0123456789', phone: '0470123456', created_at: '2026-01-01T00:00:00Z',
};

const quote: Quote = {
  id: 'a1b2c3d4-0000-0000-0000-000000000000', contractor_id: 'c1',
  transcript: 'tachtig vierkante meter', status: 'final',
  customer_name: 'Jan Peeters', customer_address: 'Dorpsstraat 5, 9050 Gentbrugge',
  customer_email: null, customer_phone: null, audio_path: null, audio_deleted_at: null,
  pdf_path: null, created_at: '2026-08-06T10:30:00Z',
};

function line(overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'line-1', quote_id: quote.id, catalog_item_id: 'cat-1',
    description: 'Dakpannen leggen – materiaal', quantity: 80, unit: 'm²',
    unit_price_cents: 3000, vat_rate: 0.06, line_type: 'materials',
    sort_order: 0, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

describe('buildQuoteViewModel', () => {
  it('carries the contractor letterhead details', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.contractor.companyName).toBe('Dakwerken Janssens');
    expect(model.contractor.vatNumber).toBe('BE0123456789');
  });

  it('carries the customer details', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.customer.name).toBe('Jan Peeters');
    expect(model.customer.address).toBe('Dorpsstraat 5, 9050 Gentbrugge');
  });

  it('derives a short human-readable quote number from the id', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.quoteNumber).toBe('A1B2C3D4');
  });

  it('formats the date in Belgian Dutch convention', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.dateNl).toBe('06/08/2026');
  });

  it('groups the materials and labor rows of one task together', () => {
    const model = buildQuoteViewModel({
      contractor, quote,
      lineItems: [
        line({ id: 'l1', description: 'Dakpannen leggen – materiaal', line_type: 'materials' }),
        line({ id: 'l2', description: 'Dakpannen leggen – arbeid', line_type: 'labor', unit_price_cents: 1500 }),
      ],
    });
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].title).toBe('Dakpannen leggen');
    expect(model.groups[0].rows).toHaveLength(2);
  });

  it('keeps unrelated tasks in separate groups', () => {
    const model = buildQuoteViewModel({
      contractor, quote,
      lineItems: [
        line({ id: 'l1', description: 'Dakpannen leggen – materiaal' }),
        line({ id: 'l2', description: 'Dakgoot vervangen – materiaal' }),
      ],
    });
    expect(model.groups).toHaveLength(2);
  });

  it('computes totals per VAT rate', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.totals.vatGroups).toEqual([
      { vatRate: 0.06, subtotalCents: 240000, vatAmountCents: 14400 },
    ]);
    expect(model.totals.grandTotalCents).toBe(254400);
  });

  it('shows the reduced-rate notice when any line uses 6%', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.showsReducedVatNotice).toBe(true);
  });

  it('omits the reduced-rate notice on a 21%-only quote', () => {
    const model = buildQuoteViewModel({
      contractor, quote, lineItems: [line({ vat_rate: 0.21 })],
    });
    expect(model.showsReducedVatNotice).toBe(false);
  });

  it('handles missing optional contractor fields', () => {
    const model = buildQuoteViewModel({
      contractor: { ...contractor, address: null, vat_number: null, phone: null },
      quote, lineItems: [line()],
    });
    expect(model.contractor.address).toBe('');
    expect(model.contractor.vatNumber).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/pdf`
Expected: FAIL — cannot resolve `@/lib/pdf/quote-view-model`.

- [ ] **Step 3: Write the view model**

Create `src/lib/pdf/quote-view-model.ts`:

```ts
import { calculateTotals, formatEuros, type QuoteTotals } from '@/lib/money/totals';
import { toTotalsInput } from '@/components/LineItemsEditor';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

export type QuoteRow = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: string;
  vatLabel: string;
  lineTotal: string;
};

export type QuoteViewModel = {
  contractor: { companyName: string; address: string; vatNumber: string; phone: string };
  customer: { name: string; address: string; email: string; phone: string };
  quoteNumber: string;
  dateNl: string;
  groups: { title: string; rows: QuoteRow[] }[];
  totals: QuoteTotals;
  showsReducedVatNotice: boolean;
};

/** "Dakpannen leggen – materiaal" -> "Dakpannen leggen" */
function taskTitle(description: string): string {
  return description.replace(/\s+–\s+(materiaal|arbeid)$/u, '').trim();
}

export function buildQuoteViewModel(args: {
  contractor: Contractor;
  quote: Quote;
  lineItems: QuoteLineItem[];
}): QuoteViewModel {
  const { contractor, quote, lineItems } = args;

  const grouped = new Map<string, QuoteRow[]>();
  for (const item of [...lineItems].sort((a, b) => a.sort_order - b.sort_order)) {
    const title = taskTitle(item.description);
    const rows = grouped.get(title) ?? [];
    const unitPriceCents = item.unit_price_cents ?? 0;

    rows.push({
      description: item.line_type === 'materials' ? 'Materiaal' : 'Arbeid',
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: formatEuros(unitPriceCents),
      vatLabel: item.vat_rate === 0.06 ? '6%' : '21%',
      lineTotal: formatEuros(Math.round(item.quantity * unitPriceCents)),
    });
    grouped.set(title, rows);
  }

  const created = new Date(quote.created_at);
  const dateNl = `${String(created.getUTCDate()).padStart(2, '0')}/${String(
    created.getUTCMonth() + 1,
  ).padStart(2, '0')}/${created.getUTCFullYear()}`;

  return {
    contractor: {
      companyName: contractor.company_name,
      address: contractor.address ?? '',
      vatNumber: contractor.vat_number ?? '',
      phone: contractor.phone ?? '',
    },
    customer: {
      name: quote.customer_name ?? '',
      address: quote.customer_address ?? '',
      email: quote.customer_email ?? '',
      phone: quote.customer_phone ?? '',
    },
    quoteNumber: quote.id.split('-')[0].toUpperCase(),
    dateNl,
    groups: [...grouped.entries()].map(([title, rows]) => ({ title, rows })),
    totals: calculateTotals(toTotalsInput(lineItems)),
    showsReducedVatNotice: lineItems.some((item) => item.vat_rate === 0.06),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/lib/pdf`
Expected: PASS, 10 tests.

If importing `toTotalsInput` from the client component `LineItemsEditor` causes a `'use client'` boundary error in the Node test environment, move `toTotalsInput` into `src/lib/money/totals.ts` and update both importers.

- [ ] **Step 5: Write the PDF document**

Create `src/lib/pdf/QuoteDocument.tsx`:

```tsx
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatEuros } from '@/lib/money/totals';
import type { QuoteViewModel } from '@/lib/pdf/quote-view-model';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  companyName: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  muted: { color: '#555' },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  groupTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  cellDesc: { flex: 3 },
  cellQty: { flex: 1.2, textAlign: 'right' },
  cellPrice: { flex: 1.5, textAlign: 'right' },
  cellVat: { flex: 0.8, textAlign: 'right' },
  cellTotal: { flex: 1.5, textAlign: 'right' },
  totals: { marginTop: 16, alignSelf: 'flex-end', width: 260 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotal: {
    flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, marginTop: 6,
    borderTopWidth: 1, borderTopColor: '#000', fontFamily: 'Helvetica-Bold',
  },
  notice: { marginTop: 24, fontSize: 8, color: '#555' },
});

export default function QuoteDocument({ model }: { model: QuoteViewModel }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{model.contractor.companyName}</Text>
            {!!model.contractor.address && <Text style={styles.muted}>{model.contractor.address}</Text>}
            {!!model.contractor.vatNumber && <Text style={styles.muted}>BTW {model.contractor.vatNumber}</Text>}
            {!!model.contractor.phone && <Text style={styles.muted}>Tel. {model.contractor.phone}</Text>}
          </View>
          <View>
            <Text style={styles.sectionTitle}>Offerte {model.quoteNumber}</Text>
            <Text style={styles.muted}>Datum: {model.dateNl}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>Klant</Text>
          <Text>{model.customer.name}</Text>
          <Text style={styles.muted}>{model.customer.address}</Text>
          {!!model.customer.email && <Text style={styles.muted}>{model.customer.email}</Text>}
          {!!model.customer.phone && <Text style={styles.muted}>{model.customer.phone}</Text>}
        </View>

        <View style={styles.row}>
          <Text style={styles.cellDesc}>Omschrijving</Text>
          <Text style={styles.cellQty}>Aantal</Text>
          <Text style={styles.cellPrice}>Prijs/eenheid</Text>
          <Text style={styles.cellVat}>Btw</Text>
          <Text style={styles.cellTotal}>Totaal</Text>
        </View>

        {model.groups.map((group) => (
          <View key={group.title} wrap={false}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            {group.rows.map((row, index) => (
              <View key={`${group.title}-${index}`} style={styles.row}>
                <Text style={styles.cellDesc}>{row.description}</Text>
                <Text style={styles.cellQty}>{`${row.quantity} ${row.unit}`}</Text>
                <Text style={styles.cellPrice}>{row.unitPrice}</Text>
                <Text style={styles.cellVat}>{row.vatLabel}</Text>
                <Text style={styles.cellTotal}>{row.lineTotal}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.totals}>
          {model.totals.vatGroups.map((group) => (
            <View key={group.vatRate}>
              <View style={styles.totalRow}>
                <Text>Subtotaal ({group.vatRate === 0.06 ? '6%' : '21%'})</Text>
                <Text>{formatEuros(group.subtotalCents)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text>Btw {group.vatRate === 0.06 ? '6%' : '21%'}</Text>
                <Text>{formatEuros(group.vatAmountCents)}</Text>
              </View>
            </View>
          ))}
          <View style={styles.grandTotal}>
            <Text>Totaal incl. btw</Text>
            <Text>{formatEuros(model.totals.grandTotalCents)}</Text>
          </View>
        </View>

        {model.showsReducedVatNotice && (
          <Text style={styles.notice}>
            Het verlaagde btw-tarief van 6% is van toepassing op renovatiewerken aan woningen ouder
            dan 10 jaar, mits de klant het vereiste attest ondertekent.
          </Text>
        )}
      </Page>
    </Document>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf
git commit -m "feat: add PDF quote document and view model"
```

---

### Task 20: PDF generation and download

**Files:**
- Create: `src/app/api/quotes/[id]/pdf/route.ts`
- Modify: `src/app/api/quotes/[id]/finalize/route.ts` (generate the PDF after finalizing)
- Create: `src/lib/pdf/render.ts`

**Interfaces:**
- Consumes: `buildQuoteViewModel`, `QuoteDocument`, `logPipelineEvent`
- Produces:
  - `renderQuotePdf(model: QuoteViewModel): Promise<Buffer>`
  - `generateAndStoreQuotePdf(supabase, args): Promise<string>` — returns the storage path
  - Route: `GET /api/quotes/:id/pdf` → redirects to a signed URL; regenerates on demand when `pdf_path` is null, so a failed generation is recoverable without redoing the quote.

- [ ] **Step 1: Write the renderer**

Create `src/lib/pdf/render.ts`:

```ts
import { renderToBuffer } from '@react-pdf/renderer';
import QuoteDocument from '@/lib/pdf/QuoteDocument';
import { buildQuoteViewModel } from '@/lib/pdf/quote-view-model';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

export async function renderQuotePdf(args: {
  contractor: Contractor;
  quote: Quote;
  lineItems: QuoteLineItem[];
}): Promise<Buffer> {
  const model = buildQuoteViewModel(args);
  return renderToBuffer(<QuoteDocument model={model} />);
}
```

Note: this file uses JSX, so it must be named `render.tsx`, not `render.ts`. Create it as `src/lib/pdf/render.tsx`.

- [ ] **Step 2: Generate the PDF as part of finalizing**

In `src/app/api/quotes/[id]/finalize/route.ts`, add these imports:

```ts
import { renderQuotePdf } from '@/lib/pdf/render';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import type { Contractor } from '@/lib/supabase/types';
```

Then replace the final `return NextResponse.json({ ok: true });` with:

```ts
  // PDF failure must not undo finalizing — the quote is already correct and
  // the PDF can be regenerated on demand from the download route.
  try {
    const { data: contractor } = await supabase
      .from('contractors').select('*').eq('id', quote.contractor_id).single();

    const pdf = await renderQuotePdf({
      contractor: contractor as Contractor,
      quote: { ...(quote as Quote), status: 'final' },
      lineItems: (lineItems ?? []) as QuoteLineItem[],
    });

    const path = `${quote.contractor_id}/${id}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('quote-pdfs')
      .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    await supabase.from('quotes').update({ pdf_path: path }).eq('id', id);
    await logPipelineEvent({
      quoteId: id, contractorId: quote.contractor_id, step: 'pdf_generate',
      status: 'success', detail: { path },
    });
  } catch (pdfError) {
    await logPipelineEvent({
      quoteId: id, contractorId: quote.contractor_id, step: 'pdf_generate',
      status: 'error', detail: { error: String(pdfError) },
    });
  }

  return NextResponse.json({ ok: true });
```

- [ ] **Step 3: Write the download route**

Create `src/app/api/quotes/[id]/pdf/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { renderQuotePdf } from '@/lib/pdf/render';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supabase: Awaited<ReturnType<typeof requireContractor>>['supabase'];
  let contractor: Contractor;
  try {
    const auth = await requireContractor();
    supabase = auth.supabase;
    contractor = auth.contractor;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    }
    throw error;
  }

  const { data: quote } = await supabase.from('quotes').select('*').eq('id', id).single();
  if (!quote) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });

  let path = (quote as Quote).pdf_path;

  // Regenerate on demand when finalizing produced no PDF.
  if (!path) {
    try {
      const { data: lineItems } = await supabase
        .from('quote_line_items').select('*').eq('quote_id', id);

      const pdf = await renderQuotePdf({
        contractor,
        quote: quote as Quote,
        lineItems: (lineItems ?? []) as QuoteLineItem[],
      });

      path = `${contractor.id}/${id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('quote-pdfs')
        .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      await supabase.from('quotes').update({ pdf_path: path }).eq('id', id);
      await logPipelineEvent({
        quoteId: id, contractorId: contractor.id, step: 'pdf_generate',
        status: 'success', detail: { path, regenerated: true },
      });
    } catch (error) {
      await logPipelineEvent({
        quoteId: id, contractorId: contractor.id, step: 'pdf_generate',
        status: 'error', detail: { error: String(error) },
      });
      return NextResponse.json({ error: 'Pdf genereren mislukt. Probeer opnieuw.' }, { status: 500 });
    }
  }

  const { data: signed } = await supabase.storage
    .from('quote-pdfs')
    .createSignedUrl(path, 60 * 10);

  if (!signed) {
    return NextResponse.json({ error: 'Pdf niet beschikbaar' }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
```

- [ ] **Step 4: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/lib/pdf "src/app/api/quotes/[id]"
git commit -m "feat: generate and serve quote PDFs"
```

---

### Task 21: Quote review page

Assembles the pieces built so far into the screen the contractor actually works on.

**Files:**
- Create: `src/app/offertes/[id]/page.tsx`, `src/app/offertes/[id]/QuoteEditor.tsx`
- Test: `src/app/offertes/[id]/__tests__/QuoteEditor.test.tsx`

**Interfaces:**
- Consumes: `<LineItemsEditor />`, `<ClarificationPanel />`, `<CustomerForm />`, `updateLineItem`, `addLineItem`, `removeLineItem`; the finalize route
- Produces: `<QuoteEditor quote={Quote} initialLineItems={QuoteLineItem[]} initialClarifications={QuoteClarification[]} />`

- [ ] **Step 1: Write the failing tests**

Create `src/app/offertes/[id]/__tests__/QuoteEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuoteEditor from '@/app/offertes/[id]/QuoteEditor';
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/ClarificationPanel', () => ({
  default: ({ clarifications }: { clarifications: QuoteClarification[] }) => (
    <div data-testid="clarifications">{clarifications.length}</div>
  ),
}));
vi.mock('@/components/CustomerForm', () => ({ default: () => <div data-testid="customer-form" /> }));
vi.mock('@/app/offertes/[id]/line-item-actions', () => ({
  updateLineItem: vi.fn().mockResolvedValue(undefined),
  addLineItem: vi.fn().mockResolvedValue(undefined),
  removeLineItem: vi.fn().mockResolvedValue(undefined),
}));

const quote: Quote = {
  id: 'quote-1', contractor_id: 'c1', transcript: 'tachtig vierkante meter dakpannen',
  status: 'draft', customer_name: 'Jan Peeters', customer_address: 'Dorpsstraat 5',
  customer_email: null, customer_phone: null, audio_path: null, audio_deleted_at: null,
  pdf_path: null, created_at: '2026-08-06T10:00:00Z',
};

function line(overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'line-1', quote_id: 'quote-1', catalog_item_id: 'cat-1',
    description: 'Dakpannen leggen – materiaal', quantity: 80, unit: 'm²',
    unit_price_cents: 3000, vat_rate: 0.06, line_type: 'materials',
    sort_order: 0, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('QuoteEditor', () => {
  it('shows the transcript so the contractor can see what was heard', () => {
    render(<QuoteEditor quote={quote} initialLineItems={[line()]} initialClarifications={[]} />);
    expect(screen.getByText(/tachtig vierkante meter dakpannen/)).toBeInTheDocument();
  });

  it('renders the line items editor', () => {
    render(<QuoteEditor quote={quote} initialLineItems={[line()]} initialClarifications={[]} />);
    expect(screen.getByDisplayValue('Dakpannen leggen – materiaal')).toBeInTheDocument();
  });

  it('disables finalizing while a clarification is pending', () => {
    render(
      <QuoteEditor
        quote={quote}
        initialLineItems={[line()]}
        initialClarifications={[{
          id: 'c1', quote_id: 'quote-1', question_nl: 'Welk type?',
          status: 'pending', retry_count: 0, created_at: '2026-08-06T00:00:00Z',
        }]}
      />,
    );
    expect(screen.getByRole('button', { name: /offerte afwerken/i })).toBeDisabled();
  });

  it('enables finalizing when everything is complete', () => {
    render(<QuoteEditor quote={quote} initialLineItems={[line()]} initialClarifications={[]} />);
    expect(screen.getByRole('button', { name: /offerte afwerken/i })).toBeEnabled();
  });

  it('disables finalizing when a line item still lacks a VAT rate', () => {
    render(
      <QuoteEditor quote={quote} initialLineItems={[line({ vat_rate: null })]} initialClarifications={[]} />,
    );
    expect(screen.getByRole('button', { name: /offerte afwerken/i })).toBeDisabled();
  });

  it('shows the server blockers when finalizing is rejected', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ blockers: [{ code: 'missing_customer', messageNl: 'Vul de klantgegevens in.' }] }),
    });

    render(<QuoteEditor quote={quote} initialLineItems={[line()]} initialClarifications={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /offerte afwerken/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Vul de klantgegevens in.'));
  });

  it('shows a download link once the quote is final', () => {
    render(
      <QuoteEditor quote={{ ...quote, status: 'final' }} initialLineItems={[line()]} initialClarifications={[]} />,
    );
    expect(screen.getByRole('link', { name: /pdf downloaden/i })).toHaveAttribute(
      'href',
      '/api/quotes/quote-1/pdf',
    );
  });

  it('makes line items read-only once the quote is final', () => {
    render(
      <QuoteEditor quote={{ ...quote, status: 'final' }} initialLineItems={[line()]} initialClarifications={[]} />,
    );
    expect(screen.getByDisplayValue('Dakpannen leggen – materiaal')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test "src/app/offertes/[id]"`
Expected: FAIL — cannot resolve `@/app/offertes/[id]/QuoteEditor`.

- [ ] **Step 3: Write the editor component**

Create `src/app/offertes/[id]/QuoteEditor.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LineItemsEditor from '@/components/LineItemsEditor';
import ClarificationPanel from '@/components/ClarificationPanel';
import CustomerForm from '@/components/CustomerForm';
import { checkFinalizeGate } from '@/lib/quotes/finalize-gate';
import { updateLineItem, addLineItem } from '@/app/offertes/[id]/line-item-actions';
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

type Props = {
  quote: Quote;
  initialLineItems: QuoteLineItem[];
  initialClarifications: QuoteClarification[];
};

export default function QuoteEditor({ quote, initialLineItems, initialClarifications }: Props) {
  const router = useRouter();
  const [lineItems, setLineItems] = useState(initialLineItems);
  const [blockerMessages, setBlockerMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const isFinal = quote.status === 'final';
  const blockers = checkFinalizeGate({ quote, lineItems, clarifications: initialClarifications });

  function onLineItemsChange(next: QuoteLineItem[]) {
    setLineItems(next);
    // Persist only the rows that actually changed.
    for (const item of next) {
      const before = lineItems.find((existing) => existing.id === item.id);
      if (!before) continue;
      const changed =
        before.description !== item.description ||
        before.quantity !== item.quantity ||
        before.unit !== item.unit ||
        before.unit_price_cents !== item.unit_price_cents ||
        before.vat_rate !== item.vat_rate;

      if (changed) {
        void updateLineItem(item.id, {
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price_cents: item.unit_price_cents,
          vat_rate: item.vat_rate,
        });
      }
    }
  }

  async function finalize() {
    setBusy(true);
    setBlockerMessages([]);
    try {
      const response = await fetch(`/api/quotes/${quote.id}/finalize`, { method: 'POST' });
      const body = await response.json();

      if (!response.ok) {
        setBlockerMessages(
          body.blockers?.map((b: { messageNl: string }) => b.messageNl) ?? [
            body.error ?? 'Afwerken mislukt.',
          ],
        );
        return;
      }
      router.refresh();
    } catch {
      setBlockerMessages(['Geen verbinding. Probeer opnieuw.']);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {quote.transcript && (
        <details className="rounded border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Wat ik gehoord heb</summary>
          <p className="mt-2 text-gray-700">{quote.transcript}</p>
        </details>
      )}

      {!isFinal && (
        <ClarificationPanel
          quoteId={quote.id}
          clarifications={initialClarifications}
          onResolved={() => router.refresh()}
        />
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Offertelijnen</h2>
        <LineItemsEditor items={lineItems} onChange={onLineItemsChange} readOnly={isFinal} />

        {!isFinal && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void addLineItem(quote.id, 'materials').then(() => router.refresh())}
              className="rounded border px-3 py-2 text-sm"
            >
              + Materiaal toevoegen
            </button>
            <button
              type="button"
              onClick={() => void addLineItem(quote.id, 'labor').then(() => router.refresh())}
              className="rounded border px-3 py-2 text-sm"
            >
              + Arbeid toevoegen
            </button>
          </div>
        )}
      </section>

      {!isFinal && <CustomerForm quote={quote} />}

      {blockerMessages.length > 0 && (
        <ul role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {blockerMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {isFinal ? (
        <a
          href={`/api/quotes/${quote.id}/pdf`}
          className="rounded bg-black p-4 text-center text-white"
        >
          Pdf downloaden
        </a>
      ) : (
        <button
          type="button"
          onClick={() => void finalize()}
          disabled={busy || blockers.length > 0}
          className="rounded bg-black p-4 text-white disabled:opacity-50"
        >
          {busy ? 'Bezig…' : 'Offerte afwerken'}
        </button>
      )}

      {!isFinal && blockers.length > 0 && (
        <ul className="text-sm text-gray-600">
          {blockers.map((blocker) => (
            <li key={blocker.code}>• {blocker.messageNl}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the page**

Create `src/app/offertes/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { requireContractor } from '@/lib/auth/require-contractor';
import QuoteEditor from './QuoteEditor';
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireContractor();

  const [{ data: quote }, { data: lineItems }, { data: clarifications }] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', id).single(),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('sort_order'),
    supabase.from('quote_clarifications').select('*').eq('quote_id', id).order('created_at'),
  ]);

  if (!quote) notFound();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-2xl font-bold">
        Offerte {(quote as Quote).id.split('-')[0].toUpperCase()}
      </h1>
      <p className="mb-6 text-sm text-gray-600">
        {(quote as Quote).status === 'final' ? 'Afgewerkt' : 'Concept'}
      </p>

      <QuoteEditor
        quote={quote as Quote}
        initialLineItems={(lineItems ?? []) as QuoteLineItem[]}
        initialClarifications={(clarifications ?? []) as QuoteClarification[]}
      />
    </main>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, 8 QuoteEditor tests plus everything before.

- [ ] **Step 6: Commit**

```bash
git add "src/app/offertes/[id]"
git commit -m "feat: add quote review page with finalize flow"
```

---

### Task 22: Quotes list and navigation

**Files:**
- Create: `src/app/offertes/page.tsx`
- Modify: `src/app/layout.tsx` (add navigation)
- Modify: `src/app/page.tsx` (redirect to `/offertes`)

**Interfaces:**
- Consumes: `requireContractor`, `Quote`, `formatEuros`
- Produces: a list page at `/offertes`, and app-wide navigation to Offertes / Nieuwe offerte / Instellingen.

- [ ] **Step 1: Write the list page**

Create `src/app/offertes/page.tsx`:

```tsx
import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import type { Quote } from '@/lib/supabase/types';

export default async function QuotesPage() {
  const { supabase } = await requireContractor();
  const { data } = await supabase
    .from('quotes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  const quotes = (data ?? []) as Quote[];

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Offertes</h1>
        <Link href="/offertes/nieuw" className="rounded bg-black px-4 py-2 text-white">
          Nieuwe offerte
        </Link>
      </div>

      {quotes.length === 0 ? (
        <p className="rounded border border-dashed p-6 text-center text-sm text-gray-600">
          Nog geen offertes. Maak je eerste offerte door de klus in te spreken.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <Link href={`/offertes/${quote.id}`} className="flex items-center justify-between rounded border p-4">
                <div>
                  <p className="font-medium">{quote.customer_name ?? 'Zonder klantnaam'}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(quote.created_at).toLocaleDateString('nl-BE')}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs ${
                    quote.status === 'final' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {quote.status === 'final' ? 'Afgewerkt' : 'Concept'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add navigation to the layout**

Replace the `<body>` contents in `src/app/layout.tsx` so every page has navigation, and set the document language to Dutch:

```tsx
import Link from 'next/link';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Offertes',
  description: 'Spraakgestuurde offertes voor dakwerkers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body>
        <nav className="border-b">
          <div className="mx-auto flex max-w-2xl gap-4 p-4 text-sm">
            <Link href="/offertes" className="font-medium">Offertes</Link>
            <Link href="/offertes/nieuw">Nieuwe offerte</Link>
            <Link href="/instellingen" className="ml-auto">Instellingen</Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Redirect the root page**

Replace `src/app/page.tsx` entirely with:

```tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/offertes');
}
```

- [ ] **Step 4: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/app/offertes/page.tsx src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add quotes list and app navigation"
```

---

### Task 23: Audio retention cleanup

Raw voice recordings are deleted once transcribed; only the text transcript is kept.

**Files:**
- Create: `src/lib/storage/cleanup.ts`
- Create: `src/app/api/cron/cleanup-audio/route.ts`
- Create: `vercel.json`
- Test: `src/lib/storage/__tests__/cleanup.test.ts`

**Interfaces:**
- Consumes: `createAdminSupabase`, `logPipelineEvent`
- Produces:
  - `findCleanupCandidates(quotes: {id,contractor_id,audio_path,transcript,audio_deleted_at}[]): string[]` — ids safe to delete
  - `GET /api/cron/cleanup-audio` — requires the `CRON_SECRET` bearer token

- [ ] **Step 1: Write the failing tests**

Create `src/lib/storage/__tests__/cleanup.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findCleanupCandidates } from '@/lib/storage/cleanup';

const base = {
  id: 'q1', contractor_id: 'c1', audio_path: 'c1/a.webm',
  transcript: 'tachtig vierkante meter', audio_deleted_at: null as string | null,
};

describe('findCleanupCandidates', () => {
  it('selects a transcribed recording', () => {
    expect(findCleanupCandidates([base])).toEqual(['q1']);
  });

  it('keeps a recording that was never transcribed — it may still be retried', () => {
    expect(findCleanupCandidates([{ ...base, transcript: null }])).toEqual([]);
  });

  it('keeps a recording whose transcript is blank', () => {
    expect(findCleanupCandidates([{ ...base, transcript: '   ' }])).toEqual([]);
  });

  it('skips a recording already deleted', () => {
    expect(findCleanupCandidates([{ ...base, audio_deleted_at: '2026-08-06T00:00:00Z' }])).toEqual([]);
  });

  it('skips a quote with no audio path', () => {
    expect(findCleanupCandidates([{ ...base, audio_path: null }])).toEqual([]);
  });

  it('handles a mixed batch', () => {
    expect(
      findCleanupCandidates([
        base,
        { ...base, id: 'q2', transcript: null },
        { ...base, id: 'q3' },
      ]),
    ).toEqual(['q1', 'q3']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test src/lib/storage`
Expected: FAIL — cannot resolve `@/lib/storage/cleanup`.

- [ ] **Step 3: Write the cleanup logic**

Create `src/lib/storage/cleanup.ts`:

```ts
export type CleanupCandidate = {
  id: string;
  contractor_id: string;
  audio_path: string | null;
  transcript: string | null;
  audio_deleted_at: string | null;
};

/**
 * Only delete audio we no longer need: it must have produced a transcript
 * (otherwise a retry still needs it) and must not already be deleted.
 */
export function findCleanupCandidates(quotes: CleanupCandidate[]): string[] {
  return quotes
    .filter(
      (quote) =>
        quote.audio_path !== null &&
        quote.audio_deleted_at === null &&
        quote.transcript !== null &&
        quote.transcript.trim() !== '',
    )
    .map((quote) => quote.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test src/lib/storage`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the cron route**

Create `src/app/api/cron/cleanup-audio/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import { findCleanupCandidates, type CleanupCandidate } from '@/lib/storage/cleanup';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from('quotes')
    .select('id,contractor_id,audio_path,transcript,audio_deleted_at')
    .is('audio_deleted_at', null)
    .not('audio_path', 'is', null)
    .limit(500);

  const quotes = (data ?? []) as CleanupCandidate[];
  const candidateIds = new Set(findCleanupCandidates(quotes));
  let deleted = 0;

  for (const quote of quotes) {
    if (!candidateIds.has(quote.id) || !quote.audio_path) continue;

    const { error } = await supabase.storage.from('quote-audio').remove([quote.audio_path]);
    if (error) {
      await logPipelineEvent({
        quoteId: quote.id, contractorId: quote.contractor_id, step: 'audio_cleanup',
        status: 'error', detail: { path: quote.audio_path, error: error.message },
      });
      continue;
    }

    await supabase
      .from('quotes')
      .update({ audio_deleted_at: new Date().toISOString() })
      .eq('id', quote.id);

    await logPipelineEvent({
      quoteId: quote.id, contractorId: quote.contractor_id, step: 'audio_cleanup',
      status: 'success', detail: { path: quote.audio_path },
    });
    deleted += 1;
  }

  return NextResponse.json({ scanned: quotes.length, deleted });
}
```

- [ ] **Step 6: Schedule it daily**

Create `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/cleanup-audio", "schedule": "0 3 * * *" }
  ]
}
```

- [ ] **Step 7: Run the full suite and commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/lib/storage src/app/api/cron vercel.json
git commit -m "feat: delete transcribed audio on a daily schedule"
```

---

### Task 24: Manual verification on a real device

Mic capture, TTS playback, and the voice conversation loop cannot be verified by automated tests in this stack. This task is the explicit completion gate from the spec — v1 is not done until it passes.

**Files:**
- Create: `docs/manual-test-checklist.md`

**Interfaces:**
- Consumes: everything built in Tasks 1–23
- Produces: a written record of what was verified on real hardware

- [ ] **Step 1: Deploy a preview build**

```bash
npx vercel deploy
```

Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `CRON_SECRET` in the Vercel project settings first. Mic capture requires HTTPS, so this must be tested on the deployed URL, not `localhost` over LAN.

- [ ] **Step 2: Write the checklist**

Create `docs/manual-test-checklist.md`:

```markdown
# Manual test checklist — v1

Run on a real phone (iOS Safari and Android Chrome), on the deployed HTTPS URL.

## Setup
- [ ] Sign up creates an account and lands on /offertes
- [ ] Business details save and persist after reload
- [ ] Add three catalog items (e.g. dakpannen leggen per m², dakgoot per m, dakraam per stuk)
- [ ] Recording is blocked with a clear message when the catalog is empty

## Recording
- [ ] Mic permission prompt appears on first record
- [ ] Denying permission shows the Dutch fallback message, app stays usable
- [ ] Record a real Flemish description, e.g. "Tachtig vierkante meter dakpannen
      vervangen op een woning van dertig jaar oud, en twaalf meter dakgoot vernieuwen"
- [ ] Transcript shown under "Wat ik gehoord heb" matches what was said
- [ ] Line items appear with materials and labor split per task
- [ ] Quantities extracted correctly (80 m², 12 m)

## Clarifications
- [ ] At least one clarification is raised for the description above
- [ ] "Vraag afspelen" speaks the question in intelligible Dutch
- [ ] Recording a relevant spoken answer resolves the question
- [ ] Recording a nonsense answer ("euh, ja") produces a rephrased question
- [ ] After two unhelpful answers, the manual-completion message appears
- [ ] "Niet van toepassing" dismisses a question
- [ ] Finalize stays disabled while any question is pending

## Quote and PDF
- [ ] Editing a quantity updates the total live
- [ ] Changing a line's VAT rate moves it to the other subtotal group
- [ ] Mixed 6%/21% quote shows two subtotal groups
- [ ] Finalize is blocked until customer name and address are filled in
- [ ] Finalizing produces a downloadable PDF
- [ ] PDF letterhead shows company name, address, BTW number
- [ ] PDF shows the 6% attestation notice when any line is at 6%
- [ ] PDF totals match the on-screen totals exactly
- [ ] A finalized quote is read-only

## Observability
- [ ] pipeline_events has rows for upload, transcribe, extract, tts_generate,
      clarification_answer, and pdf_generate for the test quote
- [ ] Forcing a failure (e.g. a bad OPENAI_API_KEY) writes an error row with a
      usable message
```

- [ ] **Step 3: Work through the checklist on real hardware**

Tick each box. Any failure becomes a bug to fix before v1 ships — fix it, then re-run the affected section.

- [ ] **Step 4: Commit the completed checklist**

```bash
git add docs/manual-test-checklist.md
git commit -m "docs: add manual device verification checklist"
```

---

## Plan self-review

**Spec coverage** — every section of the spec maps to at least one task:

| Spec requirement | Task |
|---|---|
| Next.js on Vercel, Supabase, Dutch UI | 1, 22 |
| Six-table data model, RLS | 2 |
| Per-line VAT (6%/21%), totals per rate | 3, 14 |
| Materials/labor as separate rows | 4 |
| Auth (Supabase, real accounts) | 5 |
| Contractor business details for PDF | 6 |
| Catalog: manual entry, VAT per item | 7 |
| pipeline_events logging for remote debugging | 8, and every route |
| Whisper transcription (Dutch) | 9 |
| Claude extraction, catalog matching, clarification generation | 10 |
| Synchronous pipeline route (Approach A) | 11 |
| Mobile recording UI | 12, 13 |
| Editable line items, unmatched flagged | 14 |
| OpenAI TTS, Dutch questions spoken | 15 |
| Turn-by-turn answer loop, 2-retry cap | 16, 17 |
| Text checklist fallback | 17 |
| Customer details, finalize gate, immutable final | 18 |
| PDF via @react-pdf/renderer, per-rate totals, 6% notice | 19, 20 |
| PDF failure doesn't block finalizing; regenerate on demand | 20 |
| Audio deleted after transcription | 23 |
| Error handling: mic denied, empty catalog, extraction failure, TTS failure, retry cap, PDF failure | 12, 13, 11, 17, 20 |
| Unit tests, mocked integration tests, manual device gate | throughout, 24 |

**Placeholder scan** — no TBDs; every code step contains complete, runnable code.

**Type consistency** — names verified across tasks: `VatRate`/`isVatRate` (T2) used in T3, T7, T14; `TotalsLineItem`/`calculateTotals`/`formatEuros` (T3) used in T14, T19; `ExtractedTask`/`NewLineItem`/`expandTasksToLineItems` (T4) used in T10, T11, T16; `requireContractor`/`UnauthorizedError` (T5) used in every route; `logPipelineEvent` (T8) used in T11, T15, T16, T20, T23; `stripCodeFence`/`ExtractedTaskSchema` (T10) reused in T16; `toTotalsInput` (T14) reused in T19; `checkFinalizeGate` (T18) used in T18 route and T21.

**Two known follow-ups flagged inline rather than left ambiguous:**
- `src/lib/pdf/render` contains JSX and must be `render.tsx` (noted in T20 Step 1).
- If `toTotalsInput` cannot be imported from a `'use client'` module in the Node test environment, move it to `src/lib/money/totals.ts` (noted in T19 Step 4).
