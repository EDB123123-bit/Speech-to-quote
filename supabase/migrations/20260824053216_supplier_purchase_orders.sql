-- Supplier purchase orders (Bestellingen). A purchase order is always for one
-- Migration version aligned with the hosted production history.
-- exact quote and one supplier; quote lines are never copied into this model.
create table if not exists public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  order_number text not null,
  status text not null default 'draft',
  delivery_address text,
  notes text,
  email_subject text,
  email_body text,
  pdf_path text,
  pdf_sha256 text,
  pdf_version integer not null default 1,
  provider_message_id text,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_orders_status_check check (status in ('draft', 'sent')),
  constraint supplier_orders_order_number_check check (char_length(btrim(order_number)) between 1 and 100),
  constraint supplier_orders_pdf_sha256_check check (pdf_sha256 is null or pdf_sha256 ~ '^[0-9a-f]{64}$'),
  constraint supplier_orders_pdf_version_check check (pdf_version >= 1),
  constraint supplier_orders_cancelled_check check (cancelled_at is null or status = 'draft'),
  constraint supplier_orders_sent_timestamp_check check (status = 'draft' or sent_at is not null),
  unique (contractor_id, order_number)
);

create table if not exists public.supplier_order_lines (
  id uuid primary key default gen_random_uuid(),
  supplier_order_id uuid not null references public.supplier_orders(id) on delete cascade,
  material_requirement_id uuid references public.material_requirements(id) on delete restrict,
  description text not null,
  quantity numeric not null,
  unit text,
  purchase_unit_price_cents integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_order_lines_description_check check (char_length(btrim(description)) between 1 and 500),
  constraint supplier_order_lines_quantity_check check (quantity >= 0),
  constraint supplier_order_lines_purchase_price_check check (purchase_unit_price_cents is null or purchase_unit_price_cents >= 0)
);

create unique index if not exists supplier_order_lines_requirement_unique
  on public.supplier_order_lines (material_requirement_id)
  where material_requirement_id is not null;
create index if not exists supplier_orders_contractor_status_idx
  on public.supplier_orders (contractor_id, status, cancelled_at, created_at desc);
create index if not exists supplier_orders_supplier_idx
  on public.supplier_orders (contractor_id, supplier_id, status, sent_at desc);
create index if not exists supplier_orders_quote_idx
  on public.supplier_orders (contractor_id, quote_id, status, created_at desc);
create index if not exists supplier_order_lines_order_idx
  on public.supplier_order_lines (supplier_order_id, sort_order);
create index if not exists supplier_order_lines_requirement_idx
  on public.supplier_order_lines (material_requirement_id);

alter table public.supplier_orders enable row level security;
alter table public.supplier_order_lines enable row level security;

drop policy if exists supplier_orders_own_select on public.supplier_orders;
create policy supplier_orders_own_select on public.supplier_orders
  for select to authenticated
  using (contractor_id = (select auth.uid()));
drop policy if exists supplier_orders_own_insert on public.supplier_orders;
create policy supplier_orders_own_insert on public.supplier_orders
  for insert to authenticated
  with check (contractor_id = (select auth.uid()) and status = 'draft');
drop policy if exists supplier_orders_own_update on public.supplier_orders;
create policy supplier_orders_own_update on public.supplier_orders
  for update to authenticated
  using (contractor_id = (select auth.uid()) and status = 'draft' and cancelled_at is null)
  with check (contractor_id = (select auth.uid()) and status = 'draft');
drop policy if exists supplier_orders_own_delete on public.supplier_orders;
create policy supplier_orders_own_delete on public.supplier_orders
  for delete to authenticated
  using (contractor_id = (select auth.uid()) and status = 'draft');

drop policy if exists supplier_order_lines_own_select on public.supplier_order_lines;
create policy supplier_order_lines_own_select on public.supplier_order_lines
  for select to authenticated
  using (exists (
    select 1 from public.supplier_orders o
    where o.id = supplier_order_id and o.contractor_id = (select auth.uid())
  ));
drop policy if exists supplier_order_lines_own_insert on public.supplier_order_lines;
create policy supplier_order_lines_own_insert on public.supplier_order_lines
  for insert to authenticated
  with check (exists (
    select 1 from public.supplier_orders o
    where o.id = supplier_order_id and o.contractor_id = (select auth.uid())
      and o.status = 'draft' and o.cancelled_at is null
  ));
drop policy if exists supplier_order_lines_own_update on public.supplier_order_lines;
create policy supplier_order_lines_own_update on public.supplier_order_lines
  for update to authenticated
  using (exists (
    select 1 from public.supplier_orders o
    where o.id = supplier_order_id and o.contractor_id = (select auth.uid())
      and o.status = 'draft' and o.cancelled_at is null
  ))
  with check (exists (
    select 1 from public.supplier_orders o
    where o.id = supplier_order_id and o.contractor_id = (select auth.uid())
      and o.status = 'draft' and o.cancelled_at is null
  ));
drop policy if exists supplier_order_lines_own_delete on public.supplier_order_lines;
create policy supplier_order_lines_own_delete on public.supplier_order_lines
  for delete to authenticated
  using (exists (
    select 1 from public.supplier_orders o
    where o.id = supplier_order_id and o.contractor_id = (select auth.uid())
      and o.status = 'draft' and o.cancelled_at is null
  ));

revoke all on public.supplier_orders from anon;
grant select, insert, update, delete on public.supplier_orders to authenticated;
grant all on public.supplier_orders to service_role;
revoke all on public.supplier_order_lines from anon;
grant select, insert, update, delete on public.supplier_order_lines to authenticated;
grant all on public.supplier_order_lines to service_role;

create or replace function public.validate_supplier_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  quote_contractor uuid;
  supplier_contractor uuid;
begin
  select q.contractor_id into quote_contractor from public.quotes q where q.id = new.quote_id;
  if quote_contractor is null or quote_contractor is distinct from new.contractor_id then
    raise exception 'supplier_order_quote_tenant_mismatch';
  end if;
  select s.contractor_id into supplier_contractor from public.suppliers s where s.id = new.supplier_id;
  if supplier_contractor is null or supplier_contractor is distinct from new.contractor_id then
    raise exception 'supplier_order_supplier_tenant_mismatch';
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'sent' then
      if new.status is distinct from old.status
        or new.contractor_id is distinct from old.contractor_id
        or new.quote_id is distinct from old.quote_id
        or new.supplier_id is distinct from old.supplier_id
        or new.order_number is distinct from old.order_number
        or new.delivery_address is distinct from old.delivery_address
        or new.notes is distinct from old.notes
        or new.email_subject is distinct from old.email_subject
        or new.email_body is distinct from old.email_body
        or new.pdf_path is distinct from old.pdf_path
        or new.pdf_sha256 is distinct from old.pdf_sha256
        or new.pdf_version is distinct from old.pdf_version
        or new.provider_message_id is distinct from old.provider_message_id
        or new.sent_at is distinct from old.sent_at
        or new.cancelled_at is distinct from old.cancelled_at
      then
        raise exception 'sent_supplier_order_immutable';
      end if;
    elsif old.status = 'draft' and new.status = 'sent'
      and current_setting('app.supplier_order_send', true) is distinct from '1' then
      raise exception 'supplier_order_send_requires_server_transition';
    end if;
    if old.cancelled_at is not null and (
      new.supplier_id is distinct from old.supplier_id
      or new.quote_id is distinct from old.quote_id
      or new.delivery_address is distinct from old.delivery_address
      or new.notes is distinct from old.notes
      or new.email_subject is distinct from old.email_subject
      or new.email_body is distinct from old.email_body
      or new.pdf_path is distinct from old.pdf_path
      or new.pdf_sha256 is distinct from old.pdf_sha256
    ) then
      raise exception 'cancelled_supplier_order_immutable';
    end if;
  end if;

  new.order_number := btrim(new.order_number);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.validate_supplier_order_line()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  order_row public.supplier_orders%rowtype;
  requirement_row public.material_requirements%rowtype;
begin
  select o.* into order_row from public.supplier_orders o where o.id = new.supplier_order_id;
  if not found then raise exception 'supplier_order_not_found'; end if;
  if order_row.status <> 'draft' or order_row.cancelled_at is not null then
    raise exception 'supplier_order_lines_are_immutable';
  end if;
  if new.material_requirement_id is not null then
    select mr.* into requirement_row from public.material_requirements mr where mr.id = new.material_requirement_id;
    if not found then raise exception 'material_requirement_not_found'; end if;
    if requirement_row.contractor_id is distinct from order_row.contractor_id
      or requirement_row.quote_id is distinct from order_row.quote_id
      or requirement_row.supplier_id is distinct from order_row.supplier_id then
      raise exception 'supplier_order_line_relationship_mismatch';
    end if;
  end if;
  new.description := btrim(new.description);
  new.unit := nullif(btrim(coalesce(new.unit, '')), '');
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_material_requirement_supplier_order_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.supplier_id is distinct from old.supplier_id
    and current_setting('app.supplier_order_edit', true) is distinct from '1'
    and exists (
      select 1
      from public.supplier_order_lines l
      join public.supplier_orders o on o.id = l.supplier_order_id
      where l.material_requirement_id = old.id
        and o.status = 'draft' and o.cancelled_at is null
    ) then
    raise exception 'material_requirement_assigned_to_supplier_order';
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_orders_validate on public.supplier_orders;
create trigger supplier_orders_validate
  before insert or update on public.supplier_orders
  for each row execute function public.validate_supplier_order();
drop trigger if exists supplier_order_lines_validate on public.supplier_order_lines;
create trigger supplier_order_lines_validate
  before insert or update on public.supplier_order_lines
  for each row execute function public.validate_supplier_order_line();
drop trigger if exists material_requirements_supplier_order_guard on public.material_requirements;
create trigger material_requirements_supplier_order_guard
  before update on public.material_requirements
  for each row execute function public.guard_material_requirement_supplier_order_assignment();

create or replace function public.create_supplier_order(
  p_contractor_id uuid,
  p_quote_id uuid,
  p_supplier_id uuid,
  p_requirement_ids uuid[],
  p_order_number text,
  p_delivery_address text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_expected integer;
  v_selected integer;
begin
  if (select auth.uid()) is distinct from p_contractor_id then raise exception 'supplier_order_auth_mismatch'; end if;
  if p_requirement_ids is null or cardinality(p_requirement_ids) = 0 then raise exception 'supplier_order_requires_lines'; end if;
  if (select count(distinct value) from unnest(p_requirement_ids) as t(value)) <> cardinality(p_requirement_ids) then raise exception 'supplier_order_duplicate_lines'; end if;
  if not exists (select 1 from public.quotes q where q.id = p_quote_id and q.contractor_id = p_contractor_id) then raise exception 'supplier_order_quote_tenant_mismatch'; end if;
  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id and s.contractor_id = p_contractor_id) then raise exception 'supplier_order_supplier_tenant_mismatch'; end if;

  select count(*) into v_expected from unnest(p_requirement_ids);
  select count(*) into v_selected
  from public.material_requirements mr
  where mr.id = any(p_requirement_ids)
    and mr.contractor_id = p_contractor_id
    and mr.quote_id = p_quote_id
    and mr.supplier_id = p_supplier_id
    and mr.status = 'to_order'
    and not exists (
      select 1 from public.supplier_order_lines l
      join public.supplier_orders o on o.id = l.supplier_order_id
      where l.material_requirement_id = mr.id
        and o.status = 'draft' and o.cancelled_at is null
    );
  if v_selected <> v_expected then raise exception 'supplier_order_invalid_requirement_selection'; end if;

  insert into public.supplier_orders (contractor_id, quote_id, supplier_id, order_number, delivery_address)
  values (p_contractor_id, p_quote_id, p_supplier_id, p_order_number, nullif(btrim(p_delivery_address), ''))
  returning id into v_order_id;

  insert into public.supplier_order_lines (
    supplier_order_id, material_requirement_id, description, quantity, unit, sort_order
  )
  select v_order_id, mr.id, mr.material_description, coalesce(mr.order_quantity, mr.quoted_quantity, 0), mr.unit,
    row_number() over (order by mr.created_at, mr.id) - 1
  from public.material_requirements mr
  where mr.id = any(p_requirement_ids);

  return v_order_id;
end;
$$;

create or replace function public.save_supplier_order_draft(
  p_order_id uuid,
  p_supplier_id uuid,
  p_delivery_address text,
  p_notes text,
  p_lines jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  order_row public.supplier_orders%rowtype;
  v_line_count integer;
begin
  select o.* into order_row from public.supplier_orders o
  where o.id = p_order_id and o.contractor_id = (select auth.uid())
  for update;
  if not found or order_row.status <> 'draft' or order_row.cancelled_at is not null then raise exception 'supplier_order_not_editable'; end if;
  if not exists (select 1 from public.suppliers s where s.id = p_supplier_id and s.contractor_id = order_row.contractor_id) then raise exception 'supplier_order_supplier_tenant_mismatch'; end if;
  select count(*) into v_line_count from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as x(id uuid, description text, quantity numeric, unit text, purchase_unit_price_cents integer, sort_order integer);
  if v_line_count = 0 or v_line_count <> (select count(*) from public.supplier_order_lines l where l.supplier_order_id = p_order_id) then raise exception 'supplier_order_lines_mismatch'; end if;
  if exists (
    select 1 from public.supplier_order_lines l
    where l.supplier_order_id = p_order_id
      and not exists (select 1 from jsonb_to_recordset(p_lines) as x(id uuid, description text, quantity numeric, unit text, purchase_unit_price_cents integer, sort_order integer) where x.id = l.id)
  ) then raise exception 'supplier_order_lines_mismatch'; end if;

  perform set_config('app.supplier_order_edit', '1', true);
  update public.material_requirements mr
  set supplier_id = p_supplier_id
  where mr.id in (select l.material_requirement_id from public.supplier_order_lines l where l.supplier_order_id = p_order_id and l.material_requirement_id is not null);
  update public.supplier_orders
  set supplier_id = p_supplier_id, delivery_address = nullif(btrim(p_delivery_address), ''), notes = nullif(btrim(p_notes), '')
  where id = p_order_id;
  update public.supplier_order_lines l
  set description = x.description, quantity = x.quantity, unit = x.unit,
      purchase_unit_price_cents = x.purchase_unit_price_cents, sort_order = x.sort_order
  from jsonb_to_recordset(p_lines) as x(id uuid, description text, quantity numeric, unit text, purchase_unit_price_cents integer, sort_order integer)
  where l.id = x.id and l.supplier_order_id = p_order_id;
end;
$$;

create or replace function public.mark_supplier_order_sent(
  p_order_id uuid,
  p_contractor_id uuid,
  p_pdf_path text,
  p_pdf_sha256 text,
  p_email_subject text,
  p_email_body text,
  p_provider_message_id text default null
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  order_row public.supplier_orders%rowtype;
  expected_path text;
begin
  select o.* into order_row from public.supplier_orders o
  where o.id = p_order_id and o.contractor_id = p_contractor_id
  for update;
  if not found then raise exception 'supplier_order_not_found'; end if;
  if order_row.status = 'sent' then return; end if;
  if order_row.cancelled_at is not null then raise exception 'supplier_order_cancelled'; end if;
  expected_path := p_contractor_id::text || '/' || p_order_id::text || '.pdf';
  if p_pdf_path is distinct from expected_path or p_pdf_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_supplier_order_pdf'; end if;
  if not exists (select 1 from public.supplier_order_lines l where l.supplier_order_id = p_order_id) then raise exception 'supplier_order_requires_lines'; end if;
  perform set_config('app.supplier_order_send', '1', true);
  update public.supplier_orders
  set status = 'sent', sent_at = coalesce(sent_at, now()), pdf_path = p_pdf_path,
      pdf_sha256 = p_pdf_sha256, email_subject = p_email_subject, email_body = p_email_body,
      provider_message_id = p_provider_message_id
  where id = p_order_id;
  update public.material_requirements mr
  set status = 'ordered'
  where mr.id in (select l.material_requirement_id from public.supplier_order_lines l where l.supplier_order_id = p_order_id and l.material_requirement_id is not null);
end;
$$;

revoke execute on function public.validate_supplier_order() from public, anon, authenticated;
revoke execute on function public.validate_supplier_order_line() from public, anon, authenticated;
revoke execute on function public.guard_material_requirement_supplier_order_assignment() from public, anon, authenticated;
revoke execute on function public.create_supplier_order(uuid, uuid, uuid, uuid[], text, text) from public, anon;
grant execute on function public.create_supplier_order(uuid, uuid, uuid, uuid[], text, text) to authenticated;
revoke execute on function public.save_supplier_order_draft(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.save_supplier_order_draft(uuid, uuid, text, text, jsonb) to authenticated;
revoke execute on function public.mark_supplier_order_sent(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_supplier_order_sent(uuid, uuid, text, text, text, text, text) to service_role;

insert into storage.buckets (id, name, public)
values ('supplier-order-pdfs', 'supplier-order-pdfs', false)
on conflict (id) do nothing;

drop policy if exists supplier_order_pdfs_insert_own on storage.objects;
create policy supplier_order_pdfs_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'supplier-order-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists supplier_order_pdfs_select_own on storage.objects;
create policy supplier_order_pdfs_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'supplier-order-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists supplier_order_pdfs_update_own on storage.objects;
create policy supplier_order_pdfs_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'supplier-order-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'supplier-order-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
