-- Quote tasks are internal operational records. They are deliberately separate
-- from customer-facing quote lines and only become globally active after the
-- linked quote is accepted.

alter table public.quotes
  drop constraint if exists quotes_status_check;

alter table public.quotes
  add constraint quotes_status_check
    check (status in ('draft', 'final', 'sent', 'accepted'));

alter table public.quotes
  add column if not exists finalized_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists accepted_at timestamptz;

create table public.quote_tasks (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  title text not null,
  status text not null default 'todo',
  due_date date,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_tasks_title_check
    check (char_length(btrim(title)) between 1 and 200),
  constraint quote_tasks_status_check
    check (status in ('todo', 'done'))
);

create index quote_tasks_quote_idx
  on public.quote_tasks (quote_id, created_at);
create index quote_tasks_active_overview_idx
  on public.quote_tasks (contractor_id, status, due_date, created_at)
  where activated_at is not null;
create index quote_tasks_open_deadline_idx
  on public.quote_tasks (contractor_id, due_date, quote_id)
  where activated_at is not null and status = 'todo';

alter table public.quote_tasks enable row level security;

create policy quote_tasks_own_select on public.quote_tasks
  for select to authenticated
  using (contractor_id = (select auth.uid()));

create policy quote_tasks_own_insert on public.quote_tasks
  for insert to authenticated
  with check (
    contractor_id = (select auth.uid())
    and exists (
      select 1
      from public.quotes q
      where q.id = quote_id
        and q.contractor_id = (select auth.uid())
    )
  );

create policy quote_tasks_own_update on public.quote_tasks
  for update to authenticated
  using (contractor_id = (select auth.uid()))
  with check (
    contractor_id = (select auth.uid())
    and exists (
      select 1
      from public.quotes q
      where q.id = quote_id
        and q.contractor_id = (select auth.uid())
    )
  );

create policy quote_tasks_own_delete on public.quote_tasks
  for delete to authenticated
  using (contractor_id = (select auth.uid()));

create or replace function public.prepare_quote_task()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_contractor_id uuid;
  linked_quote_status text;
begin
  if tg_op = 'UPDATE' then
    if new.quote_id is distinct from old.quote_id
      or new.contractor_id is distinct from old.contractor_id then
      raise exception 'quote_task_link_is_immutable';
    end if;
  end if;

  select q.contractor_id, q.status
  into linked_contractor_id, linked_quote_status
  from public.quotes q
  where q.id = new.quote_id;

  if linked_contractor_id is null then
    raise exception 'quote_not_found';
  end if;

  if tg_op = 'INSERT' then
    new.contractor_id := linked_contractor_id;
    new.activated_at := case
      when linked_quote_status = 'accepted' then now()
      else null
    end;
  elsif old.activated_at is null and linked_quote_status = 'accepted' then
    new.activated_at := now();
  else
    new.activated_at := old.activated_at;
  end if;

  new.title := btrim(new.title);
  new.updated_at := now();
  return new;
end;
$$;

create trigger quote_tasks_prepare
  before insert or update on public.quote_tasks
  for each row execute function public.prepare_quote_task();

create or replace function public.activate_prepared_quote_tasks()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from new.status then
    update public.quote_tasks
    set activated_at = coalesce(activated_at, now()),
        updated_at = now()
    where quote_id = new.id
      and activated_at is null;
  end if;
  return new;
end;
$$;

create trigger quotes_activate_prepared_tasks
  after update of status on public.quotes
  for each row execute function public.activate_prepared_quote_tasks();

create or replace function public.guard_quote_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'accepted' then
    raise exception 'accepted_quote_is_immutable';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status = 'final')
    or (old.status = 'final' and new.status = 'sent')
    or (old.status = 'sent' and new.status = 'accepted')
  ) then
    raise exception 'invalid_quote_status_transition';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'final' then
      new.finalized_at := coalesce(new.finalized_at, now());
    elsif new.status = 'sent' then
      new.sent_at := coalesce(new.sent_at, now());
    elsif new.status = 'accepted' then
      new.accepted_at := coalesce(new.accepted_at, now());
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger quotes_guard_lifecycle_update
  before update on public.quotes
  for each row execute function public.guard_quote_lifecycle();
create trigger quotes_guard_lifecycle_delete
  before delete on public.quotes
  for each row execute function public.guard_quote_lifecycle();

create or replace function public.guard_accepted_quote_content()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_quote_id uuid;
begin
  linked_quote_id := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
  if tg_op = 'UPDATE' and exists (
    select 1 from public.quotes q
    where q.id in (old.quote_id, new.quote_id) and q.status = 'accepted'
  ) then
    raise exception 'accepted_quote_content_is_immutable';
  elsif tg_op <> 'UPDATE' and exists (
    select 1 from public.quotes q
    where q.id = linked_quote_id and q.status = 'accepted'
  ) then
    raise exception 'accepted_quote_content_is_immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger quote_line_items_guard_accepted_quote
  before insert or update or delete on public.quote_line_items
  for each row execute function public.guard_accepted_quote_content();
create trigger quote_clarifications_guard_accepted_quote
  before insert or update or delete on public.quote_clarifications
  for each row execute function public.guard_accepted_quote_content();

revoke all on public.quote_tasks from anon;
grant select, insert, update, delete on public.quote_tasks to authenticated;
grant select, insert, update, delete on public.quote_tasks to service_role;

revoke execute on function public.prepare_quote_task() from public, anon, authenticated;
revoke execute on function public.activate_prepared_quote_tasks() from public, anon, authenticated;
revoke execute on function public.guard_quote_lifecycle() from public, anon, authenticated;
revoke execute on function public.guard_accepted_quote_content() from public, anon, authenticated;
