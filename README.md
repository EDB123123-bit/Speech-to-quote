# Speech-to-quote

A Next.js app where Flemish roofworkers record a spoken job description and get back a
price quote (with line items and VAT) they can review, correct, and finalize as a PDF.
Voice → Whisper transcription → Claude extraction against the contractor's own price
catalog → an editable draft quote → a finalized PDF.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client + server). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key — used by the browser and by server routes acting as the signed-in contractor (RLS-scoped). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. Bypasses RLS — used only for writing `pipeline_events` and for the audio-cleanup cron job. Server-only, never expose to the browser. |
| `OPENAI_API_KEY` | Whisper transcription and TTS. |
| `ANTHROPIC_API_KEY` | Claude extraction (matching spoken tasks to catalog items). |
| `EXTRACTION_MODEL` | Claude model id used for extraction, e.g. `claude-sonnet-5`. |
| `TRANSCRIPTION_MODEL` | Whisper model id, e.g. `whisper-1`. |
| `TTS_MODEL` | TTS model id, e.g. `gpt-4o-mini-tts`. |
| `TTS_VOICE` | TTS voice name, e.g. `alloy`. |
| `CRON_SECRET` | Bearer token required by the audio-cleanup cron route (see below). |

## Database setup

Migrations live in `supabase/migrations/` and cover the schema, RLS policies, and the
`quote-audio` / `quote-pdfs` storage buckets with their own RLS policies (storage RLS is
enabled by default with zero permissive policies — the app cannot upload or download
anything without them).

Apply them to your Supabase project with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

or apply each file's SQL directly via the Supabase SQL editor / MCP `apply_migration` if
you're not using the CLI. Always apply migrations in filename order.

## Running locally

```bash
npm install
npm run dev
```

Run the test suite with `npm test`, type-check with `npx tsc --noEmit`, and lint with
`npx eslint`.

## Vercel cron: audio cleanup

`vercel.json` schedules `GET /api/cron/cleanup-audio` daily at 03:00 UTC to delete
transcribed recordings past their retention window. Vercel calls cron routes with an
`Authorization: Bearer <CRON_SECRET>` header automatically when `CRON_SECRET` is set as
a project environment variable in the Vercel dashboard (Project Settings → Environment
Variables) — set it there for every environment the cron runs in (typically
Production). The route itself checks that header and returns 401 if it's missing or
wrong, so the job is a no-op until the secret is configured.
