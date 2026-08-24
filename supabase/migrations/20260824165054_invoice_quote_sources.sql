-- Invoicing compatibility for accepted quote families.
-- Migration version aligned with the hosted production history.
-- The legacy invoices.quote_id column remains for historical documents and
-- older integrations; invoice_quote_sources is authoritative for new drafts.

create table if not exists public.invoice_quote_sources (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete restrict,
  quote_id uuid not null references public.quotes(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (invoice_id, quote_id),
  unique (quote_id)
);

alter table public.invoice_line_items
  add column if not exists source_quote_id uuid references public.quotes(id) on delete restrict,
  add column if not exists source_quote_line_item_id uuid references public.quote_line_items(id) on delete restrict;

create index if not exists invoice_quote_sources_invoice_idx
  on public.invoice_quote_sources(invoice_id, created_at);
create index if not exists invoice_quote_sources_contractor_idx
  on public.invoice_quote_sources(contractor_id, created_at desc);
create index if not exists invoice_line_items_source_quote_idx
  on public.invoice_line_items(source_quote_id, source_quote_line_item_id);

-- Existing invoice.quote_id is deterministic provenance, so backfill it. The
-- source status is intentionally not inferred; it only records the known link.
insert into public.invoice_quote_sources (invoice_id, contractor_id, quote_id)
select i.id, i.contractor_id, i.quote_id
from public.invoices i
join public.quotes q on q.id = i.quote_id and q.contractor_id = i.contractor_id
where i.document_type = 'invoice'
on conflict (quote_id) do nothing;

alter table public.invoice_quote_sources enable row level security;
drop policy if exists invoice_quote_sources_own_read on public.invoice_quote_sources;
create policy invoice_quote_sources_own_read on public.invoice_quote_sources
  for select to authenticated using (contractor_id = (select auth.uid()));

revoke all on public.invoice_quote_sources from anon, authenticated;
grant select on public.invoice_quote_sources to authenticated;

create or replace function private.insert_invoice_lines(p_invoice_id uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = public, private, pg_catalog as $$
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'invoice_without_lines';
  end if;

  insert into public.invoice_line_items (
    invoice_id, description, quantity, unit, unit_code, unit_price_cents,
    vat_rate, vat_category, line_total_cents, sort_order,
    source_quote_id, source_quote_line_item_id
  )
  select p_invoice_id, btrim(x.description), x.quantity, btrim(x.unit), x.unit_code,
    x.unit_price_cents, x.vat_rate, x.vat_category,
    round(x.quantity * x.unit_price_cents)::integer, x.sort_order,
    x.source_quote_id, x.source_quote_line_item_id
  from jsonb_to_recordset(p_lines) as x(
    description text, quantity numeric, unit text, unit_code text,
    unit_price_cents integer, vat_rate numeric, vat_category text, sort_order integer,
    source_quote_id uuid, source_quote_line_item_id uuid
  );

  if exists (
    select 1 from public.invoice_line_items
    where invoice_id = p_invoice_id and (
      description = '' or quantity <= 0 or unit_price_cents < 0
      or unit_code not in ('MTK', 'HUR', 'C62', 'MTR', 'KGM')
      or vat_category not in ('S', 'AE') or vat_rate not in (0, 0.06, 0.21)
      or (vat_category = 'AE' and vat_rate <> 0)
      or (vat_category = 'S' and vat_rate not in (0.06, 0.21))
      or (source_quote_line_item_id is not null and source_quote_id is null)
      or (source_quote_line_item_id is not null and not exists (
        select 1 from public.quote_line_items qli
        where qli.id = source_quote_line_item_id and qli.quote_id = source_quote_id
      ))
      or (source_quote_id is not null and not exists (
        select 1 from public.invoice_quote_sources s
        where s.invoice_id = p_invoice_id and s.quote_id = source_quote_id
      ))
    )
  ) then raise exception 'invalid_invoice_line'; end if;
end;
$$;

create or replace function private.create_invoice_draft_from_quotes(
  p_quote_ids uuid[],
  p_draft jsonb
)
returns public.invoices language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare
  v_invoice public.invoices%rowtype;
  v_contractor_id uuid := auth.uid();
  v_ids uuid[];
  v_first public.quotes%rowtype;
  v_family_id uuid;
  v_id uuid;
begin
  if v_contractor_id is null then raise exception 'not_authenticated'; end if;
  select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into v_ids
  from unnest(coalesce(p_quote_ids, '{}'::uuid[])) x
  where x is not null;
  if cardinality(v_ids) = 0 then raise exception 'invoice_quote_source_required'; end if;

  if (select count(*) from public.quotes q where q.id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'accepted_quote_not_found';
  end if;

  -- Lock the source rows before checking consumption so two concurrent drafts
  -- cannot reserve the same accepted quote family.
  perform 1 from public.quotes q where q.id = any(v_ids) order by q.id for update;
  select * into v_first from public.quotes q where q.id = v_ids[1];
  if not found then raise exception 'accepted_quote_not_found'; end if;
  v_family_id := coalesce(v_first.parent_quote_id, v_first.id);

  if exists (
    select 1 from public.quotes q
    where q.id = any(v_ids)
      and (q.contractor_id is distinct from v_contractor_id
        or q.status <> 'accepted'
        or coalesce(q.parent_quote_id, q.id) is distinct from v_family_id)
  ) then raise exception 'invoice_quote_source_ineligible'; end if;

  if v_first.customer_id is not null then
    if exists (select 1 from public.quotes q where q.id = any(v_ids) and q.customer_id is distinct from v_first.customer_id) then
      raise exception 'invoice_quote_customer_mismatch';
    end if;
  elsif exists (
    select 1 from public.quotes q where q.id = any(v_ids)
      and (q.customer_id is not null
        or lower(trim(coalesce(q.customer_name, ''))) is distinct from lower(trim(coalesce(v_first.customer_name, '')))
        or lower(trim(coalesce(q.customer_address, ''))) is distinct from lower(trim(coalesce(v_first.customer_address, '')))
        or lower(trim(coalesce(q.customer_email, ''))) is distinct from lower(trim(coalesce(v_first.customer_email, '')))
        or lower(trim(coalesce(q.customer_phone, ''))) is distinct from lower(trim(coalesce(v_first.customer_phone, ''))))
  ) then raise exception 'invoice_quote_customer_mismatch'; end if;

  if exists (select 1 from public.invoice_quote_sources s where s.quote_id = any(v_ids))
    or exists (select 1 from public.invoices i where i.document_type = 'invoice' and i.quote_id = any(v_ids))
  then raise exception 'invoice_source_already_used'; end if;

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
    v_contractor_id, v_ids[1], 'invoice', 'draft', p_draft->>'customer_type',
    p_draft->>'customer_name', coalesce(p_draft->>'customer_address', ''),
    p_draft->>'customer_street', p_draft->>'customer_postal_code', p_draft->>'customer_city',
    coalesce(p_draft->>'customer_country_code', 'BE'), nullif(p_draft->>'customer_email', ''),
    nullif(p_draft->>'customer_phone', ''), nullif(p_draft->>'customer_vat_number', ''),
    nullif(p_draft->>'customer_enterprise_number', ''), nullif(p_draft->>'customer_peppol_id', ''),
    coalesce(p_draft->'seller_snapshot', '{}'::jsonb), coalesce(p_draft->'buyer_snapshot', '{}'::jsonb),
    nullif(p_draft->>'issue_date', '')::date, nullif(p_draft->>'delivery_date', '')::date,
    nullif(p_draft->>'due_date', '')::date, coalesce(p_draft->>'buyer_reference', 'NA'),
    coalesce(p_draft->>'vat_treatment', 'standard'), coalesce((p_draft->>'reverse_charge_confirmed')::boolean, false),
    coalesce((p_draft->>'reduced_vat_confirmed')::boolean, false), nullif(p_draft->>'reduced_vat_declaration', ''),
    nullif(p_draft->>'reduced_vat_declaration_version', ''),
    0, 0, 0, coalesce(p_draft->>'delivery_channel', 'email'), 'pending', 'not_sent', 'system'
  ) returning * into v_invoice;

  foreach v_id in array v_ids loop
    insert into public.invoice_quote_sources (invoice_id, contractor_id, quote_id)
    values (v_invoice.id, v_contractor_id, v_id);
  end loop;

  perform private.insert_invoice_lines(v_invoice.id, p_draft->'lines');
  insert into public.invoice_events(invoice_id, contractor_id, event_type, actor_type, source, detail)
    values (v_invoice.id, v_contractor_id, 'draft_created', 'user', 'app', jsonb_build_object('quote_ids', to_jsonb(v_ids)));
  return v_invoice;
exception when unique_violation then
  raise exception 'invoice_source_already_used';
end;
$$;

create or replace function private.create_invoice_draft_from_quote(p_quote_id uuid, p_draft jsonb)
returns public.invoices language sql security definer
set search_path = public, private, pg_catalog as $$
  select private.create_invoice_draft_from_quotes(array[p_quote_id], p_draft)
$$;

create or replace function public.create_invoice_draft_from_quotes(p_quote_ids uuid[], p_draft jsonb)
returns public.invoices language sql security definer set search_path = ''
as $$ select private.create_invoice_draft_from_quotes(p_quote_ids, p_draft) $$;

revoke execute on function public.create_invoice_draft_from_quotes(uuid[], jsonb) from public, anon;
grant execute on function public.create_invoice_draft_from_quotes(uuid[], jsonb) to authenticated;
