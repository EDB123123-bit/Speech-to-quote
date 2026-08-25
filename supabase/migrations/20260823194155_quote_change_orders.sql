-- Meerwerkoffertes (change orders) reuse quotes and remain additive.
-- Migration version aligned with the hosted production history.
alter table public.quotes
  add column if not exists quote_kind text not null default 'standard',
  add column if not exists parent_quote_id uuid references public.quotes(id) on delete restrict;

alter table public.quotes drop constraint if exists quotes_quote_kind_check;
alter table public.quotes add constraint quotes_quote_kind_check
  check (quote_kind in ('standard', 'meerwerk'));

create index if not exists quotes_parent_quote_idx
  on public.quotes (parent_quote_id, created_at desc);

create or replace function public.validate_quote_family()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_row public.quotes%rowtype;
begin
  new.quote_kind := coalesce(new.quote_kind, 'standard');

  if tg_op = 'UPDATE' and (
    new.quote_kind is distinct from old.quote_kind
    or new.parent_quote_id is distinct from old.parent_quote_id
  ) then
    raise exception 'quote_family_link_is_immutable';
  end if;

  if new.quote_kind = 'standard' then
    if new.parent_quote_id is not null then
      raise exception 'standard_quote_cannot_have_parent';
    end if;
    return new;
  end if;

  if new.parent_quote_id is null then
    raise exception 'meerwerk_parent_required';
  end if;

  select p.* into parent_row
  from public.quotes p
  where p.id = new.parent_quote_id;

  if not found
    or parent_row.contractor_id is distinct from new.contractor_id
    or parent_row.status <> 'accepted'
    or parent_row.quote_kind <> 'standard'
    or parent_row.parent_quote_id is not null then
    raise exception 'meerwerk_parent_invalid';
  end if;

  -- A change order always uses an exact customer snapshot from the accepted
  -- original. This also prevents cross-customer edits through service role.
  new.customer_id := parent_row.customer_id;
  new.customer_name := parent_row.customer_name;
  new.customer_address := parent_row.customer_address;
  new.customer_email := parent_row.customer_email;
  new.customer_phone := parent_row.customer_phone;
  return new;
end;
$$;

drop trigger if exists quotes_validate_family on public.quotes;
create trigger quotes_validate_family
  before insert or update on public.quotes
  for each row execute function public.validate_quote_family();

-- Commercial edits to final/sent/accepted rows must not alter the family
-- relationship. Draft child customer snapshots are protected by the trigger
-- above as well.
create or replace function public.guard_quote_commercial_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('final', 'sent', 'accepted') and (
    new.contractor_id is distinct from old.contractor_id
    or new.customer_id is distinct from old.customer_id
    or new.customer_name is distinct from old.customer_name
    or new.customer_address is distinct from old.customer_address
    or new.customer_email is distinct from old.customer_email
    or new.customer_phone is distinct from old.customer_phone
    or new.transcript is distinct from old.transcript
    or new.source is distinct from old.source
    or new.quote_number is distinct from old.quote_number
    or new.issue_date is distinct from old.issue_date
    or new.valid_until is distinct from old.valid_until
    or new.order_reference is distinct from old.order_reference
    or new.audio_path is distinct from old.audio_path
    or new.audio_deleted_at is distinct from old.audio_deleted_at
    or new.quote_kind is distinct from old.quote_kind
    or new.parent_quote_id is distinct from old.parent_quote_id
    or (new.status is not distinct from old.status and new.finalized_at is distinct from old.finalized_at)
    or (new.status is not distinct from old.status and new.sent_at is distinct from old.sent_at)
    or (new.status is not distinct from old.status and new.accepted_at is distinct from old.accepted_at)
  ) then
    raise exception 'quote_commercial_content_is_immutable';
  end if;
  return new;
end;
$$;

-- Authenticated users can create normal drafts directly. Meerwerk drafts are
-- created by the server-only RPC so the accepted-parent checks are centralized.
drop policy if exists quotes_own_insert on public.quotes;
create policy quotes_own_insert on public.quotes
  for insert to authenticated
  with check (
    contractor_id = (select auth.uid())
    and status = 'draft'
    and quote_kind = 'standard'
    and parent_quote_id is null
  );

create or replace function public.create_meerwerk_quote(
  p_parent_quote_id uuid,
  p_contractor_id uuid
)
returns table (quote_id uuid, quote_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_row public.quotes%rowtype;
  candidate text;
  suffix integer := 1;
  new_id uuid := gen_random_uuid();
begin
  select p.* into parent_row
  from public.quotes p
  where p.id = p_parent_quote_id and p.contractor_id = p_contractor_id
  for share;

  if not found
    or parent_row.status <> 'accepted'
    or parent_row.quote_kind <> 'standard'
    or parent_row.parent_quote_id is not null then
    raise exception 'meerwerk_parent_invalid';
  end if;

  -- Serialize numbering per accepted original while retaining the existing
  -- contractor-wide unique quote-number index as the final race guard.
  perform pg_advisory_xact_lock(hashtextextended(p_parent_quote_id::text, 0));
  loop
    candidate := coalesce(parent_row.quote_number, upper(left(parent_row.id::text, 8))) || '-M' || suffix::text;
    exit when not exists (
      select 1 from public.quotes q
      where q.contractor_id = p_contractor_id and lower(q.quote_number) = lower(candidate)
    );
    suffix := suffix + 1;
  end loop;

  insert into public.quotes (
    id, contractor_id, customer_id, status, source, quote_kind, parent_quote_id,
    quote_number, issue_date, customer_name, customer_address, customer_email,
    customer_phone
  ) values (
    new_id, p_contractor_id, parent_row.customer_id, 'draft', 'manual', 'meerwerk', p_parent_quote_id,
    candidate, current_date, parent_row.customer_name, parent_row.customer_address,
    parent_row.customer_email, parent_row.customer_phone
  );

  return query select new_id, candidate;
end;
$$;

revoke all on function public.validate_quote_family() from public, anon, authenticated;
revoke all on function public.create_meerwerk_quote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_meerwerk_quote(uuid, uuid) to service_role;
