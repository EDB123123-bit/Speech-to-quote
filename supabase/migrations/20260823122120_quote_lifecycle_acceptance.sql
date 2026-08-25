-- Quote lifecycle and public customer acceptance foundation.
-- Migration version aligned with the hosted production history.
-- This migration is additive and keeps legacy final quotes as final.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  address text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_name_check check (char_length(btrim(name)) between 1 and 200),
  constraint customers_normalized_name_check check (char_length(btrim(normalized_name)) between 1 and 200),
  constraint customers_contractor_name_key unique (contractor_id, normalized_name)
);

create index if not exists customers_contractor_idx
  on public.customers (contractor_id, updated_at desc);

alter table public.quotes
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists quotes_customer_idx on public.quotes(customer_id, created_at desc);

-- Backfill stable customer identities for legacy quotes without changing their
-- customer snapshot fields. The newest snapshot wins for contact details.
insert into public.customers (contractor_id, name, normalized_name, address, email, phone)
select distinct on (q.contractor_id, lower(regexp_replace(btrim(q.customer_name), '\s+', ' ', 'g')))
  q.contractor_id,
  btrim(q.customer_name),
  lower(regexp_replace(btrim(q.customer_name), '\s+', ' ', 'g')),
  q.customer_address,
  q.customer_email,
  q.customer_phone
from public.quotes q
where nullif(btrim(q.customer_name), '') is not null
order by
  q.contractor_id,
  lower(regexp_replace(btrim(q.customer_name), '\s+', ' ', 'g')),
  q.created_at desc
on conflict (contractor_id, normalized_name) do nothing;

update public.quotes q
set customer_id = c.id
from public.customers c
where q.customer_id is null
  and q.status <> 'accepted'
  and q.contractor_id = c.contractor_id
  and nullif(btrim(q.customer_name), '') is not null
  and c.normalized_name = lower(regexp_replace(btrim(q.customer_name), '\s+', ' ', 'g'));

create table if not exists public.quote_acceptance_tokens (
  quote_id uuid primary key references public.quotes(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quote_acceptance_tokens_hash_idx
  on public.quote_acceptance_tokens(token_hash);

alter table public.quote_acceptance_tokens enable row level security;
revoke all on public.quote_acceptance_tokens from public, anon, authenticated;
grant all on public.quote_acceptance_tokens to service_role;

create table if not exists public.quote_delivery_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  recipient text not null,
  provider text not null check (provider in ('gmail', 'outlook', 'share')),
  message_id text,
  sent_at timestamptz not null default now()
);

create index if not exists quote_delivery_events_quote_idx
  on public.quote_delivery_events(quote_id, sent_at desc);

alter table public.quote_delivery_events enable row level security;
create policy quote_delivery_events_own_read on public.quote_delivery_events
  for select to authenticated
  using (contractor_id = (select auth.uid()));
revoke insert, update, delete on public.quote_delivery_events from anon, authenticated;
grant select on public.quote_delivery_events to authenticated;
grant all on public.quote_delivery_events to service_role;

create table if not exists public.contractor_notifications (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete cascade,
  notification_type text not null check (notification_type in ('quote_accepted')),
  title text not null,
  body text not null,
  href text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint contractor_notifications_quote_type_key unique (contractor_id, quote_id, notification_type)
);

create index if not exists contractor_notifications_inbox_idx
  on public.contractor_notifications(contractor_id, read_at, created_at desc);

alter table public.contractor_notifications enable row level security;
create policy contractor_notifications_own_select on public.contractor_notifications
  for select to authenticated
  using (contractor_id = (select auth.uid()));
create policy contractor_notifications_own_update on public.contractor_notifications
  for update to authenticated
  using (contractor_id = (select auth.uid()))
  with check (contractor_id = (select auth.uid()));
revoke insert, delete on public.contractor_notifications from anon, authenticated;
grant select, update on public.contractor_notifications to authenticated;
grant all on public.contractor_notifications to service_role;

-- Commercial quote rows can only be edited while draft. Lifecycle operations
-- that cross into sent/accepted use the narrowly-scoped server-only functions
-- below, while accepted rows remain protected by the existing triggers.
drop policy if exists quotes_own on public.quotes;
create policy quotes_own_select on public.quotes
  for select to authenticated
  using (contractor_id = (select auth.uid()));
create policy quotes_own_insert on public.quotes
  for insert to authenticated
  with check (contractor_id = (select auth.uid()) and status = 'draft');
create policy quotes_own_update_draft on public.quotes
  for update to authenticated
  using (contractor_id = (select auth.uid()) and status = 'draft')
  with check (contractor_id = (select auth.uid()) and status in ('draft', 'final'));
create policy quotes_own_delete_draft on public.quotes
  for delete to authenticated
  using (contractor_id = (select auth.uid()) and status = 'draft');

drop policy if exists quote_line_items_own on public.quote_line_items;
create policy quote_line_items_own_select on public.quote_line_items
  for select to authenticated
  using (exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.contractor_id = (select auth.uid())
  ));
create policy quote_line_items_own_insert_draft on public.quote_line_items
  for insert to authenticated
  with check (exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.contractor_id = (select auth.uid()) and q.status = 'draft'
  ));
create policy quote_line_items_own_update_draft on public.quote_line_items
  for update to authenticated
  using (exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.contractor_id = (select auth.uid()) and q.status = 'draft'
  ))
  with check (exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.contractor_id = (select auth.uid()) and q.status = 'draft'
  ));
create policy quote_line_items_own_delete_draft on public.quote_line_items
  for delete to authenticated
  using (exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.contractor_id = (select auth.uid()) and q.status = 'draft'
  ));

drop policy if exists quote_clarifications_own on public.quote_clarifications;
create policy quote_clarifications_own_select on public.quote_clarifications
  for select to authenticated
  using (exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.contractor_id = (select auth.uid())
  ));
create policy quote_clarifications_own_insert_draft on public.quote_clarifications
  for insert to authenticated
  with check (exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.contractor_id = (select auth.uid()) and q.status = 'draft'
  ));
create policy quote_clarifications_own_update_draft on public.quote_clarifications
  for update to authenticated
  using (exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.contractor_id = (select auth.uid()) and q.status = 'draft'
  ))
  with check (exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.contractor_id = (select auth.uid()) and q.status = 'draft'
  ));
create policy quote_clarifications_own_delete_draft on public.quote_clarifications
  for delete to authenticated
  using (exists (
    select 1 from public.quotes q
    where q.id = quote_id and q.contractor_id = (select auth.uid()) and q.status = 'draft'
  ));

alter table public.customers enable row level security;
create policy customers_own_select on public.customers
  for select to authenticated
  using (contractor_id = (select auth.uid()));
create policy customers_own_insert on public.customers
  for insert to authenticated
  with check (contractor_id = (select auth.uid()));
create policy customers_own_update on public.customers
  for update to authenticated
  using (contractor_id = (select auth.uid()))
  with check (contractor_id = (select auth.uid()));
revoke delete on public.customers from anon, authenticated;
grant select, insert, update on public.customers to authenticated;
grant all on public.customers to service_role;

-- Server-only transition after a provider confirms delivery. Resends of an
-- already-sent quote record another delivery event without changing status.
create or replace function public.mark_quote_sent(
  p_quote_id uuid,
  p_contractor_id uuid,
  p_recipient text,
  p_provider text,
  p_message_id text default null
)
returns table (quote_id uuid, status text, sent_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_sent_at timestamptz;
begin
  select q.status, q.sent_at
  into v_status, v_sent_at
  from public.quotes q
  where q.id = p_quote_id and q.contractor_id = p_contractor_id
  for update;

  if not found then
    raise exception 'quote_not_found';
  end if;

  if v_status = 'final' then
    update public.quotes q
    set status = 'sent', sent_at = coalesce(q.sent_at, now())
    where q.id = p_quote_id;
    select q.status, q.sent_at into v_status, v_sent_at
    from public.quotes q where q.id = p_quote_id;
  elsif v_status <> 'sent' then
    raise exception 'invalid_quote_send_state';
  end if;

  insert into public.quote_delivery_events (quote_id, contractor_id, recipient, provider, message_id)
  values (p_quote_id, p_contractor_id, btrim(p_recipient), p_provider, p_message_id);

  return query select p_quote_id, v_status, v_sent_at;
end;
$$;

-- Public acceptance is deliberately callable only by the server-role client.
-- The function locks the quote row, making repeated and concurrent acceptance
-- requests idempotent while the existing lifecycle/task triggers run once.
create or replace function public.accept_quote_by_token_hash(p_token_hash text)
returns table (
  quote_id uuid,
  contractor_id uuid,
  quote_status text,
  customer_name text,
  customer_email text,
  quote_number text,
  accepted_at timestamptz,
  already_accepted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
begin
  if p_token_hash is null or btrim(p_token_hash) = '' then
    raise exception 'invalid_acceptance_token';
  end if;

  select q.*
  into v_quote
  from public.quotes q
  join public.quote_acceptance_tokens t on t.quote_id = q.id
  where t.token_hash = btrim(p_token_hash)
  for update of q;

  if not found then
    raise exception 'invalid_acceptance_token';
  end if;

  if v_quote.status = 'accepted' then
    return query select v_quote.id, v_quote.contractor_id, v_quote.status,
      v_quote.customer_name, v_quote.customer_email, v_quote.quote_number,
      v_quote.accepted_at, true;
    return;
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'quote_not_sent';
  end if;

  update public.quotes q
  set status = 'accepted'
  where q.id = v_quote.id;

  insert into public.contractor_notifications (
    contractor_id, quote_id, notification_type, title, body, href
  ) values (
    v_quote.contractor_id,
    v_quote.id,
    'quote_accepted',
    'Offerte aanvaard',
    coalesce(v_quote.customer_name, 'De klant') || ' heeft offerte ' || coalesce(v_quote.quote_number, left(v_quote.id::text, 8)) || ' aanvaard.',
    '/offertes/' || v_quote.id::text
  )
  on conflict on constraint contractor_notifications_quote_type_key do nothing;

  select q.* into v_quote from public.quotes q where q.id = v_quote.id;
  return query select v_quote.id, v_quote.contractor_id, v_quote.status,
    v_quote.customer_name, v_quote.customer_email, v_quote.quote_number,
    v_quote.accepted_at, false;
end;
$$;

revoke all on function public.mark_quote_sent(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_quote_sent(uuid, uuid, text, text, text) to service_role;
revoke all on function public.accept_quote_by_token_hash(text) from public, anon, authenticated;
grant execute on function public.accept_quote_by_token_hash(text) to service_role;
