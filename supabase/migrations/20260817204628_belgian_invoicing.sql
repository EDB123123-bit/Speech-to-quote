-- Belgian quote-to-invoice v1. Issued documents are retained and immutable.
alter table contractors
  add column if not exists legal_form text,
  add column if not exists registration_number text,
  add column if not exists street text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country_code text not null default 'BE',
  add column if not exists email text,
  add column if not exists iban text,
  add column if not exists invoice_prefix text not null default 'STQ';

alter table catalog_items add column if not exists unit_code text;
alter table quote_line_items add column if not exists unit_code text;

create table if not exists document_counters (
  contractor_id uuid not null references contractors(id) on delete restrict,
  year integer not null check (year between 2000 and 2200),
  series text not null check (series in ('invoice', 'credit_note')),
  last_value integer not null default 0 check (last_value >= 0),
  primary key (contractor_id, year, series)
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete restrict,
  quote_id uuid references quotes(id) on delete restrict,
  document_type text not null default 'invoice' check (document_type in ('invoice', 'credit_note')),
  original_invoice_id uuid references invoices(id) on delete restrict,
  original_invoice_number text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'credited')),
  customer_type text not null default 'private' check (customer_type in ('private', 'business')),
  customer_name text not null,
  customer_address text not null,
  customer_street text,
  customer_postal_code text,
  customer_city text,
  customer_country_code text not null default 'BE',
  customer_email text,
  customer_phone text,
  customer_vat_number text,
  customer_enterprise_number text,
  customer_peppol_id text,
  seller_snapshot jsonb not null default '{}'::jsonb,
  buyer_snapshot jsonb not null default '{}'::jsonb,
  invoice_number text,
  issue_date date,
  delivery_date date,
  due_date date,
  currency text not null default 'EUR' check (currency = 'EUR'),
  buyer_reference text not null default 'NA',
  vat_treatment text not null default 'standard' check (vat_treatment in ('standard', 'reverse_charge')),
  reverse_charge_confirmed boolean not null default false,
  reduced_vat_confirmed boolean not null default false,
  reduced_vat_declaration text,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  vat_total_cents integer not null default 0 check (vat_total_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  delivery_channel text not null default 'email' check (delivery_channel in ('email', 'peppol_manual')),
  delivery_status text not null default 'not_sent' check (delivery_status in ('not_sent', 'ready_for_upload', 'submitted', 'accepted', 'rejected', 'sent')),
  delivery_submitted_at timestamptz,
  delivery_external_reference text,
  delivery_receipt_path text,
  paid_at timestamptz,
  pdf_path text,
  ubl_path text,
  pdf_sha256 text,
  ubl_sha256 text,
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (document_type = 'invoice' or original_invoice_id is not null),
  check (status = 'draft' or (invoice_number is not null and issue_date is not null and issued_at is not null)),
  check (document_type = 'credit_note' or quote_id is not null)
);
create unique index if not exists invoices_one_per_quote_idx
  on invoices(quote_id) where document_type = 'invoice';
create unique index if not exists invoices_number_idx
  on invoices(contractor_id, invoice_number) where invoice_number is not null;
create unique index if not exists invoices_one_credit_per_invoice_idx
  on invoices(original_invoice_id) where document_type = 'credit_note';
create index if not exists invoices_contractor_list_idx
  on invoices(contractor_id, issue_date desc, created_at desc);
create index if not exists invoices_due_idx
  on invoices(contractor_id, due_date, paid_at) where status = 'issued';
create index if not exists invoices_quote_idx on invoices(quote_id);

create table if not exists invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete restrict,
  description text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  unit_code text not null check (unit_code in ('MTK', 'HUR', 'C62', 'MTR', 'KGM')),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  vat_rate numeric(4,2) not null check (vat_rate in (0, 0.06, 0.21)),
  vat_category text not null check (vat_category in ('S', 'AE')),
  line_total_cents integer not null default 0 check (line_total_cents >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists invoice_line_items_invoice_idx on invoice_line_items(invoice_id, sort_order);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_line_items_vat_category_rate_check') then
    alter table invoice_line_items add constraint invoice_line_items_vat_category_rate_check
      check ((vat_category = 'AE' and vat_rate = 0) or (vat_category = 'S' and vat_rate in (0.06, 0.21)));
  end if;
end $$;

create table if not exists invoice_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete restrict,
  contractor_id uuid not null references contractors(id) on delete restrict,
  event_type text not null check (event_type in (
    'draft_created', 'issued', 'pdf_generated', 'ubl_generated', 'delivery_status_changed',
    'payment_status_changed', 'credited', 'document_downloaded'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists invoice_events_invoice_idx on invoice_events(invoice_id, created_at desc);
create index if not exists invoice_events_contractor_idx on invoice_events(contractor_id, created_at desc);

create or replace function public.touch_invoice_updated_at()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists invoices_touch_updated_at on invoices;
create trigger invoices_touch_updated_at before update on invoices
for each row execute function public.touch_invoice_updated_at();

create or replace function public.prevent_issued_invoice_mutation()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare
  old_immutable jsonb;
  new_immutable jsonb;
begin
  if old.status = 'draft' and new.status in ('issued', 'credited') and current_setting('app.issue_context', true) <> 'on' then
    raise exception 'issue_through_rpc_only';
  end if;
  if old.status in ('issued', 'credited') then
    old_immutable := to_jsonb(old) - array[
      'paid_at', 'delivery_status', 'delivery_submitted_at', 'delivery_external_reference',
      'delivery_receipt_path', 'pdf_path', 'ubl_path', 'pdf_sha256', 'ubl_sha256', 'updated_at', 'status'
    ];
    new_immutable := to_jsonb(new) - array[
      'paid_at', 'delivery_status', 'delivery_submitted_at', 'delivery_external_reference',
      'delivery_receipt_path', 'pdf_path', 'ubl_path', 'pdf_sha256', 'ubl_sha256', 'updated_at', 'status'
    ];
    if old_immutable <> new_immutable then raise exception 'issued_invoice_immutable'; end if;
    if (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path)
      or (old.ubl_path is not null and new.ubl_path is distinct from old.ubl_path)
      or (old.pdf_sha256 is not null and new.pdf_sha256 is distinct from old.pdf_sha256)
      or (old.ubl_sha256 is not null and new.ubl_sha256 is distinct from old.ubl_sha256)
    then raise exception 'issued_invoice_documents_immutable'; end if;
    if old.status = 'credited' and new.status <> 'credited' then raise exception 'credited_invoice_immutable'; end if;
    if old.status = 'issued' and new.status = 'credited' and current_setting('app.credit_context', true) <> 'on' then raise exception 'credit_through_rpc_only'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists invoices_prevent_issued_mutation on invoices;
create trigger invoices_prevent_issued_mutation before update on invoices
for each row execute function public.prevent_issued_invoice_mutation();

alter table document_counters enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;
alter table invoice_events enable row level security;

create policy document_counters_own on document_counters
  for select to authenticated using (contractor_id = (select auth.uid()));

create policy invoices_own_read on invoices
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy invoices_own_insert on invoices
  for insert to authenticated with check (contractor_id = (select auth.uid()) and status = 'draft');
create policy invoices_own_update on invoices
  for update to authenticated
  using (contractor_id = (select auth.uid()) and status in ('draft', 'issued', 'credited'))
  with check (contractor_id = (select auth.uid()) and status in ('draft', 'issued', 'credited'));
create policy invoices_own_delete_draft on invoices
  for delete to authenticated using (contractor_id = (select auth.uid()) and status = 'draft');

create policy invoice_line_items_own_read on invoice_line_items
  for select to authenticated using (
    exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()))
  );
create policy invoice_line_items_own_insert on invoice_line_items
  for insert to authenticated with check (
    exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()) and i.status = 'draft')
  );
create policy invoice_line_items_own_update on invoice_line_items
  for update to authenticated
  using (exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()) and i.status = 'draft'))
  with check (exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()) and i.status = 'draft'));
create policy invoice_line_items_own_delete on invoice_line_items
  for delete to authenticated using (
    exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()) and i.status = 'draft')
  );

create policy invoice_events_own_read on invoice_events
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy invoice_events_own_insert on invoice_events
  for insert to authenticated with check (
    contractor_id = (select auth.uid()) and exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()))
  );

grant select, insert, update, delete on invoices to authenticated;
grant select, insert, update, delete on invoice_line_items to authenticated;
grant select on invoice_events, document_counters to authenticated;

-- The RPC is the only path that assigns legal numbers. The security-definer
-- implementation lives in a non-exposed schema and verifies auth.uid().
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.issue_invoice(p_invoice_id uuid)
returns invoices
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_invoice invoices%rowtype;
  v_line_count integer;
  v_year integer;
  v_next integer;
  v_prefix text;
  v_number text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_invoice.contractor_id is distinct from auth.uid() then raise exception 'not_owner'; end if;
  if v_invoice.status <> 'draft' then return v_invoice; end if;
  if v_invoice.document_type = 'invoice' and v_invoice.due_date is null then raise exception 'due_date_required'; end if;

  if coalesce(v_invoice.seller_snapshot->>'name', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'street', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'postalCode', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'city', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'vatNumber', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'enterpriseNumber', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'iban', '') = ''
  then raise exception 'seller_profile_incomplete'; end if;
  if btrim(coalesce(v_invoice.customer_name, '')) = ''
    or btrim(coalesce(v_invoice.customer_street, '')) = ''
    or btrim(coalesce(v_invoice.customer_postal_code, '')) = ''
    or btrim(coalesce(v_invoice.customer_city, '')) = ''
  then raise exception 'buyer_address_incomplete'; end if;

  select count(*) into v_line_count from public.invoice_line_items where invoice_id = p_invoice_id;
  if v_line_count = 0 then raise exception 'invoice_without_lines'; end if;
  if v_invoice.customer_type = 'business' and (v_invoice.customer_peppol_id is null or v_invoice.customer_peppol_id = '') then
    raise exception 'business_without_peppol_id';
  end if;
  if v_invoice.customer_type = 'business' and v_invoice.customer_peppol_id !~ '^0208:[0-9]{10}$' then
    raise exception 'invalid_peppol_id';
  end if;
  if v_invoice.customer_type = 'business' and (v_invoice.customer_vat_number is null or v_invoice.customer_enterprise_number is null) then
    raise exception 'business_without_vat_or_enterprise_number';
  end if;
  if v_invoice.customer_type = 'business' and exists (
    select 1 from public.invoice_line_items where invoice_id = p_invoice_id and unit_code = ''
  ) then raise exception 'line_without_unit_code'; end if;
  if v_invoice.vat_treatment = 'reverse_charge' and (v_invoice.customer_type <> 'business' or not v_invoice.reverse_charge_confirmed) then
    raise exception 'invalid_reverse_charge';
  end if;
  if v_invoice.vat_treatment = 'reverse_charge' and exists (select 1 from public.invoice_line_items where invoice_id = p_invoice_id and vat_category <> 'AE') then
    raise exception 'reverse_charge_lines_not_ae';
  end if;
  if v_invoice.vat_treatment = 'standard' and exists (select 1 from public.invoice_line_items where invoice_id = p_invoice_id and vat_category <> 'S') then
    raise exception 'standard_lines_not_s';
  end if;

  v_year := extract(year from coalesce(v_invoice.issue_date, current_date))::integer;
  insert into public.document_counters(contractor_id, year, series, last_value)
  values (v_invoice.contractor_id, v_year, case when v_invoice.document_type = 'credit_note' then 'credit_note' else 'invoice' end, 0)
  on conflict (contractor_id, year, series) do nothing;
  select last_value into v_next from public.document_counters
    where contractor_id = v_invoice.contractor_id and year = v_year
      and series = case when v_invoice.document_type = 'credit_note' then 'credit_note' else 'invoice' end
    for update;
  v_next := v_next + 1;
  update public.document_counters set last_value = v_next
    where contractor_id = v_invoice.contractor_id and year = v_year
      and series = case when v_invoice.document_type = 'credit_note' then 'credit_note' else 'invoice' end;
  select coalesce(invoice_prefix, 'STQ') into v_prefix from public.contractors where id = v_invoice.contractor_id;
  v_number := v_prefix || case when v_invoice.document_type = 'credit_note' then '-CN-' else '-' end || v_year::text || '-' || lpad(v_next::text, 4, '0');

  perform set_config('app.issue_context', 'on', true);
  update public.invoices
    set invoice_number = v_number,
        issue_date = coalesce(issue_date, current_date),
        issued_at = now(),
        status = 'issued',
        delivery_status = case when delivery_channel = 'peppol_manual' then 'ready_for_upload' else 'not_sent' end
    where id = p_invoice_id
    returning * into v_invoice;
  insert into public.invoice_events(invoice_id, contractor_id, event_type, detail)
    values (p_invoice_id, v_invoice.contractor_id, 'issued', jsonb_build_object('invoice_number', v_number));
  return v_invoice;
end;
$$;

create or replace function public.issue_invoice(p_invoice_id uuid)
returns invoices language sql security invoker
set search_path = public, pg_catalog
as $$ select private.issue_invoice(p_invoice_id); $$;
revoke execute on function public.issue_invoice(uuid) from public;
grant execute on function public.issue_invoice(uuid) to authenticated;
revoke execute on function private.issue_invoice(uuid) from public;
grant execute on function private.issue_invoice(uuid) to authenticated;

create or replace function private.mark_invoice_credited(p_invoice_id uuid)
returns invoices
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_invoice invoices%rowtype;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_invoice.contractor_id is distinct from auth.uid() then raise exception 'not_owner'; end if;
  if not exists (select 1 from public.invoices where original_invoice_id = p_invoice_id and document_type = 'credit_note' and status = 'issued') then
    raise exception 'credit_note_not_issued';
  end if;
  perform set_config('app.credit_context', 'on', true);
  update public.invoices set status = 'credited' where id = p_invoice_id returning * into v_invoice;
  insert into public.invoice_events(invoice_id, contractor_id, event_type, detail)
    values (p_invoice_id, v_invoice.contractor_id, 'credited', '{}'::jsonb);
  return v_invoice;
end;
$$;

create or replace function public.mark_invoice_credited(p_invoice_id uuid)
returns invoices language sql security invoker
set search_path = public, pg_catalog
as $$ select private.mark_invoice_credited(p_invoice_id); $$;
revoke execute on function public.mark_invoice_credited(uuid) from public;
grant execute on function public.mark_invoice_credited(uuid) to authenticated;
revoke execute on function private.mark_invoice_credited(uuid) from public;
grant execute on function private.mark_invoice_credited(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('invoice-documents', 'invoice-documents', false)
on conflict (id) do nothing;

create policy invoice_documents_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'invoice-documents' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy invoice_documents_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'invoice-documents' and (storage.foldername(name))[1] = auth.uid()::text
  );
