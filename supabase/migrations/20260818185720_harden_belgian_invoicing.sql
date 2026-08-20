-- Production hardening for Belgian invoicing and the provider-neutral
-- outbound Peppol boundary. This is intentionally forward-only: the invoice
-- migrations applied on 2026-08-17 remain part of production history.

alter table public.contractors
  add column if not exists deactivated_at timestamptz,
  add column if not exists default_payment_term_days integer not null default 30,
  add column if not exists rpr text;
alter table public.contractors drop constraint if exists contractors_default_payment_term_days_check;
alter table public.contractors add constraint contractors_default_payment_term_days_check
  check (default_payment_term_days between 0 and 365);

alter table public.invoices
  add column if not exists document_status text,
  add column if not exists document_error text,
  add column if not exists reduced_vat_declaration_version text,
  add column if not exists peppol_validation_release text,
  add column if not exists delivery_receipt_sha256 text,
  add column if not exists retain_until date,
  add column if not exists transport_status text,
  add column if not exists business_response_status text,
  add column if not exists delivery_status_source text;

update public.invoices
set document_status = case
      when status = 'draft' then 'pending'
      when pdf_path is not null and (customer_type = 'private' or ubl_path is not null) then 'ready'
      else 'pending'
    end,
    transport_status = case delivery_status
      when 'ready_for_upload' then 'ready'
      when 'submitted' then 'submitted'
      when 'accepted' then 'delivered'
      when 'sent' then 'delivered'
      when 'rejected' then 'failed'
      else 'not_sent'
    end,
    business_response_status = case delivery_status
      when 'accepted' then 'accepted'
      when 'rejected' then 'rejected'
      else null
    end,
    delivery_status_source = case
      when delivery_status in ('submitted', 'accepted', 'rejected', 'sent') then 'user'
      else 'system'
    end,
    retain_until = case
      when issue_date is not null then make_date(extract(year from issue_date)::integer + 11, 1, 1)
      else null
    end
where document_status is null
   or transport_status is null
   or delivery_status_source is null
   or (issue_date is not null and retain_until is null);

alter table public.invoices
  alter column document_status set default 'pending',
  alter column document_status set not null,
  alter column transport_status set default 'not_sent',
  alter column transport_status set not null,
  alter column delivery_status_source set default 'system',
  alter column delivery_status_source set not null;

alter table public.invoices drop constraint if exists invoices_document_status_check;
alter table public.invoices add constraint invoices_document_status_check
  check (document_status in ('pending', 'ready', 'failed'));
alter table public.invoices drop constraint if exists invoices_transport_status_check;
alter table public.invoices add constraint invoices_transport_status_check
  check (transport_status in ('not_sent', 'ready', 'queued', 'submitted', 'delivered', 'failed'));
alter table public.invoices drop constraint if exists invoices_business_response_status_check;
alter table public.invoices add constraint invoices_business_response_status_check
  check (business_response_status is null or business_response_status in (
    'received', 'accepted', 'conditionally_accepted', 'rejected', 'processing', 'paid', 'information_required'
  ));
alter table public.invoices drop constraint if exists invoices_delivery_status_source_check;
alter table public.invoices add constraint invoices_delivery_status_source_check
  check (delivery_status_source in ('user', 'provider', 'system'));
alter table public.invoices drop constraint if exists invoices_delivery_channel_check;
alter table public.invoices add constraint invoices_delivery_channel_check
  check (delivery_channel in ('email', 'peppol_manual', 'peppol_api'));
alter table public.invoices drop constraint if exists invoices_retain_until_check;
alter table public.invoices add constraint invoices_retain_until_check
  check (retain_until is null or issue_date is null or retain_until >= make_date(extract(year from issue_date)::integer + 11, 1, 1));

create index if not exists invoices_transport_list_idx
  on public.invoices(contractor_id, transport_status, created_at desc);
create index if not exists invoices_document_retry_idx
  on public.invoices(contractor_id, document_status, issued_at)
  where status in ('issued', 'credited') and document_status <> 'ready';

alter table public.invoice_events
  add column if not exists actor_type text not null default 'system',
  add column if not exists source text not null default 'system',
  add column if not exists provider_reference text;
alter table public.invoice_events drop constraint if exists invoice_events_event_type_check;
alter table public.invoice_events add constraint invoice_events_event_type_check
  check (event_type in (
    'draft_created', 'draft_updated', 'issued', 'documents_ready', 'document_generation_failed',
    'pdf_generated', 'ubl_generated',
    'delivery_status_changed', 'payment_status_changed', 'credited', 'document_downloaded',
    'peppol_queued', 'peppol_status_changed'
  ));
alter table public.invoice_events drop constraint if exists invoice_events_actor_type_check;
alter table public.invoice_events add constraint invoice_events_actor_type_check
  check (actor_type in ('user', 'provider', 'system'));
alter table public.invoice_events drop constraint if exists invoice_events_source_check;
alter table public.invoice_events add constraint invoice_events_source_check
  check (source in ('app', 'manual', 'provider', 'system'));

create table if not exists public.peppol_connections (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null unique references public.contractors(id) on delete restrict,
  provider_key text not null,
  external_account_id text,
  auth_type text not null default 'api_key',
  status text not null default 'pending' check (status in ('pending', 'active', 'error', 'revoked')),
  verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.peppol_connection_secrets (
  connection_id uuid primary key references public.peppol_connections(id) on delete restrict,
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  ciphertext text not null,
  iv text not null,
  auth_tag text not null,
  key_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, contractor_id)
);

create table if not exists public.peppol_submissions (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  invoice_id uuid not null unique references public.invoices(id) on delete restrict,
  connection_id uuid not null references public.peppol_connections(id) on delete restrict,
  provider_key text not null,
  idempotency_key text not null unique,
  ubl_sha256 text not null check (ubl_sha256 ~ '^[0-9a-f]{64}$'),
  external_submission_id text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'retry', 'submitted', 'delivered', 'failed')),
  processing_operation text not null default 'submit' check (processing_operation in ('submit', 'poll')),
  business_response_status text check (business_response_status is null or business_response_status in (
    'received', 'accepted', 'conditionally_accepted', 'rejected', 'processing', 'paid', 'information_required'
  )),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  submitted_at timestamptz,
  delivered_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.peppol_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.peppol_submissions(id) on delete restrict,
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  status text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists peppol_connections_contractor_idx on public.peppol_connections(contractor_id);
create index if not exists peppol_connection_secrets_contractor_idx on public.peppol_connection_secrets(contractor_id);
create index if not exists peppol_submissions_queue_idx
  on public.peppol_submissions(status, next_attempt_at, created_at)
  where status in ('queued', 'retry', 'submitted');
create index if not exists peppol_submissions_contractor_idx
  on public.peppol_submissions(contractor_id, created_at desc);
create index if not exists peppol_submissions_connection_idx on public.peppol_submissions(connection_id);
create index if not exists peppol_submission_events_submission_idx
  on public.peppol_submission_events(submission_id, created_at desc);
create index if not exists peppol_submission_events_contractor_idx
  on public.peppol_submission_events(contractor_id, created_at desc);

alter table public.peppol_connections enable row level security;
alter table public.peppol_connection_secrets enable row level security;
alter table public.peppol_submissions enable row level security;
alter table public.peppol_submission_events enable row level security;

drop policy if exists peppol_connections_own_read on public.peppol_connections;
create policy peppol_connections_own_read on public.peppol_connections
  for select to authenticated using (contractor_id = (select auth.uid()));
drop policy if exists peppol_submissions_own_read on public.peppol_submissions;
create policy peppol_submissions_own_read on public.peppol_submissions
  for select to authenticated using (contractor_id = (select auth.uid()));
drop policy if exists peppol_submission_events_own_read on public.peppol_submission_events;
create policy peppol_submission_events_own_read on public.peppol_submission_events
  for select to authenticated using (contractor_id = (select auth.uid()));

create or replace function private.normalized_digits(p_value text)
returns text language sql immutable set search_path = pg_catalog
as $$ select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g') $$;

create or replace function private.valid_belgian_enterprise_number(p_value text)
returns boolean language plpgsql immutable set search_path = pg_catalog, private as $$
declare
  v_digits text := private.normalized_digits(p_value);
  v_base integer;
  v_check integer;
begin
  if length(v_digits) <> 10 then return false; end if;
  v_base := substring(v_digits from 1 for 8)::integer;
  v_check := substring(v_digits from 9 for 2)::integer;
  return (97 - (v_base % 97)) = v_check;
exception when others then
  return false;
end;
$$;

create or replace function private.valid_iban(p_value text)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare
  v_iban text := upper(regexp_replace(coalesce(p_value, ''), '[[:space:]]', '', 'g'));
  v_rearranged text;
  v_char text;
  v_numeric text := '';
  v_remainder integer := 0;
  i integer;
  j integer;
begin
  if v_iban !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then return false; end if;
  v_rearranged := substring(v_iban from 5) || substring(v_iban from 1 for 4);
  for i in 1..length(v_rearranged) loop
    v_char := substring(v_rearranged from i for 1);
    if v_char between 'A' and 'Z' then
      v_numeric := v_numeric || (ascii(v_char) - 55)::text;
    else
      v_numeric := v_numeric || v_char;
    end if;
  end loop;
  for j in 1..length(v_numeric) loop
    v_remainder := (v_remainder * 10 + substring(v_numeric from j for 1)::integer) % 97;
  end loop;
  return v_remainder = 1;
exception when others then
  return false;
end;
$$;

create or replace function private.sanitize_invoice_error(p_value text)
returns text language sql immutable set search_path = pg_catalog as $$
  select left(regexp_replace(coalesce(p_value, ''),
    '(bearer|api[_-]?key|token|secret)([=: ]+)[A-Za-z0-9._~+/=-]+',
    '\1\2[REDACTED]', 'gi'), 500)
$$;

create or replace function private.assert_invoice_owner(p_contractor_id uuid)
returns void language plpgsql stable set search_path = pg_catalog as $$
begin
  if auth.uid() is null or p_contractor_id is distinct from auth.uid() then
    raise exception 'not_owner';
  end if;
end;
$$;

create or replace function private.insert_invoice_lines(p_invoice_id uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice_without_lines';
  end if;
  insert into public.invoice_line_items (
    invoice_id, description, quantity, unit, unit_code, unit_price_cents,
    vat_rate, vat_category, line_total_cents, sort_order
  )
  select p_invoice_id, btrim(x.description), x.quantity, btrim(x.unit), x.unit_code,
    x.unit_price_cents, x.vat_rate, x.vat_category,
    round(x.quantity * x.unit_price_cents)::integer, x.sort_order
  from jsonb_to_recordset(p_lines) as x(
    description text, quantity numeric, unit text, unit_code text,
    unit_price_cents integer, vat_rate numeric, vat_category text, sort_order integer
  );
  if exists (
    select 1 from public.invoice_line_items
    where invoice_id = p_invoice_id and (
      description = '' or quantity <= 0 or unit_price_cents < 0
      or unit_code not in ('MTK', 'HUR', 'C62', 'MTR', 'KGM')
      or vat_category not in ('S', 'AE') or vat_rate not in (0, 0.06, 0.21)
      or (vat_category = 'AE' and vat_rate <> 0)
      or (vat_category = 'S' and vat_rate not in (0.06, 0.21))
    )
  ) then raise exception 'invalid_invoice_line'; end if;
end;
$$;

create or replace function private.create_invoice_draft_from_quote(p_quote_id uuid, p_draft jsonb)
returns public.invoices language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare
  v_invoice public.invoices%rowtype;
  v_contractor_id uuid := auth.uid();
begin
  if v_contractor_id is null then raise exception 'not_authenticated'; end if;
  if not exists (
    select 1 from public.quotes
    where id = p_quote_id and contractor_id = v_contractor_id and status = 'final'
  ) then raise exception 'final_quote_not_found'; end if;
  select * into v_invoice from public.invoices
    where quote_id = p_quote_id and document_type = 'invoice';
  if found then return v_invoice; end if;

  insert into public.invoices (
    contractor_id, quote_id, document_type, status, customer_type, customer_name,
    customer_address, customer_street, customer_postal_code, customer_city,
    customer_country_code, customer_email, customer_phone, customer_vat_number,
    customer_enterprise_number, customer_peppol_id, seller_snapshot, buyer_snapshot,
    issue_date, delivery_date, due_date, buyer_reference, vat_treatment,
    reverse_charge_confirmed, reduced_vat_confirmed, reduced_vat_declaration, reduced_vat_declaration_version,
    subtotal_cents, vat_total_cents, total_cents, delivery_channel,
    document_status, transport_status, delivery_status_source
  ) values (
    v_contractor_id, p_quote_id, 'invoice', 'draft', p_draft->>'customer_type',
    p_draft->>'customer_name', coalesce(p_draft->>'customer_address', ''),
    p_draft->>'customer_street', p_draft->>'customer_postal_code', p_draft->>'customer_city',
    coalesce(p_draft->>'customer_country_code', 'BE'), nullif(p_draft->>'customer_email', ''),
    nullif(p_draft->>'customer_phone', ''), nullif(p_draft->>'customer_vat_number', ''),
    nullif(p_draft->>'customer_enterprise_number', ''), nullif(p_draft->>'customer_peppol_id', ''),
    coalesce(p_draft->'seller_snapshot', '{}'::jsonb), coalesce(p_draft->'buyer_snapshot', '{}'::jsonb),
    nullif(p_draft->>'issue_date', '')::date, nullif(p_draft->>'delivery_date', '')::date,
    nullif(p_draft->>'due_date', '')::date, coalesce(p_draft->>'buyer_reference', ''),
    coalesce(p_draft->>'vat_treatment', 'standard'), coalesce((p_draft->>'reverse_charge_confirmed')::boolean, false),
    coalesce((p_draft->>'reduced_vat_confirmed')::boolean, false), nullif(p_draft->>'reduced_vat_declaration', ''),
    nullif(p_draft->>'reduced_vat_declaration_version', ''),
    0, 0, 0, coalesce(p_draft->>'delivery_channel', 'email'), 'pending', 'not_sent', 'system'
  ) returning * into v_invoice;
  perform private.insert_invoice_lines(v_invoice.id, p_draft->'lines');
  insert into public.invoice_events(invoice_id, contractor_id, event_type, actor_type, source, detail)
    values (v_invoice.id, v_contractor_id, 'draft_created', 'user', 'app', jsonb_build_object('quote_id', p_quote_id));
  return v_invoice;
end;
$$;

create or replace function private.save_invoice_draft(p_invoice_id uuid, p_draft jsonb)
returns public.invoices language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare
  v_invoice public.invoices%rowtype;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  perform private.assert_invoice_owner(v_invoice.contractor_id);
  if v_invoice.status <> 'draft' then raise exception 'invoice_not_draft'; end if;
  if jsonb_typeof(p_draft->'lines') <> 'array' or jsonb_array_length(p_draft->'lines') = 0 then
    raise exception 'invoice_without_lines';
  end if;

  update public.invoices set
    customer_type = p_draft->>'customer_type', customer_name = p_draft->>'customer_name',
    customer_address = coalesce(p_draft->>'customer_address', ''), customer_street = p_draft->>'customer_street',
    customer_postal_code = p_draft->>'customer_postal_code', customer_city = p_draft->>'customer_city',
    customer_country_code = coalesce(p_draft->>'customer_country_code', 'BE'),
    customer_email = nullif(p_draft->>'customer_email', ''), customer_phone = nullif(p_draft->>'customer_phone', ''),
    customer_vat_number = nullif(p_draft->>'customer_vat_number', ''),
    customer_enterprise_number = nullif(p_draft->>'customer_enterprise_number', ''),
    customer_peppol_id = nullif(p_draft->>'customer_peppol_id', ''),
    seller_snapshot = coalesce(p_draft->'seller_snapshot', '{}'::jsonb),
    buyer_snapshot = coalesce(p_draft->'buyer_snapshot', '{}'::jsonb),
    issue_date = nullif(p_draft->>'issue_date', '')::date,
    delivery_date = nullif(p_draft->>'delivery_date', '')::date,
    due_date = nullif(p_draft->>'due_date', '')::date,
    buyer_reference = coalesce(p_draft->>'buyer_reference', ''),
    vat_treatment = coalesce(p_draft->>'vat_treatment', 'standard'),
    reverse_charge_confirmed = coalesce((p_draft->>'reverse_charge_confirmed')::boolean, false),
    reduced_vat_confirmed = coalesce((p_draft->>'reduced_vat_confirmed')::boolean, false),
    reduced_vat_declaration = nullif(p_draft->>'reduced_vat_declaration', ''),
    reduced_vat_declaration_version = nullif(p_draft->>'reduced_vat_declaration_version', ''),
    delivery_channel = coalesce(p_draft->>'delivery_channel', 'email')
  where id = p_invoice_id;
  delete from public.invoice_line_items where invoice_id = p_invoice_id;
  perform private.insert_invoice_lines(p_invoice_id, p_draft->'lines');
  insert into public.invoice_events(invoice_id, contractor_id, event_type, actor_type, source)
    values (p_invoice_id, v_invoice.contractor_id, 'draft_updated', 'user', 'app');
  select * into v_invoice from public.invoices where id = p_invoice_id;
  return v_invoice;
end;
$$;

create or replace function private.issue_invoice(p_invoice_id uuid)
returns public.invoices language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare
  v_invoice public.invoices%rowtype;
  v_contractor public.contractors%rowtype;
  v_issue_date date;
  v_year integer;
  v_next integer;
  v_prefix text;
  v_number text;
  v_subtotal integer;
  v_vat integer;
  v_kbo text;
  v_vat_digits text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  perform private.assert_invoice_owner(v_invoice.contractor_id);
  if v_invoice.status <> 'draft' then return v_invoice; end if;
  select * into v_contractor from public.contractors where id = v_invoice.contractor_id;
  if not found or v_contractor.deactivated_at is not null then raise exception 'contractor_inactive'; end if;
  v_invoice.seller_snapshot := jsonb_build_object(
    'name', v_contractor.company_name,
    'street', coalesce(v_contractor.street, v_contractor.address, ''),
    'postalCode', coalesce(v_contractor.postal_code, ''),
    'city', coalesce(v_contractor.city, ''),
    'countryCode', coalesce(v_contractor.country_code, 'BE'),
    'vatNumber', coalesce(v_contractor.vat_number, ''),
    'enterpriseNumber', coalesce(v_contractor.registration_number, ''),
    'email', coalesce(v_contractor.email, ''),
    'phone', coalesce(v_contractor.phone, ''),
    'legalForm', coalesce(v_contractor.legal_form, ''),
    'rpr', coalesce(v_contractor.rpr, ''),
    'registrationNumber', coalesce(v_contractor.registration_number, ''),
    'iban', coalesce(v_contractor.iban, ''),
    'peppolId', '0208:' || private.normalized_digits(v_contractor.registration_number)
  );
  perform 1 from public.invoice_line_items where invoice_id = p_invoice_id order by id for update;
  if not found then raise exception 'invoice_without_lines'; end if;

  v_issue_date := coalesce(v_invoice.issue_date, current_date);
  if v_invoice.delivery_date is null then raise exception 'delivery_date_required'; end if;
  if v_invoice.document_type = 'invoice' and v_invoice.due_date is null then raise exception 'due_date_required'; end if;
  if v_invoice.document_type = 'invoice' and v_invoice.due_date < v_issue_date then raise exception 'due_date_before_issue_date'; end if;
  if coalesce(v_invoice.seller_snapshot->>'name', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'street', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'postalCode', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'city', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'legalForm', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'rpr', '') = ''
    or coalesce(v_invoice.seller_snapshot->>'email', '') = ''
    or not private.valid_belgian_enterprise_number(v_invoice.seller_snapshot->>'enterpriseNumber')
    or private.normalized_digits(v_invoice.seller_snapshot->>'vatNumber') <> private.normalized_digits(v_invoice.seller_snapshot->>'enterpriseNumber')
    or not private.valid_iban(v_invoice.seller_snapshot->>'iban')
  then raise exception 'seller_profile_invalid'; end if;
  if btrim(coalesce(v_invoice.customer_name, '')) = ''
    or btrim(coalesce(v_invoice.customer_street, '')) = ''
    or btrim(coalesce(v_invoice.customer_postal_code, '')) = ''
    or btrim(coalesce(v_invoice.customer_city, '')) = ''
    or upper(coalesce(v_invoice.customer_country_code, '')) <> 'BE'
  then raise exception 'buyer_address_invalid'; end if;

  if v_invoice.customer_type = 'business' then
    v_kbo := private.normalized_digits(v_invoice.customer_enterprise_number);
    v_vat_digits := private.normalized_digits(v_invoice.customer_vat_number);
    if not private.valid_belgian_enterprise_number(v_invoice.customer_enterprise_number)
      or v_vat_digits <> v_kbo then raise exception 'business_identifiers_invalid'; end if;
    if v_invoice.customer_peppol_id is distinct from ('0208:' || v_kbo) then raise exception 'invalid_peppol_id'; end if;
    if btrim(coalesce(v_invoice.buyer_reference, '')) = '' or upper(btrim(v_invoice.buyer_reference)) = 'NA' then
      raise exception 'buyer_reference_required';
    end if;
  end if;
  if v_invoice.customer_type = 'business' and exists (
    select 1 from public.invoice_line_items where invoice_id = p_invoice_id and vat_rate = 0.06
  ) then raise exception 'reduced_vat_b2b_unsupported'; end if;
  if exists (select 1 from public.invoice_line_items where invoice_id = p_invoice_id and vat_rate = 0.06)
    and (not v_invoice.reduced_vat_confirmed or btrim(coalesce(v_invoice.reduced_vat_declaration, '')) = ''
      or v_invoice.reduced_vat_declaration_version is distinct from 'BE-6PC-2026-01'
      or encode(extensions.digest(convert_to(v_invoice.reduced_vat_declaration, 'UTF8'), 'sha256'), 'hex')
        is distinct from 'e34f9d52a210d664a4e21f1a6817214ba8a48a811e97deb84245e6c9b8bccfbb')
  then raise exception 'reduced_vat_confirmation_required'; end if;
  if v_invoice.vat_treatment = 'reverse_charge' and (
    v_invoice.customer_type <> 'business' or not v_invoice.reverse_charge_confirmed
    or exists (select 1 from public.invoice_line_items where invoice_id = p_invoice_id and (vat_category <> 'AE' or vat_rate <> 0))
  ) then raise exception 'invalid_reverse_charge'; end if;
  if v_invoice.vat_treatment = 'standard' and exists (
    select 1 from public.invoice_line_items where invoice_id = p_invoice_id and vat_category <> 'S'
  ) then raise exception 'invalid_standard_vat'; end if;

  update public.invoice_line_items
    set line_total_cents = round(quantity * unit_price_cents)::integer
    where invoice_id = p_invoice_id;
  select coalesce(sum(line_total_cents), 0)::integer into v_subtotal
    from public.invoice_line_items where invoice_id = p_invoice_id;
  select coalesce(sum(round(group_subtotal * vat_rate)), 0)::integer into v_vat
  from (
    select vat_category, vat_rate, sum(line_total_cents)::numeric as group_subtotal
    from public.invoice_line_items where invoice_id = p_invoice_id
    group by vat_category, vat_rate
  ) groups;

  v_year := extract(year from v_issue_date)::integer;
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
  select upper(btrim(coalesce(invoice_prefix, 'STQ'))) into v_prefix
    from public.contractors where id = v_invoice.contractor_id;
  if v_prefix !~ '^[A-Z0-9]{1,8}$' then raise exception 'invalid_invoice_prefix'; end if;
  v_number := v_prefix || case when v_invoice.document_type = 'credit_note' then '-CN-' else '-' end
    || v_year::text || '-' || lpad(v_next::text, 4, '0');

  perform set_config('app.issue_context', 'on', true);
  update public.invoices set
    seller_snapshot = v_invoice.seller_snapshot,
    invoice_number = v_number, issue_date = v_issue_date, issued_at = now(), status = 'issued',
    subtotal_cents = v_subtotal, vat_total_cents = v_vat, total_cents = v_subtotal + v_vat,
    document_status = 'pending', document_error = null,
    peppol_validation_release = case when customer_type = 'business' then '3.0.21' else null end,
    retain_until = make_date(v_year + 11, 1, 1),
    transport_status = case when delivery_channel = 'peppol_manual' then 'ready' else 'not_sent' end,
    delivery_status_source = 'system',
    delivery_status = case when delivery_channel = 'peppol_manual' then 'ready_for_upload' else 'not_sent' end
  where id = p_invoice_id returning * into v_invoice;
  insert into public.invoice_events(invoice_id, contractor_id, event_type, actor_type, source, detail)
    values (p_invoice_id, v_invoice.contractor_id, 'issued', 'user', 'app', jsonb_build_object(
      'invoice_number', v_number, 'subtotal_cents', v_subtotal, 'vat_total_cents', v_vat,
      'total_cents', v_subtotal + v_vat
    ));
  return v_invoice;
end;
$$;

create or replace function private.record_invoice_documents(
  p_invoice_id uuid,
  p_pdf_path text default null,
  p_pdf_sha256 text default null,
  p_ubl_path text default null,
  p_ubl_sha256 text default null,
  p_error text default null
) returns public.invoices language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare
  v_invoice public.invoices%rowtype;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  perform private.assert_invoice_owner(v_invoice.contractor_id);
  if v_invoice.status not in ('issued', 'credited') then raise exception 'invoice_not_issued'; end if;
  perform set_config('app.document_context', 'on', true);
  if p_error is not null then
    update public.invoices set document_status = 'failed', document_error = private.sanitize_invoice_error(p_error)
      where id = p_invoice_id returning * into v_invoice;
    insert into public.invoice_events(invoice_id, contractor_id, event_type, actor_type, source, detail)
      values (p_invoice_id, v_invoice.contractor_id, 'document_generation_failed', 'system', 'app',
        jsonb_build_object('message', private.sanitize_invoice_error(p_error)));
    return v_invoice;
  end if;
  if p_pdf_path is null or p_pdf_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_pdf_document'; end if;
  if p_pdf_path is distinct from (v_invoice.contractor_id::text || '/' || v_invoice.id::text || '/' || v_invoice.invoice_number || '.pdf')
    then raise exception 'invalid_pdf_path'; end if;
  if v_invoice.customer_type = 'business' and (p_ubl_path is null or p_ubl_sha256 !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid_ubl_document';
  end if;
  if v_invoice.customer_type = 'business' and p_ubl_path is distinct from
    (v_invoice.contractor_id::text || '/' || v_invoice.id::text || '/' || v_invoice.invoice_number || '.xml')
    then raise exception 'invalid_ubl_path'; end if;
  if (v_invoice.pdf_path is not null and v_invoice.pdf_path is distinct from p_pdf_path)
    or (v_invoice.pdf_sha256 is not null and v_invoice.pdf_sha256 is distinct from p_pdf_sha256)
    or (v_invoice.ubl_path is not null and v_invoice.ubl_path is distinct from p_ubl_path)
    or (v_invoice.ubl_sha256 is not null and v_invoice.ubl_sha256 is distinct from p_ubl_sha256)
  then raise exception 'issued_invoice_documents_immutable'; end if;
  update public.invoices set
    pdf_path = p_pdf_path, pdf_sha256 = p_pdf_sha256,
    ubl_path = case when customer_type = 'business' then p_ubl_path else null end,
    ubl_sha256 = case when customer_type = 'business' then p_ubl_sha256 else null end,
    document_status = 'ready', document_error = null
  where id = p_invoice_id returning * into v_invoice;
  insert into public.invoice_events(invoice_id, contractor_id, event_type, actor_type, source, detail)
    values (p_invoice_id, v_invoice.contractor_id, 'documents_ready', 'system', 'app', jsonb_build_object(
      'pdf_path', p_pdf_path, 'pdf_sha256', p_pdf_sha256,
      'ubl_path', p_ubl_path, 'ubl_sha256', p_ubl_sha256
    ));
  return v_invoice;
end;
$$;

create or replace function private.record_manual_delivery(
  p_invoice_id uuid,
  p_transport_status text,
  p_business_response_status text default null,
  p_external_reference text default null,
  p_receipt_path text default null,
  p_receipt_sha256 text default null
) returns public.invoices language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare
  v_invoice public.invoices%rowtype;
  v_source text;
  v_previous_transport text;
  v_previous_business_response text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  perform private.assert_invoice_owner(v_invoice.contractor_id);
  if v_invoice.status <> 'issued' or not (
    (v_invoice.customer_type = 'business' and v_invoice.delivery_channel = 'peppol_manual')
    or (v_invoice.customer_type = 'private' and v_invoice.delivery_channel = 'email')
  ) then raise exception 'manual_delivery_not_allowed'; end if;
  if p_transport_status not in ('submitted', 'delivered', 'failed') then raise exception 'invalid_transport_status'; end if;
  if v_invoice.customer_type = 'private' and (p_transport_status <> 'delivered' or p_business_response_status is not null)
    then raise exception 'invalid_email_delivery_status'; end if;
  if p_business_response_status is not null and p_business_response_status not in (
    'received', 'accepted', 'conditionally_accepted', 'rejected', 'processing', 'paid', 'information_required'
  ) then raise exception 'invalid_business_response_status'; end if;
  if p_receipt_path is not null and v_invoice.delivery_receipt_path is not null
    and p_receipt_path is distinct from v_invoice.delivery_receipt_path then
    raise exception 'delivery_receipt_immutable';
  end if;
  if p_receipt_path is not null and p_receipt_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_receipt_hash'; end if;
  if p_receipt_path is not null and p_receipt_path !~
    ('^' || v_invoice.contractor_id::text || '/' || v_invoice.id::text || '/delivery-receipt-[0-9a-f]{64}\.[a-z0-9]{1,10}$')
    then raise exception 'invalid_receipt_path'; end if;
  if v_invoice.delivery_receipt_sha256 is not null and p_receipt_sha256 is not null
    and p_receipt_sha256 is distinct from v_invoice.delivery_receipt_sha256 then raise exception 'delivery_receipt_immutable'; end if;
  perform set_config('app.delivery_context', 'on', true);
  v_previous_transport := v_invoice.transport_status;
  v_previous_business_response := v_invoice.business_response_status;
  v_source := case when v_invoice.customer_type = 'private' then 'system' else 'user' end;
  update public.invoices set
    transport_status = p_transport_status,
    business_response_status = p_business_response_status,
    delivery_status_source = v_source,
    delivery_submitted_at = coalesce(delivery_submitted_at, now()),
    delivery_external_reference = nullif(btrim(p_external_reference), ''),
    delivery_receipt_path = coalesce(delivery_receipt_path, p_receipt_path),
    delivery_receipt_sha256 = coalesce(delivery_receipt_sha256, p_receipt_sha256),
    delivery_status = case
      when p_transport_status = 'submitted' then 'submitted'
      when p_transport_status = 'delivered' and customer_type = 'private' then 'sent'
      when p_transport_status = 'delivered' then 'accepted'
      else 'rejected'
    end
  where id = p_invoice_id returning * into v_invoice;
  insert into public.invoice_events(invoice_id, contractor_id, event_type, actor_type, source, detail)
    values (p_invoice_id, v_invoice.contractor_id, 'delivery_status_changed',
      case when v_invoice.customer_type = 'private' then 'system' else 'user' end,
      case when v_invoice.customer_type = 'private' then 'app' else 'manual' end, jsonb_build_object(
      'transport_status', p_transport_status,
      'previous_transport_status', v_previous_transport,
      'previous_business_response_status', v_previous_business_response,
      'business_response_status', p_business_response_status,
      'external_reference', nullif(btrim(p_external_reference), '')
    ));
  return v_invoice;
end;
$$;

create or replace function private.set_invoice_paid(p_invoice_id uuid, p_paid boolean)
returns public.invoices language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare
  v_invoice public.invoices%rowtype;
  v_previous_paid boolean;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  perform private.assert_invoice_owner(v_invoice.contractor_id);
  if v_invoice.status <> 'issued' or v_invoice.document_type <> 'invoice' then raise exception 'payment_tracking_not_allowed'; end if;
  v_previous_paid := v_invoice.paid_at is not null;
  perform set_config('app.payment_context', 'on', true);
  update public.invoices set paid_at = case when p_paid then now() else null end
    where id = p_invoice_id returning * into v_invoice;
  insert into public.invoice_events(invoice_id, contractor_id, event_type, actor_type, source, detail)
    values (p_invoice_id, v_invoice.contractor_id, 'payment_status_changed', 'user', 'app', jsonb_build_object(
      'previous_paid', v_previous_paid, 'paid', p_paid
    ));
  return v_invoice;
end;
$$;

create or replace function private.issue_full_credit_note(p_original_invoice_id uuid)
returns public.invoices language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare
  v_original public.invoices%rowtype;
  v_credit public.invoices%rowtype;
  v_year integer := extract(year from current_date)::integer;
  v_next integer;
  v_prefix text;
  v_number text;
begin
  select * into v_original from public.invoices where id = p_original_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  perform private.assert_invoice_owner(v_original.contractor_id);
  if v_original.status <> 'issued' or v_original.document_type <> 'invoice' then raise exception 'credit_note_not_allowed'; end if;
  if exists (select 1 from public.invoices where original_invoice_id = p_original_invoice_id and document_type = 'credit_note') then
    raise exception 'credit_note_exists';
  end if;

  insert into public.document_counters(contractor_id, year, series, last_value)
    values (v_original.contractor_id, v_year, 'credit_note', 0)
    on conflict (contractor_id, year, series) do nothing;
  select last_value into v_next from public.document_counters
    where contractor_id = v_original.contractor_id and year = v_year and series = 'credit_note' for update;
  v_next := v_next + 1;
  update public.document_counters set last_value = v_next
    where contractor_id = v_original.contractor_id and year = v_year and series = 'credit_note';
  select upper(btrim(coalesce(invoice_prefix, 'STQ'))) into v_prefix
    from public.contractors where id = v_original.contractor_id;
  if v_prefix !~ '^[A-Z0-9]{1,8}$' then raise exception 'invalid_invoice_prefix'; end if;
  v_number := v_prefix || '-CN-' || v_year::text || '-' || lpad(v_next::text, 4, '0');

  insert into public.invoices (
    contractor_id, quote_id, document_type, original_invoice_id, original_invoice_number,
    status, customer_type, customer_name, customer_address, customer_street,
    customer_postal_code, customer_city, customer_country_code, customer_email,
    customer_phone, customer_vat_number, customer_enterprise_number, customer_peppol_id,
    seller_snapshot, buyer_snapshot, invoice_number, issue_date, delivery_date, due_date,
    buyer_reference, vat_treatment, reverse_charge_confirmed, reduced_vat_confirmed,
    reduced_vat_declaration, reduced_vat_declaration_version, subtotal_cents, vat_total_cents, total_cents,
    delivery_channel, delivery_status, transport_status, delivery_status_source,
    document_status, peppol_validation_release, issued_at, retain_until
  ) values (
    v_original.contractor_id, v_original.quote_id, 'credit_note', v_original.id, v_original.invoice_number,
    'issued', v_original.customer_type, v_original.customer_name, v_original.customer_address,
    v_original.customer_street, v_original.customer_postal_code, v_original.customer_city,
    v_original.customer_country_code, v_original.customer_email, v_original.customer_phone,
    v_original.customer_vat_number, v_original.customer_enterprise_number, v_original.customer_peppol_id,
    v_original.seller_snapshot, v_original.buyer_snapshot, v_number, current_date,
    v_original.delivery_date, null, v_original.buyer_reference, v_original.vat_treatment,
    v_original.reverse_charge_confirmed, v_original.reduced_vat_confirmed,
    v_original.reduced_vat_declaration, v_original.reduced_vat_declaration_version,
    v_original.subtotal_cents, v_original.vat_total_cents,
    v_original.total_cents, v_original.delivery_channel,
    case when v_original.delivery_channel = 'peppol_manual' then 'ready_for_upload' else 'not_sent' end,
    case when v_original.delivery_channel = 'peppol_manual' then 'ready' else 'not_sent' end,
    'system', 'pending', v_original.peppol_validation_release, now(), make_date(v_year + 11, 1, 1)
  ) returning * into v_credit;
  insert into public.invoice_line_items (
    invoice_id, description, quantity, unit, unit_code, unit_price_cents,
    vat_rate, vat_category, line_total_cents, sort_order
  ) select v_credit.id, description, quantity, unit, unit_code, unit_price_cents,
    vat_rate, vat_category, line_total_cents, sort_order
    from public.invoice_line_items where invoice_id = v_original.id order by sort_order, id;

  perform set_config('app.credit_context', 'on', true);
  update public.invoices set status = 'credited' where id = v_original.id;
  insert into public.invoice_events(invoice_id, contractor_id, event_type, actor_type, source, detail)
    values
      (v_credit.id, v_credit.contractor_id, 'issued', 'user', 'app', jsonb_build_object(
        'invoice_number', v_number, 'original_invoice_number', v_original.invoice_number
      )),
      (v_original.id, v_original.contractor_id, 'credited', 'user', 'app', jsonb_build_object(
        'credit_note_id', v_credit.id, 'credit_note_number', v_number
      ));
  return v_credit;
end;
$$;

create or replace function private.queue_peppol_submission(
  p_invoice_id uuid, p_connection_id uuid, p_idempotency_key text
) returns public.peppol_submissions language plpgsql security definer
set search_path = public, private, extensions, pg_catalog as $$
declare
  v_invoice public.invoices%rowtype;
  v_connection public.peppol_connections%rowtype;
  v_submission public.peppol_submissions%rowtype;
  v_expected_key text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  perform private.assert_invoice_owner(v_invoice.contractor_id);
  if v_invoice.status <> 'issued' or v_invoice.customer_type <> 'business'
    or v_invoice.delivery_channel <> 'peppol_api' or v_invoice.document_status <> 'ready'
    or v_invoice.ubl_sha256 is null then raise exception 'invoice_not_ready_for_api_delivery'; end if;
  select * into v_connection from public.peppol_connections
    where id = p_connection_id and contractor_id = v_invoice.contractor_id and status = 'active';
  if not found then raise exception 'active_connection_not_found'; end if;
  v_expected_key := encode(extensions.digest(
    convert_to(v_invoice.contractor_id::text || ':' || v_invoice.id::text || ':' || v_invoice.ubl_sha256, 'UTF8'),
    'sha256'
  ), 'hex');
  if p_idempotency_key is distinct from v_expected_key then raise exception 'invalid_idempotency_key'; end if;
  insert into public.peppol_submissions(
    contractor_id, invoice_id, connection_id, provider_key, idempotency_key, ubl_sha256
  ) values (
    v_invoice.contractor_id, v_invoice.id, v_connection.id, v_connection.provider_key,
    p_idempotency_key, v_invoice.ubl_sha256
  ) on conflict (invoice_id) do update set invoice_id = excluded.invoice_id
  returning * into v_submission;
  perform set_config('app.delivery_context', 'on', true);
  update public.invoices set transport_status = 'queued', delivery_status_source = 'system'
    where id = v_invoice.id;
  insert into public.peppol_submission_events(submission_id, contractor_id, status, detail)
    values (v_submission.id, v_invoice.contractor_id, 'queued', jsonb_build_object('idempotency_key', p_idempotency_key));
  insert into public.invoice_events(invoice_id, contractor_id, event_type, actor_type, source, detail)
    values (v_invoice.id, v_invoice.contractor_id, 'peppol_queued', 'user', 'app', jsonb_build_object('submission_id', v_submission.id));
  return v_submission;
end;
$$;

create or replace function private.claim_peppol_submissions(p_limit integer default 10)
returns setof public.peppol_submissions language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  return query
  with claimed as (
    select id from public.peppol_submissions
    where status in ('queued', 'retry', 'submitted') and next_attempt_at <= now()
    order by next_attempt_at, created_at
    for update skip locked limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.peppol_submissions submission set
    processing_operation = case
      when submission.status = 'submitted' then 'poll'
      when submission.status = 'queued' then 'submit'
      else submission.processing_operation
    end,
    status = 'processing', attempts = submission.attempts + 1, updated_at = now()
  from claimed where submission.id = claimed.id returning submission.*;
end;
$$;

create or replace function private.finish_peppol_submission(
  p_submission_id uuid, p_status text, p_external_submission_id text default null,
  p_business_response_status text default null, p_retry_after_seconds integer default null,
  p_error_code text default null, p_error_message text default null
) returns public.peppol_submissions language plpgsql security definer
set search_path = public, pg_catalog as $$
declare
  v_submission public.peppol_submissions%rowtype;
  v_previous_transport text;
  v_previous_business_response text;
begin
  if p_status not in ('retry', 'submitted', 'delivered', 'failed') then raise exception 'invalid_submission_status'; end if;
  update public.peppol_submissions set
    status = p_status,
    external_submission_id = coalesce(external_submission_id, nullif(p_external_submission_id, '')),
    business_response_status = p_business_response_status,
    processing_operation = case when p_status = 'submitted' then 'poll' else processing_operation end,
    next_attempt_at = case
      when p_status = 'retry' then now() + make_interval(secs => greatest(coalesce(p_retry_after_seconds, 60), 1))
      when p_status = 'submitted' then now() + interval '5 minutes'
      else next_attempt_at end,
    submitted_at = case when p_status in ('submitted', 'delivered') then coalesce(submitted_at, now()) else submitted_at end,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    error_code = nullif(left(coalesce(p_error_code, ''), 100), ''),
    error_message = nullif(private.sanitize_invoice_error(p_error_message), ''), updated_at = now()
  where id = p_submission_id and status = 'processing' returning * into v_submission;
  if not found then raise exception 'submission_not_processing'; end if;
  select transport_status, business_response_status into v_previous_transport, v_previous_business_response
    from public.invoices where id = v_submission.invoice_id;
  perform set_config('app.delivery_context', 'on', true);
  update public.invoices set
    transport_status = case when p_status = 'retry' then 'queued' else p_status end,
    delivery_status = case
      when p_status = 'submitted' then 'submitted'
      when p_status = 'delivered' then 'accepted'
      when p_status = 'failed' then 'rejected'
      else delivery_status end,
    business_response_status = p_business_response_status,
    delivery_status_source = 'provider',
    delivery_external_reference = coalesce(delivery_external_reference, nullif(p_external_submission_id, '')),
    delivery_submitted_at = case when p_status in ('submitted', 'delivered') then coalesce(delivery_submitted_at, now()) else delivery_submitted_at end
  where id = v_submission.invoice_id;
  insert into public.peppol_submission_events(submission_id, contractor_id, status, detail)
    values (v_submission.id, v_submission.contractor_id, p_status, jsonb_strip_nulls(jsonb_build_object(
      'external_submission_id', p_external_submission_id, 'business_response_status', p_business_response_status,
      'error_code', nullif(left(coalesce(p_error_code, ''), 100), ''),
      'error_message', nullif(private.sanitize_invoice_error(p_error_message), '')
    )));
  insert into public.invoice_events(invoice_id, contractor_id, event_type, actor_type, source, provider_reference, detail)
    values (v_submission.invoice_id, v_submission.contractor_id, 'peppol_status_changed', 'provider', 'provider',
      nullif(p_external_submission_id, ''), jsonb_build_object(
        'previous_transport_status', v_previous_transport,
        'transport_status', case when p_status = 'retry' then 'queued' else p_status end,
        'previous_business_response_status', v_previous_business_response,
        'business_response_status', p_business_response_status
      ));
  return v_submission;
end;
$$;

create or replace function public.prevent_issued_invoice_mutation()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare
  old_immutable jsonb;
  new_immutable jsonb;
begin
  if old.status = 'draft' and new.status = 'issued' and current_setting('app.issue_context', true) <> 'on' then
    raise exception 'issue_through_rpc_only';
  end if;
  if old.status in ('issued', 'credited') then
    old_immutable := to_jsonb(old) - array[
      'paid_at', 'delivery_status', 'delivery_submitted_at', 'delivery_external_reference',
      'delivery_receipt_path', 'delivery_receipt_sha256', 'transport_status', 'business_response_status', 'delivery_status_source',
      'pdf_path', 'ubl_path', 'pdf_sha256', 'ubl_sha256', 'document_status', 'document_error',
      'updated_at', 'status'
    ];
    new_immutable := to_jsonb(new) - array[
      'paid_at', 'delivery_status', 'delivery_submitted_at', 'delivery_external_reference',
      'delivery_receipt_path', 'delivery_receipt_sha256', 'transport_status', 'business_response_status', 'delivery_status_source',
      'pdf_path', 'ubl_path', 'pdf_sha256', 'ubl_sha256', 'document_status', 'document_error',
      'updated_at', 'status'
    ];
    if old_immutable <> new_immutable then raise exception 'issued_invoice_immutable'; end if;
    if old.paid_at is distinct from new.paid_at and current_setting('app.payment_context', true) <> 'on' then
      raise exception 'payment_through_rpc_only';
    end if;
    if (old.transport_status is distinct from new.transport_status
      or old.business_response_status is distinct from new.business_response_status
      or old.delivery_status_source is distinct from new.delivery_status_source
      or old.delivery_receipt_path is distinct from new.delivery_receipt_path
      or old.delivery_receipt_sha256 is distinct from new.delivery_receipt_sha256
      or old.delivery_status is distinct from new.delivery_status
      or old.delivery_submitted_at is distinct from new.delivery_submitted_at
      or old.delivery_external_reference is distinct from new.delivery_external_reference)
      and current_setting('app.delivery_context', true) <> 'on' then raise exception 'delivery_through_rpc_only'; end if;
    if (old.pdf_path is distinct from new.pdf_path or old.ubl_path is distinct from new.ubl_path
      or old.pdf_sha256 is distinct from new.pdf_sha256 or old.ubl_sha256 is distinct from new.ubl_sha256
      or old.document_status is distinct from new.document_status or old.document_error is distinct from new.document_error)
      and current_setting('app.document_context', true) <> 'on' then raise exception 'documents_through_rpc_only'; end if;
    if (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path)
      or (old.ubl_path is not null and new.ubl_path is distinct from old.ubl_path)
      or (old.pdf_sha256 is not null and new.pdf_sha256 is distinct from old.pdf_sha256)
      or (old.ubl_sha256 is not null and new.ubl_sha256 is distinct from old.ubl_sha256)
    then raise exception 'issued_invoice_documents_immutable'; end if;
    if old.status = 'credited' and new.status <> 'credited' then raise exception 'credited_invoice_immutable'; end if;
    if old.status = 'issued' and new.status = 'credited' and current_setting('app.credit_context', true) <> 'on' then
      raise exception 'credit_through_rpc_only';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_invoice_event_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'invoice_events_append_only';
end;
$$;
drop trigger if exists invoice_events_append_only on public.invoice_events;
create trigger invoice_events_append_only before update or delete on public.invoice_events
for each row execute function public.prevent_invoice_event_mutation();

create or replace function public.prevent_peppol_event_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'peppol_events_append_only';
end;
$$;
drop trigger if exists peppol_submission_events_append_only on public.peppol_submission_events;
create trigger peppol_submission_events_append_only before update or delete on public.peppol_submission_events
for each row execute function public.prevent_peppol_event_mutation();

create or replace function public.prevent_issued_invoice_prefix_change()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if old.invoice_prefix is distinct from new.invoice_prefix and exists (
    select 1 from public.invoices where contractor_id = old.id and status in ('issued', 'credited')
  ) then raise exception 'invoice_prefix_locked'; end if;
  return new;
end;
$$;
drop trigger if exists contractors_lock_invoice_prefix on public.contractors;
create trigger contractors_lock_invoice_prefix before update of invoice_prefix on public.contractors
for each row execute function public.prevent_issued_invoice_prefix_change();

create or replace function public.create_invoice_draft_from_quote(p_quote_id uuid, p_draft jsonb)
returns public.invoices language sql security definer set search_path = ''
as $$ select private.create_invoice_draft_from_quote(p_quote_id, p_draft) $$;
create or replace function public.save_invoice_draft(p_invoice_id uuid, p_draft jsonb)
returns public.invoices language sql security definer set search_path = ''
as $$ select private.save_invoice_draft(p_invoice_id, p_draft) $$;
create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoices language sql security definer set search_path = ''
as $$ select private.issue_invoice(p_invoice_id) $$;
create or replace function public.record_invoice_documents(
  p_invoice_id uuid, p_pdf_path text default null, p_pdf_sha256 text default null,
  p_ubl_path text default null, p_ubl_sha256 text default null, p_error text default null
) returns public.invoices language sql security definer set search_path = ''
as $$ select private.record_invoice_documents(p_invoice_id, p_pdf_path, p_pdf_sha256, p_ubl_path, p_ubl_sha256, p_error) $$;
create or replace function public.record_manual_delivery(
  p_invoice_id uuid, p_transport_status text, p_business_response_status text default null,
  p_external_reference text default null, p_receipt_path text default null, p_receipt_sha256 text default null
) returns public.invoices language sql security definer set search_path = ''
as $$ select private.record_manual_delivery(p_invoice_id, p_transport_status, p_business_response_status, p_external_reference, p_receipt_path, p_receipt_sha256) $$;
create or replace function public.set_invoice_paid(p_invoice_id uuid, p_paid boolean)
returns public.invoices language sql security definer set search_path = ''
as $$ select private.set_invoice_paid(p_invoice_id, p_paid) $$;
create or replace function public.issue_full_credit_note(p_original_invoice_id uuid)
returns public.invoices language sql security definer set search_path = ''
as $$ select private.issue_full_credit_note(p_original_invoice_id) $$;
create or replace function public.queue_peppol_submission(p_invoice_id uuid, p_connection_id uuid, p_idempotency_key text)
returns public.peppol_submissions language sql security definer set search_path = ''
as $$ select private.queue_peppol_submission(p_invoice_id, p_connection_id, p_idempotency_key) $$;
create or replace function public.claim_peppol_submissions(p_limit integer default 10)
returns setof public.peppol_submissions language sql security definer set search_path = ''
as $$ select * from private.claim_peppol_submissions(p_limit) $$;
create or replace function public.finish_peppol_submission(
  p_submission_id uuid, p_status text, p_external_submission_id text default null,
  p_business_response_status text default null, p_retry_after_seconds integer default null,
  p_error_code text default null, p_error_message text default null
) returns public.peppol_submissions language sql security definer set search_path = ''
as $$ select private.finish_peppol_submission(p_submission_id, p_status, p_external_submission_id,
  p_business_response_status, p_retry_after_seconds, p_error_code, p_error_message) $$;

drop policy if exists invoices_own_insert on public.invoices;
drop policy if exists invoices_own_update on public.invoices;
drop policy if exists invoices_own_update_draft on public.invoices;
drop policy if exists invoices_own_update_tracking on public.invoices;
drop policy if exists invoices_own_delete_draft on public.invoices;
drop policy if exists invoice_line_items_own_insert on public.invoice_line_items;
drop policy if exists invoice_line_items_own_update on public.invoice_line_items;
drop policy if exists invoice_line_items_own_delete on public.invoice_line_items;
drop policy if exists invoice_events_own_insert on public.invoice_events;

revoke all on public.document_counters, public.invoices, public.invoice_line_items,
  public.invoice_events, public.peppol_connections, public.peppol_connection_secrets,
  public.peppol_submissions, public.peppol_submission_events from anon;
revoke insert, update, delete on public.document_counters, public.invoices, public.invoice_line_items,
  public.invoice_events, public.peppol_connections, public.peppol_connection_secrets,
  public.peppol_submissions, public.peppol_submission_events from authenticated;
revoke select on public.document_counters, public.peppol_connection_secrets from authenticated;
grant select on public.invoices, public.invoice_line_items, public.invoice_events,
  public.peppol_connections, public.peppol_submissions, public.peppol_submission_events to authenticated;

revoke usage on schema private from anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.mark_invoice_credited(uuid) from public, anon, authenticated;
revoke execute on function public.prevent_invoice_event_mutation() from public, anon, authenticated;
revoke execute on function public.prevent_peppol_event_mutation() from public, anon, authenticated;
revoke execute on function public.prevent_issued_invoice_prefix_change() from public, anon, authenticated;
revoke execute on function public.create_invoice_draft_from_quote(uuid, jsonb) from public, anon;
revoke execute on function public.save_invoice_draft(uuid, jsonb) from public, anon;
revoke execute on function public.issue_invoice(uuid) from public, anon;
revoke execute on function public.record_invoice_documents(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.record_manual_delivery(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.set_invoice_paid(uuid, boolean) from public, anon;
revoke execute on function public.issue_full_credit_note(uuid) from public, anon;
revoke execute on function public.queue_peppol_submission(uuid, uuid, text) from public, anon;
revoke execute on function public.claim_peppol_submissions(integer) from public, anon, authenticated;
revoke execute on function public.finish_peppol_submission(uuid, text, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.create_invoice_draft_from_quote(uuid, jsonb) to authenticated;
grant execute on function public.save_invoice_draft(uuid, jsonb) to authenticated;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.record_invoice_documents(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.record_manual_delivery(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.set_invoice_paid(uuid, boolean) to authenticated;
grant execute on function public.issue_full_credit_note(uuid) to authenticated;
grant execute on function public.queue_peppol_submission(uuid, uuid, text) to authenticated;
grant execute on function public.claim_peppol_submissions(integer) to service_role;
grant execute on function public.finish_peppol_submission(uuid, text, text, text, integer, text, text) to service_role;

drop policy if exists invoice_documents_insert_own on storage.objects;
drop policy if exists invoice_documents_select_own on storage.objects;
create policy invoice_documents_select_own on storage.objects for select to authenticated using (
  bucket_id = 'invoice-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
);
