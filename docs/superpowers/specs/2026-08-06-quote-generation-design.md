# Speech-to-quote: v1 design — voice-generated quotes for roofworkers

## Purpose

Flemish contractors need to turn a spoken, on-site job description into a
priced quote without manual data entry. v1 targets a single trade
(roofworker / dakwerker) end to end: record a spoken job description, get
back a structured, editable price quote as a PDF, with an AI voice
conversation resolving anything the extraction is unsure about.

Other trades (plumber, electrician, PV installer) and multi-trade support
are explicitly out of scope for v1 — this spec covers one trade end to end
so the pipeline can be validated before generalizing.

## Scope

**In scope for v1:**
- Single trade: roofworker (dakwerker)
- Mobile-first web app (not a native app)
- Contractor's own price catalog (manually entered), not a generic market
  price database
- Voice recording → transcription → AI extraction → editable line-item
  quote → PDF
- A voice-driven clarification loop for items the extraction is unsure
  about or thinks may be missing
- Per-line-item VAT (6%/21%), customer details, contractor business
  details, PDF generation
- Structured pipeline logging for remote troubleshooting

**Explicitly out of scope for v1** (candidate follow-up sub-projects):
- Other trades / multi-trade support
- A built-in generic pricing database
- Sending/tracking quotes to customers (email, e-signature, status
  tracking)
- CSV/spreadsheet catalog import
- Learning/feedback loop that improves extraction matching over time
- An in-app admin log viewer (logs are queried directly in Supabase for
  v1)

## Architecture

Stack: Next.js app (Dutch UI) deployed on Vercel. Supabase for Postgres
(catalog, quotes, contractors), Auth (email/password), and Storage (audio
recordings, generated PDFs).

Core pipeline — one API route owns the whole synchronous flow; the client
only records audio and renders/edits results. No background jobs, no
polling (this scope doesn't need Approach B / async jobs — recordings are
short, single-job descriptions).

```
Contractor (phone browser)
   │  1. Record voice description (MediaRecorder API)
   ▼
Next.js API route: POST /api/quotes/generate
   │  2. Upload audio to Supabase Storage
   │  3. Transcribe via OpenAI Whisper API → Dutch transcript
   │  4. Fetch contractor's catalog items from Supabase
   │  5. Call Claude with transcript + catalog → structured line items
   │     (matched catalog items w/ quantities, unmatched items flagged,
   │     plus a list of clarifications — things the model is unsure
   │     about or suspects are missing)
   ▼
Response: draft quote (JSON) + pending clarifications
   │
   ▼
Client renders editable quote screen (line items + clarification
checklist, both visible)
```

### Voice clarification loop

For each pending clarification, in order (one at a time, not a single
batched recording):

```
1. GET /api/quotes/:id/clarifications/:cid/prompt-audio
     → server sends the Dutch question text to OpenAI TTS → returns audio
2. Client plays the audio, then records the contractor's spoken answer
3. POST /api/quotes/:id/clarifications/:cid/answer   (uploads answer audio)
     → server transcribes it via Whisper
     → calls Claude with: original transcript, this question, the answer
       transcript, current line items, and the catalog
     → Claude returns updated/new line item(s) and resolves the
       clarification, OR — if the answer doesn't actually address the
       question — keeps it 'pending' with a rephrased follow-up
4. Client updates the visible checklist + line items, moves to the next
   pending clarification (or stops once none remain)
```

Each turn is a stateless request/response — the "conversation" is just the
client sequencing calls one clarification at a time. Retries are capped at
2 per clarification; beyond that it's left `pending` and must be resolved
manually via the on-screen checklist (kept visible throughout as a
fallback — see Error Handling).

A quote cannot move from `draft` to `final` while any clarification is
neither `resolved` nor `dismissed`. This confirmation gate is what
prevents a quote with a known gap from silently going out.

### Finalization & PDF

Once all clarifications are resolved/dismissed and a VAT rate is set on
every line item, the contractor finalizes the quote (`status` →
`'final'`, immutable from that point — further changes require a new
quote). On finalize, the server generates a PDF using
`@react-pdf/renderer` (pure-JS, layout-as-React-components; avoids the
overhead of a headless-Chromium approach on Vercel's serverless
functions). The PDF is stored in Supabase Storage and linked from the
quote record, downloadable/re-downloadable at any time.

PDF contents: contractor letterhead (name, address, BTW/KBO number,
phone), customer details, line items grouped by task (materials/labor as
separate rows, each with its own VAT rate), subtotals per VAT rate, grand
total, quote date.

## Data model (Supabase / Postgres)

```
contractors                     (extends Supabase auth.users)
  id            uuid PK (= auth.users.id)
  company_name  text
  address       text
  vat_number    text        -- BTW/KBO nummer
  phone         text
  created_at    timestamptz

catalog_items                   (contractor's own price list)
  id              uuid PK
  contractor_id   uuid FK → contractors.id
  name            text        -- e.g. "Dakpannen leggen (kleitegels)"
  unit            text        -- e.g. "m²", "stuk", "uur"
  materials_price numeric     -- € per unit
  labor_price     numeric     -- € per unit
  vat_rate        numeric     -- 0.06 or 0.21; set explicitly, no default
  created_at      timestamptz

quotes
  id               uuid PK
  contractor_id    uuid FK → contractors.id
  transcript       text        -- raw Whisper transcript, kept for audit/debugging
  status           text        -- 'draft' | 'final'
  customer_name    text
  customer_address text
  customer_email   text        -- nullable
  customer_phone   text        -- nullable
  pdf_url          text        -- nullable until finalized
  created_at       timestamptz

quote_line_items
  id               uuid PK
  quote_id         uuid FK → quotes.id
  catalog_item_id  uuid FK → catalog_items.id, nullable  -- null if unmatched/custom
  description      text        -- editable label shown on the quote
  quantity         numeric
  unit             text
  materials_price  numeric     -- copied from catalog at generation time, editable
  labor_price      numeric     -- copied from catalog at generation time, editable
  vat_rate         numeric     -- copied from catalog at generation time, editable;
                                -- required before finalizing if item was added ad hoc
  line_type        text        -- 'materials' | 'labor'

quote_clarifications
  id            uuid PK
  quote_id      uuid FK → quotes.id
  question_nl   text        -- current question text (replaced on retry/rephrase)
  status        text        -- 'pending' | 'resolved' | 'dismissed'
  retry_count   int default 0
  created_at    timestamptz

pipeline_events                 (structured logs for remote troubleshooting)
  id            uuid PK
  quote_id      uuid FK → quotes.id, nullable  -- null for pre-quote errors
  contractor_id uuid FK → contractors.id
  step          text    -- 'upload' | 'transcribe' | 'extract'
                         -- | 'clarification_answer' | 'tts_generate' | 'pdf_generate'
  status        text    -- 'success' | 'error'
  detail        jsonb   -- transcript excerpt, raw model response, error message/
                         -- stack, retry count, timing
  created_at    timestamptz
```

Notes:
- `materials_price`, `labor_price`, and `vat_rate` are copied onto the
  line item at generation time (not just referenced via
  `catalog_item_id`), so later edits to the catalog don't retroactively
  change past quotes.
- Materials and labor for the same task become two `quote_line_items`
  rows (e.g. "Dakpannen leggen – materiaal" / "Dakpannen leggen –
  arbeid"), independently editable, each with its own VAT rate.
- Totals are computed per VAT rate (subtotal-at-6%, subtotal-at-21%, VAT
  amount per rate, grand total) rather than one blanket rate for the
  whole quote.

## Extraction & catalog matching

Claude receives the raw Dutch transcript and the contractor's full
catalog (name/unit/prices/VAT rate) as structured context, and is
instructed to:

1. Identify distinct tasks/materials mentioned, with quantities (e.g. "80
   vierkante meter", "3 dakramen").
2. Match each to the closest `catalog_item` by meaning, not exact string
   match (e.g. "pannen leggen" should match "Dakpannen leggen
   (kleitegels)").
3. Return structured JSON: matched items get a `catalog_item_id` +
   quantity; unmatched items return just the raw description + quantity,
   with price fields left empty for the contractor to fill in — the model
   never invents prices.
4. Return a `clarifications` list for anything it's unsure about or
   suspects is missing, based on:
   - **Internal inconsistency** — a quantity mentioned without a
     material, or vice versa.
   - **Trade-domain gaps** — common companion items for a mentioned task
     that weren't mentioned (e.g. a new gutter usually needs downpipes/
     brackets too; a roof replacement often involves onderdak/isolatie).
     This is general roofing knowledge baked into the prompt, not a
     learned/tunable system.
   - **Low-confidence transcription** — a word Whisper transcribed with
     low confidence, or that doesn't parse as a real material/quantity.

On the review screen, matched items appear pre-filled and editable;
unmatched items appear in a visually distinct "needs review" section.
Clarifications appear as a "Te verduidelijken" checklist, resolved either
through the voice loop above or, as a fallback, by directly editing/
adding the relevant line item or dismissing the clarification as "niet
van toepassing."

Deliberately out of scope for v1: fuzzy-matching threshold tuning, a
learning/feedback loop that improves matching over time, and inventing
prices for items with zero relation to the contractor's catalog.

## Catalog setup

A simple manual entry form (settings page): add/edit catalog items (name,
unit, materials price, labor price, VAT rate). No CSV import, no seeded
demo catalog — the contractor must set up at least one catalog item
before recording a quote (see Error Handling).

## Auth

Real contractor accounts via Supabase Auth (email/password). Each
contractor's catalog and quotes are private to them.

## UI language

Dutch throughout — labels, buttons, clarification questions (spoken and
written), and the generated PDF.

## Error handling

- **Mic permission denied / no mic available:** clear message with
  instructions to enable mic access; app remains usable for manual text
  entry of line items as a fallback.
- **Whisper transcription fails or returns empty/garbage:** surface an
  error with a "probeer opnieuw" retry, keeping the recorded audio
  available for one retry without re-recording.
- **Claude extraction fails (API error, malformed response):** retry once
  server-side automatically; if it still fails, fall back to an empty
  draft quote with a message that automatic extraction failed and line
  items need to be added manually.
- **No catalog items exist yet:** prompt the contractor to add at least
  one catalog item before recording (extraction has nothing to match
  against otherwise).
- **TTS playback fails (audio blocked/unsupported browser):**
  clarification questions remain visible as text on the fallback
  checklist, so the contractor can resolve them by typing or recording an
  answer without needing to hear the question.
- **Clarification retry cap hit (2 retries):** item stays `pending`,
  clearly marked, and doesn't block other clarifications from being
  resolved — only blocks finalizing until handled manually.
- **PDF generation fails:** quote still finalizes (`status = 'final'`)
  with line items intact; PDF generation can be retried on demand from
  the quote view without redoing the quote.
- **Audio retention:** raw recordings in Supabase Storage are deleted
  after successful transcription (e.g. via a daily cleanup job); only the
  text transcript is retained long-term.

## Observability & remote debugging

Every pipeline step (upload, transcribe, extract, each clarification
turn, TTS generation, PDF generation) writes a row to `pipeline_events`
with step, status, and a `detail` payload (transcript excerpt, raw model
response, error message/stack, retry count, timing). Debugging is done by
querying this table directly via the Supabase dashboard/SQL editor — no
in-app admin UI for v1. Uncaught exceptions/crashes in the API routes are
separately captured by Vercel's platform logs, viewable via the Vercel
dashboard.

## Testing strategy

- **Unit tests** for all pure logic: totals/VAT-per-rate calculations,
  retry-cap logic for clarifications, data validation (e.g. a catalog
  item can't be saved without a VAT rate).
- **API route integration tests** with Whisper/Claude/TTS calls mocked —
  verifies pipeline wiring (upload → transcribe → extract → persist →
  respond) without hitting real external services.
- **Prompt evaluation (manual, not CI):** a small set of sample Dutch
  roofing transcripts, including messy/ambiguous ones, run against the
  real Claude extraction prompt to sanity-check matching quality and
  clarification triggering. Not a pass/fail automated test, since LLM
  output isn't deterministic.
- **Manual on-device testing:** mic recording, TTS playback, and the full
  voice conversation loop must be manually verified on an actual phone
  browser before v1 is considered done — this can't be fully automated
  and is called out as an explicit completion gate.
