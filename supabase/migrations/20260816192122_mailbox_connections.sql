-- One send-only Gmail or Outlook connection per contractor.
-- OAuth tokens are deliberately inaccessible to anon/authenticated clients;
-- only server code using the service-role client may read or mutate this table.
create table public.mailbox_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail', 'outlook')),
  access_token text not null,
  refresh_token text not null,
  email_address text not null,
  token_expires_at timestamptz not null,
  status text not null default 'connected'
    check (status in ('connected', 'disconnected')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mailbox_connections enable row level security;

revoke all on table public.mailbox_connections from anon, authenticated;
grant select, insert, update, delete on table public.mailbox_connections to service_role;

-- Email delivery is part of the quote pipeline and should be visible in the
-- existing owner-scoped pipeline log.
alter table public.pipeline_events
  drop constraint if exists pipeline_events_step_check;

alter table public.pipeline_events
  add constraint pipeline_events_step_check check (step in (
    'upload', 'transcribe', 'extract', 'clarification_answer',
    'tts_generate', 'pdf_generate', 'audio_cleanup', 'email_send'
  ));
