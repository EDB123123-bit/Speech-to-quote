-- Material requirements and suppliers. Purchase orders are intentionally out
-- Migration version aligned with the hosted production history.
-- of scope; requirements are the operational bridge from accepted quotes.
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  company_name text not null,
  contact_person text,
  email text,
  phone text,
  address text,
  vat_number text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppliers_company_name_check check (char_length(btrim(company_name)) between 1 and 200)
);

create index if not exists suppliers_contractor_idx on public.suppliers (contractor_id, company_name);

create table if not exists public.material_requirements (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  source_quote_line_item_id uuid not null references public.quote_line_items(id) on delete restrict,
  material_description text not null,
  quoted_quantity numeric,
  order_quantity numeric,
  unit text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status text not null default 'to_order',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_requirements_description_check check (char_length(btrim(material_description)) between 1 and 500),
  constraint material_requirements_quoted_quantity_check check (quoted_quantity is null or quoted_quantity >= 0),
  constraint material_requirements_order_quantity_check check (order_quantity is null or order_quantity >= 0),
  constraint material_requirements_status_check check (status in ('to_order', 'ordered')),
  constraint material_requirements_source_unique unique (source_quote_line_item_id)
);

create index if not exists material_requirements_contractor_status_idx
  on public.material_requirements (contractor_id, status, updated_at desc);
create index if not exists material_requirements_quote_idx
  on public.material_requirements (quote_id, status, created_at);
create index if not exists material_requirements_supplier_idx
  on public.material_requirements (contractor_id, supplier_id, status);

alter table public.suppliers enable row level security;
alter table public.material_requirements enable row level security;

create policy suppliers_own_select on public.suppliers
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy suppliers_own_insert on public.suppliers
  for insert to authenticated with check (contractor_id = (select auth.uid()));
create policy suppliers_own_update on public.suppliers
  for update to authenticated
  using (contractor_id = (select auth.uid()))
  with check (contractor_id = (select auth.uid()));
create policy suppliers_own_delete on public.suppliers
  for delete to authenticated using (contractor_id = (select auth.uid()));

create policy material_requirements_own_select on public.material_requirements
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy material_requirements_own_update on public.material_requirements
  for update to authenticated
  using (contractor_id = (select auth.uid()))
  with check (contractor_id = (select auth.uid()));

revoke all on public.suppliers from anon;
grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;
revoke all on public.material_requirements from anon;
grant select, update on public.material_requirements to authenticated;
grant all on public.material_requirements to service_role;

create or replace function public.validate_material_requirement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  line_row public.quote_line_items%rowtype;
  quote_row public.quotes%rowtype;
  supplier_contractor uuid;
begin
  select l.* into line_row from public.quote_line_items l where l.id = new.source_quote_line_item_id;
  select q.* into quote_row from public.quotes q where q.id = new.quote_id;
  if not found then raise exception 'quote_not_found'; end if;
  if line_row.id is null or line_row.quote_id is distinct from new.quote_id then
    raise exception 'material_source_line_mismatch';
  end if;
  if quote_row.contractor_id is distinct from new.contractor_id or quote_row.status <> 'accepted' then
    raise exception 'material_quote_not_accepted';
  end if;
  if line_row.classification is distinct from 'material' then
    raise exception 'material_source_line_not_material';
  end if;
  if tg_op = 'UPDATE' and (
    new.contractor_id is distinct from old.contractor_id
    or new.quote_id is distinct from old.quote_id
    or new.source_quote_line_item_id is distinct from old.source_quote_line_item_id
    or new.material_description is distinct from old.material_description
    or new.quoted_quantity is distinct from old.quoted_quantity
    or new.unit is distinct from old.unit
  ) then
    raise exception 'material_requirement_snapshot_is_immutable';
  end if;
  if new.supplier_id is not null then
    select s.contractor_id into supplier_contractor from public.suppliers s where s.id = new.supplier_id;
    if supplier_contractor is distinct from new.contractor_id then raise exception 'supplier_tenant_mismatch'; end if;
  end if;
  new.material_description := btrim(new.material_description);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists material_requirements_validate on public.material_requirements;
create trigger material_requirements_validate
  before insert or update on public.material_requirements
  for each row execute function public.validate_material_requirement();

create or replace function public.create_material_requirements_for_accepted_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from new.status then
    insert into public.material_requirements (
      contractor_id, quote_id, source_quote_line_item_id, material_description,
      quoted_quantity, order_quantity, unit, status
    )
    select new.contractor_id, new.id, l.id, l.description,
      l.quantity, l.quantity, l.unit, 'to_order'
    from public.quote_line_items l
    where l.quote_id = new.id and l.classification = 'material'
    on conflict (source_quote_line_item_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_create_material_requirements on public.quotes;
create trigger quotes_create_material_requirements
  after update of status on public.quotes
  for each row execute function public.create_material_requirements_for_accepted_quote();

revoke execute on function public.validate_material_requirement() from public, anon, authenticated;
revoke execute on function public.create_material_requirements_for_accepted_quote() from public, anon, authenticated;
