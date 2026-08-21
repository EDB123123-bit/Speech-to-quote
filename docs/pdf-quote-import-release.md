# PDF quote import release runbook

The importer stays disabled until the database migration, provider smoke test,
and document acceptance set have passed. Enabling the flag only exposes the UI;
it does not bypass review or create finalized quotes.

## Processing modes

- 1–20 selected quotes: synchronous Haiku extraction with deterministic checks
  and a Sonnet retry only when material fields remain uncertain.
- 21–25 selected quotes: one asynchronous Sonnet Message Batch job per PDF.
  Provider processing can take up to 24 hours.
- Every result remains a reviewed, editable quote draft.

## Required server environment

```text
ANTHROPIC_API_KEY=...
QUOTE_IMPORT_ENABLED=false
QUOTE_IMPORT_FAST_MODEL=claude-haiku-4-5
QUOTE_IMPORT_FALLBACK_MODEL=claude-sonnet-5
QUOTE_IMPORT_BATCH_MODEL=claude-sonnet-5
```

Never expose `ANTHROPIC_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` as a
`NEXT_PUBLIC_` variable.

## Release order

1. Keep `QUOTE_IMPORT_ENABLED=false`.
2. Apply `20260820194848_reliable_bulk_quote_import.sql` once to the intended
   Supabase project.
3. Run CI, including the Supabase reset and pgTAP security suite.
4. Test one synthetic PDF synchronously and a 21-document synthetic batch.
5. Confirm source PDFs disappear after approving the resulting drafts.
6. Evaluate the 100-document anonymized/synthetic acceptance set.
7. Enable `QUOTE_IMPORT_ENABLED=true` only after the extraction thresholds in
   the implementation plan pass.

## Operational checks

- A batch row's `processing_mode` must be `interactive` at 20 and
  `provider_batch` at 21.
- Provider IDs and provider statuses can only be written by `service_role` RPCs.
- A stalled provider submission becomes claimable again after two minutes.
- Already submitted provider jobs are polled when the dashboard is open and by
  the daily cleanup cron as recovery.
- Failed provider results can be retried without creating a second quote.
- Exact duplicate PDFs must be marked `duplicate` and their temporary source
  object must be deleted.

## Safe rollback

Set `QUOTE_IMPORT_ENABLED=false`. Do not roll back or delete import tables while
temporary documents or audit records exist. The additive schema can remain in
place while the importer is disabled.
