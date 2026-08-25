# Speech-to-quote

A Next.js app where Flemish roofworkers record a spoken job description and get back a
price quote (with line items and VAT) they can review, correct, and finalize as a PDF.
Voice, manual input, or an explicit Gmail import → an editable draft with job-specific
prices → a finalized PDF → sending and token-based customer acceptance.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (client + server). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key — used by the browser and by server routes acting as the signed-in contractor (RLS-scoped). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for server-owned lifecycle, private storage, mailbox, Gmail import, and cron operations. Bypasses RLS; server-only and never exposed to the browser. |
| `APP_URL` | Public production URL without a trailing slash. Used to build OAuth callback URLs. |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID for Gmail sending and explicit message import. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth web client secret. Server-only. |
| `AZURE_CLIENT_ID` | Microsoft Entra application (client) ID for Outlook sending. |
| `AZURE_CLIENT_SECRET` | Microsoft Entra client secret. Server-only. |
| `AZURE_TENANT_ID` | Microsoft tenant ID, or `common` to support work, school, and personal accounts. |
| `OPENAI_API_KEY` | Whisper transcription and TTS. |
| `ANTHROPIC_API_KEY` | Claude extraction for voice, Gmail attachments, and historical PDF imports. No catalogue lookup is performed for new quotes. |
| `EXTRACTION_MODEL` | Claude model id used for extraction, e.g. `claude-sonnet-5`. |
| `TRANSCRIPTION_MODEL` | Whisper model id, e.g. `whisper-1`. |
| `TTS_MODEL` | TTS model id, e.g. `gpt-4o-mini-tts`. |
| `TTS_VOICE` | TTS voice name, e.g. `alloy`. |
| `CRON_SECRET` | Bearer token required by the audio-cleanup cron route (see below). |

## Database setup

Migrations live in `supabase/migrations/` and cover the schema, RLS policies, and the
private Storage buckets. Draft audio remains tenant-writable; final quote PDFs,
supplier-order PDFs, Gmail attachments, and invoice artifacts are written by authenticated
server routes and exposed only through tenant-checked reads.

Apply them to your Supabase project with the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

or apply each file's SQL directly via the Supabase SQL editor / MCP `apply_migration` if
you're not using the CLI. Always apply migrations in filename order.

## Mailbox setup

The settings page lets each contractor connect one Gmail or Outlook mailbox. OAuth tokens
are stored in `mailbox_connections`, which has RLS enabled and grants no access to browser
roles; only authenticated server routes using the service-role client can access them.

### Gmail

1. Create a Web application OAuth client in Google Cloud and enable the Gmail API.
2. Configure the OAuth consent screen with `openid`, `email`,
   `https://www.googleapis.com/auth/gmail.send`, and
   `https://www.googleapis.com/auth/gmail.readonly`. Gmail is only read after the user
   explicitly opens the importer and selects a message; there is no inbox monitor.
3. Add this exact authorized redirect URI:
   `<APP_URL>/api/mailbox/connect/gmail`.
   For local development this is, for example,
   `http://localhost:3002/api/mailbox/connect/gmail`; the JavaScript origin is only
   `http://localhost:3002` (without a path or trailing slash).
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and the matching `APP_URL` in the
   environment where the app runs.
5. Reconnect Gmail after adding `gmail.readonly`, because an existing refresh token does
   not automatically gain the new permission.

### Outlook / Microsoft 365

1. Register a Web application in Microsoft Entra ID.
2. Add delegated Microsoft Graph permissions `Mail.Send` and `User.Read`.
3. Add this exact Web redirect URI:
   `<APP_URL>/api/mailbox/connect/outlook`.
4. Create a client secret and set `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and
   `AZURE_TENANT_ID` in Vercel.

Both providers also request offline access so expired access tokens can be refreshed without
interrupting the contractor. Outlook remains send-only in V1.

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
