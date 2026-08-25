-- Explicit Gmail -> draft quote import. Gmail is read only when the user asks
-- Migration version aligned with the hosted production history.
-- for it; there is no inbox monitor or background scanner.

alter table public.quotes drop constraint if exists quotes_source_check;
alter table public.quotes
  add constraint quotes_source_check
  check (source in ('voice', 'manual', 'pdf_import', 'gmail'));

alter table public.mailbox_connections
  add column if not exists is_default boolean not null default true,
  add column if not exists oauth_scope text,
  add column if not exists gmail_read_enabled boolean not null default false;

-- Older deployments had one connection per user. Preserve the existing row as
-- the outbound default while allowing one connection per user/provider.
alter table public.mailbox_connections
  drop constraint if exists mailbox_connections_user_id_key;
create unique index if not exists mailbox_connections_user_provider_idx
  on public.mailbox_connections (user_id, provider);
create unique index if not exists mailbox_connections_default_idx
  on public.mailbox_connections (user_id) where is_default;

create table if not exists public.gmail_quote_imports (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  mailbox_connection_id uuid not null references public.mailbox_connections(id) on delete restrict,
  gmail_message_id text not null,
  gmail_thread_id text,
  sender text not null,
  subject text not null,
  received_at timestamptz not null,
  body_hash text not null check (body_hash ~ '^[0-9a-f]{64}$'),
  body_text text not null default '',
  quote_id uuid unique references public.quotes(id) on delete set null,
  status text not null default 'imported' check (status in ('imported', 'failed')),
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mailbox_connection_id, gmail_message_id)
);
create index if not exists gmail_quote_imports_contractor_idx
  on public.gmail_quote_imports (contractor_id, received_at desc);
create index if not exists gmail_quote_imports_quote_idx
  on public.gmail_quote_imports (quote_id) where quote_id is not null;

create table if not exists public.quote_attachments (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  gmail_import_id uuid references public.gmail_quote_imports(id) on delete set null,
  filename text not null check (char_length(btrim(filename)) between 1 and 255),
  mime_type text not null check (char_length(btrim(mime_type)) between 1 and 255),
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique,
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'processed', 'unsupported', 'failed')),
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quote_attachments_quote_idx
  on public.quote_attachments (contractor_id, quote_id, created_at);
create index if not exists quote_attachments_import_idx
  on public.quote_attachments (gmail_import_id) where gmail_import_id is not null;

alter table public.gmail_quote_imports enable row level security;
alter table public.quote_attachments enable row level security;

drop policy if exists gmail_quote_imports_own_select on public.gmail_quote_imports;
create policy gmail_quote_imports_own_select on public.gmail_quote_imports
  for select to authenticated
  using (contractor_id = (select auth.uid()));
drop policy if exists quote_attachments_own_select on public.quote_attachments;
create policy quote_attachments_own_select on public.quote_attachments
  for select to authenticated
  using (contractor_id = (select auth.uid()));

revoke all on public.gmail_quote_imports from anon, authenticated;
grant select on public.gmail_quote_imports to authenticated;
grant all on public.gmail_quote_imports to service_role;
revoke all on public.quote_attachments from anon, authenticated;
grant select on public.quote_attachments to authenticated;
grant all on public.quote_attachments to service_role;

create or replace function public.create_gmail_quote_import(
  p_contractor_id uuid,
  p_mailbox_connection_id uuid,
  p_gmail_message_id text,
  p_gmail_thread_id text,
  p_sender text,
  p_subject text,
  p_received_at timestamptz,
  p_body_hash text,
  p_body_text text,
  p_customer_id uuid default null,
  p_customer_name text default null,
  p_customer_address text default null,
  p_customer_email text default null,
  p_customer_phone text default null
)
returns table (import_id uuid, quote_id uuid, already_exists boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.gmail_quote_imports%rowtype;
  v_quote_id uuid;
  v_import_id uuid;
begin
  if not exists (
    select 1 from public.mailbox_connections m
    where m.id = p_mailbox_connection_id
      and m.user_id = p_contractor_id
      and m.provider = 'gmail'
  ) then raise exception 'gmail_connection_mismatch'; end if;
  if p_gmail_message_id is null or btrim(p_gmail_message_id) = '' then raise exception 'gmail_message_id_required'; end if;
  if p_body_hash is null or p_body_hash !~ '^[0-9a-f]{64}$' then raise exception 'gmail_body_hash_invalid'; end if;

  select gi.* into v_existing
  from public.gmail_quote_imports gi
  where gi.mailbox_connection_id = p_mailbox_connection_id
    and gi.gmail_message_id = btrim(p_gmail_message_id)
  for update;
  if found then
    return query select v_existing.id, v_existing.quote_id, true;
    return;
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.contractor_id = p_contractor_id
  ) then raise exception 'gmail_customer_mismatch'; end if;

  insert into public.quotes (
    contractor_id, customer_id, transcript, status, source, issue_date,
    customer_name, customer_address, customer_email, customer_phone
  ) values (
    p_contractor_id, p_customer_id, nullif(btrim(p_body_text), ''), 'draft', 'gmail',
    (p_received_at at time zone 'Europe/Brussels')::date,
    nullif(btrim(p_customer_name), ''), nullif(btrim(p_customer_address), ''),
    nullif(btrim(p_customer_email), ''), nullif(btrim(p_customer_phone), '')
  ) returning id into v_quote_id;

  insert into public.gmail_quote_imports (
    contractor_id, mailbox_connection_id, gmail_message_id, gmail_thread_id,
    sender, subject, received_at, body_hash, body_text, quote_id
  ) values (
    p_contractor_id, p_mailbox_connection_id, btrim(p_gmail_message_id),
    nullif(btrim(p_gmail_thread_id), ''), btrim(p_sender), btrim(p_subject),
    p_received_at, p_body_hash, coalesce(p_body_text, ''), v_quote_id
  ) returning id into v_import_id;

  return query select v_import_id, v_quote_id, false;
end;
$$;

revoke execute on function public.create_gmail_quote_import(uuid, uuid, text, text, text, text, timestamptz, text, text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_gmail_quote_import(uuid, uuid, text, text, text, text, timestamptz, text, text, uuid, text, text, text, text) to service_role;

create or replace function public.touch_gmail_quote_import_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists gmail_quote_imports_touch on public.gmail_quote_imports;
create trigger gmail_quote_imports_touch before update on public.gmail_quote_imports
for each row execute function public.touch_gmail_quote_import_updated_at();
drop trigger if exists quote_attachments_touch on public.quote_attachments;
create trigger quote_attachments_touch before update on public.quote_attachments
for each row execute function public.touch_gmail_quote_import_updated_at();

insert into storage.buckets (id, name, public)
values ('quote-attachments', 'quote-attachments', false)
on conflict (id) do update set public = false;

-- No browser-role storage policies are intentional. Attachment downloads go
-- through an authenticated server route after quote ownership is verified.
