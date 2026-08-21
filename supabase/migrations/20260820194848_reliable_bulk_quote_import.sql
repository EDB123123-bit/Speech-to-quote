-- Reliable bulk PDF quote import.
-- Source PDFs are temporary, tenant-private review artefacts. Approved data is
-- copied atomically into the normal quote model; external AI/storage work stays
-- outside database transactions.

alter table public.catalog_items
  add column if not exists pricing_mode text not null default 'split',
  add column if not exists combined_price_cents integer;

alter table public.catalog_items
  alter column materials_price_cents drop not null,
  alter column labor_price_cents drop not null;

alter table public.catalog_items
  drop constraint if exists catalog_items_materials_price_cents_check,
  drop constraint if exists catalog_items_labor_price_cents_check,
  drop constraint if exists catalog_items_pricing_mode_check,
  drop constraint if exists catalog_items_pricing_shape_check;

alter table public.catalog_items
  add constraint catalog_items_pricing_mode_check
    check (pricing_mode in ('split', 'combined')),
  add constraint catalog_items_pricing_shape_check check (
    (pricing_mode = 'split'
      and materials_price_cents is not null and materials_price_cents >= 0
      and labor_price_cents is not null and labor_price_cents >= 0
      and combined_price_cents is null)
    or
    (pricing_mode = 'combined'
      and combined_price_cents is not null and combined_price_cents >= 0
      and materials_price_cents is null and labor_price_cents is null)
  );

alter table public.quotes
  add column if not exists source text not null default 'voice',
  add column if not exists quote_number text,
  add column if not exists issue_date date,
  add column if not exists valid_until date,
  add column if not exists order_reference text;

update public.quotes
set quote_number = upper(substr(id::text, 1, 8))
where quote_number is null;

update public.quotes
set issue_date = (created_at at time zone 'Europe/Brussels')::date
where issue_date is null;

create or replace function public.populate_quote_identity()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.quote_number is null or btrim(new.quote_number) = '' then
    new.quote_number := upper(substr(new.id::text, 1, 8));
  end if;
  if new.issue_date is null then
    new.issue_date := (coalesce(new.created_at, now()) at time zone 'Europe/Brussels')::date;
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_populate_identity on public.quotes;
create trigger quotes_populate_identity before insert on public.quotes
for each row execute function public.populate_quote_identity();

alter table public.quotes
  alter column quote_number set not null,
  alter column issue_date set not null,
  drop constraint if exists quotes_source_check,
  drop constraint if exists quotes_validity_check;

alter table public.quotes
  add constraint quotes_source_check check (source in ('voice', 'pdf_import')),
  add constraint quotes_validity_check check (valid_until is null or valid_until >= issue_date);

create unique index if not exists quotes_contractor_number_unique_idx
  on public.quotes (contractor_id, lower(quote_number));
create index if not exists quotes_issue_date_idx
  on public.quotes (contractor_id, issue_date desc);
create index if not exists quotes_pipeline_stage_idx
  on public.quotes (pipeline_stage_id) where pipeline_stage_id is not null;

alter table public.quote_line_items
  add column if not exists source_notes text,
  add column if not exists vat_category text not null default 'S';

alter table public.quote_line_items
  drop constraint if exists quote_line_items_line_type_check,
  drop constraint if exists quote_line_items_vat_rate_check,
  drop constraint if exists quote_line_items_vat_category_check,
  drop constraint if exists quote_line_items_vat_consistency_check;

alter table public.quote_line_items
  add constraint quote_line_items_line_type_check
    check (line_type in ('materials', 'labor', 'combined')),
  add constraint quote_line_items_vat_rate_check
    check (vat_rate is null or vat_rate in (0, 0.06, 0.21)),
  add constraint quote_line_items_vat_category_check
    check (vat_category in ('S', 'AE')),
  add constraint quote_line_items_vat_consistency_check check (
    vat_rate is null
    or (vat_category = 'AE' and vat_rate = 0)
    or (vat_category = 'S' and vat_rate in (0.06, 0.21))
  );
create index if not exists quote_line_items_catalog_item_idx
  on public.quote_line_items (catalog_item_id) where catalog_item_id is not null;

create table if not exists public.quote_import_batches (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  requested_quote_count integer not null check (requested_quote_count between 1 and 25),
  processing_mode text not null check (processing_mode in ('interactive', 'provider_batch')),
  status text not null default 'active' check (status in ('active', 'completed', 'failed')),
  file_count integer not null default 0 check (file_count between 0 and 25),
  total_bytes bigint not null default 0 check (total_bytes between 0 and 209715200),
  profile_suggestion jsonb,
  profile_suggestion_status text not null default 'pending'
    check (profile_suggestion_status in ('pending', 'accepted', 'rejected', 'unavailable')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quote_import_batches_list_idx
  on public.quote_import_batches (contractor_id, created_at desc);

create table if not exists public.quote_import_documents (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.quote_import_batches(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  semantic_hash text check (semantic_hash is null or semantic_hash ~ '^[0-9a-f]{64}$'),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 20971520),
  page_count integer check (page_count between 1 and 20),
  storage_path text,
  source_deleted_at timestamptz,
  cleanup_status text not null default 'not_applicable'
    check (cleanup_status in ('not_applicable', 'pending', 'deleted', 'failed')),
  status text not null default 'uploaded' check (status in (
    'uploaded', 'processing', 'ready_for_review', 'importing', 'imported',
    'duplicate', 'unsupported', 'failed'
  )),
  duplicate_of uuid references public.quote_import_documents(id) on delete set null,
  locked_until timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 20),
  extraction_model text,
  extraction_schema_version text,
  extracted_payload jsonb,
  reviewed_payload jsonb,
  validation_result jsonb,
  identity_mode text check (identity_mode in ('preserve_source', 'new_identity')),
  warnings_acknowledged boolean not null default false,
  rounding_override_reason text,
  quote_id uuid unique references public.quotes(id) on delete set null,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  processing_duration_ms integer check (processing_duration_ms is null or processing_duration_ms >= 0),
  provider_batch_id text unique,
  provider_batch_status text check (provider_batch_status in ('submitting', 'in_progress', 'canceling', 'ended')),
  provider_batch_expires_at timestamptz,
  provider_batch_ended_at timestamptz,
  provider_result_status text check (provider_result_status in ('succeeded', 'errored', 'canceled', 'expired')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quote_import_documents_batch_idx
  on public.quote_import_documents (batch_id, created_at);
create index if not exists quote_import_documents_contractor_idx
  on public.quote_import_documents (contractor_id, batch_id, status);
create index if not exists quote_import_documents_duplicate_idx
  on public.quote_import_documents (duplicate_of) where duplicate_of is not null;
create index if not exists quote_import_documents_work_idx
  on public.quote_import_documents (status, locked_until, created_at);
create index if not exists quote_import_documents_provider_work_idx
  on public.quote_import_documents (provider_batch_status, provider_batch_expires_at)
  where provider_batch_id is not null;
create index if not exists quote_import_documents_semantic_hash_idx
  on public.quote_import_documents (contractor_id, semantic_hash) where semantic_hash is not null;
create unique index if not exists quote_import_documents_imported_hash_idx
  on public.quote_import_documents (contractor_id, sha256)
  where quote_id is not null;
create unique index if not exists quote_import_documents_storage_path_idx
  on public.quote_import_documents (storage_path)
  where storage_path is not null;

create table if not exists public.quote_import_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.quote_import_batches(id) on delete cascade,
  document_id uuid references public.quote_import_documents(id) on delete cascade,
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  source text not null check (source in ('user', 'system', 'extractor')),
  from_status text,
  to_status text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quote_import_events_batch_idx
  on public.quote_import_events (batch_id, created_at desc);
create index if not exists quote_import_events_document_idx
  on public.quote_import_events (document_id) where document_id is not null;
create index if not exists quote_import_events_contractor_idx
  on public.quote_import_events (contractor_id, created_at desc);

create or replace function public.populate_quote_import_event_actor()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.actor_id is null and new.source = 'user' then new.actor_id := auth.uid(); end if;
  return new;
end;
$$;
create trigger quote_import_events_actor before insert on public.quote_import_events
for each row execute function public.populate_quote_import_event_actor();

create table if not exists public.catalog_price_suggestions (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  normalized_description text not null,
  suggested_name text not null,
  unit text not null,
  unit_code text not null check (unit_code in ('MTK', 'HUR', 'C62', 'MTR', 'KGM')),
  vat_rate numeric(4,2) not null check (vat_rate in (0.06, 0.21)),
  latest_price_cents integer not null check (latest_price_cents >= 0),
  minimum_price_cents integer not null check (minimum_price_cents >= 0),
  maximum_price_cents integer not null check (maximum_price_cents >= 0),
  observation_count integer not null default 1 check (observation_count > 0),
  source_quote_ids uuid[] not null default '{}',
  latest_source_date date,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  accepted_catalog_item_id uuid references public.catalog_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contractor_id, normalized_description, unit, vat_rate)
);
create index if not exists catalog_price_suggestions_list_idx
  on public.catalog_price_suggestions (contractor_id, status, updated_at desc);
create index if not exists catalog_price_suggestions_accepted_idx
  on public.catalog_price_suggestions (accepted_catalog_item_id)
  where accepted_catalog_item_id is not null;

alter table public.quote_import_batches enable row level security;
alter table public.quote_import_documents enable row level security;
alter table public.quote_import_events enable row level security;
alter table public.catalog_price_suggestions enable row level security;

create policy quote_import_batches_own_read on public.quote_import_batches
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy quote_import_documents_own_read on public.quote_import_documents
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy quote_import_events_own_read on public.quote_import_events
  for select to authenticated using (contractor_id = (select auth.uid()));
create policy catalog_price_suggestions_own_read on public.catalog_price_suggestions
  for select to authenticated using (contractor_id = (select auth.uid()));

create or replace function public.touch_quote_import_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger quote_import_batches_touch before update on public.quote_import_batches
for each row execute function public.touch_quote_import_updated_at();
create trigger quote_import_documents_touch before update on public.quote_import_documents
for each row execute function public.touch_quote_import_updated_at();
create trigger catalog_price_suggestions_touch before update on public.catalog_price_suggestions
for each row execute function public.touch_quote_import_updated_at();

create or replace function public.prevent_quote_import_event_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'quote_import_events_append_only';
end;
$$;
create trigger quote_import_events_append_only before update or delete on public.quote_import_events
for each row execute function public.prevent_quote_import_event_mutation();

create or replace function private.require_quote_import_user()
returns uuid language plpgsql stable set search_path = public, pg_catalog as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists (
    select 1 from public.contractors where id = v_user_id and deactivated_at is null
  ) then raise exception 'unauthorized'; end if;
  return v_user_id;
end;
$$;

create or replace function private.refresh_quote_import_batch(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_open integer;
begin
  select count(*) into v_open
  from public.quote_import_documents
  where batch_id = p_batch_id
    and status in ('uploaded', 'processing', 'ready_for_review', 'importing');

  if v_open = 0 and exists (
    select 1 from public.quote_import_documents where batch_id = p_batch_id
  ) then
    update public.quote_import_batches
    set status = 'completed', completed_at = coalesce(completed_at, now())
    where id = p_batch_id;
  else
    update public.quote_import_batches
    set status = 'active', completed_at = null
    where id = p_batch_id;
  end if;
end;
$$;

create or replace function private.create_quote_import_batch(p_requested_quote_count integer)
returns public.quote_import_batches language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare v_contractor_id uuid := private.require_quote_import_user();
declare v_batch public.quote_import_batches;
begin
  if p_requested_quote_count not between 1 and 25 then raise exception 'invalid_requested_quote_count'; end if;
  insert into public.quote_import_batches (contractor_id, requested_quote_count, processing_mode)
  values (
    v_contractor_id,
    p_requested_quote_count,
    case when p_requested_quote_count > 20 then 'provider_batch' else 'interactive' end
  ) returning * into v_batch;
  insert into public.quote_import_events (batch_id, contractor_id, event_type, source, detail)
  values (
    v_batch.id,
    v_contractor_id,
    'batch_created',
    'user',
    jsonb_build_object(
      'requested_quote_count', p_requested_quote_count,
      'processing_mode', v_batch.processing_mode
    )
  );
  return v_batch;
end;
$$;

create or replace function private.register_quote_import_document(
  p_batch_id uuid, p_original_filename text, p_storage_path text,
  p_sha256 text, p_file_size_bytes bigint
) returns public.quote_import_documents language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare v_contractor_id uuid := private.require_quote_import_user();
declare v_batch public.quote_import_batches;
declare v_existing public.quote_import_documents;
declare v_document public.quote_import_documents;
begin
  select * into v_batch from public.quote_import_batches
  where id = p_batch_id and contractor_id = v_contractor_id for update;
  if not found then raise exception 'import_batch_not_found'; end if;
  if v_batch.file_count >= v_batch.requested_quote_count then raise exception 'import_batch_file_limit'; end if;
  if p_file_size_bytes < 1 or p_file_size_bytes > 20971520 then raise exception 'import_file_size_limit'; end if;
  if v_batch.total_bytes + p_file_size_bytes > 209715200 then raise exception 'import_batch_size_limit'; end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_sha256'; end if;
  if char_length(btrim(p_original_filename)) not between 1 and 255 then raise exception 'invalid_filename'; end if;
  if p_storage_path !~ ('^' || v_contractor_id::text || '/' || p_batch_id::text
    || '/[0-9a-f]{64}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$') then
    raise exception 'invalid_storage_path';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_contractor_id::text || ':' || p_sha256, 0));
  select * into v_existing from public.quote_import_documents
  where contractor_id = v_contractor_id and sha256 = p_sha256
    and status in ('uploaded', 'processing', 'ready_for_review', 'importing', 'imported', 'duplicate')
  order by created_at desc limit 1;

  insert into public.quote_import_documents (
      batch_id, contractor_id, original_filename, storage_path, sha256,
      file_size_bytes, status, duplicate_of, cleanup_status
    ) values (
      p_batch_id, v_contractor_id, btrim(p_original_filename), p_storage_path,
      p_sha256, p_file_size_bytes,
      case when v_existing.id is null then 'uploaded' else 'duplicate' end,
      v_existing.id,
      case when v_existing.id is null then 'not_applicable' else 'pending' end
    ) returning * into v_document;

  update public.quote_import_batches
  set file_count = file_count + 1, total_bytes = total_bytes + p_file_size_bytes,
      status = 'active', completed_at = null
  where id = p_batch_id;
  insert into public.quote_import_events (
    batch_id, document_id, contractor_id, event_type, source, detail
  ) values (
    p_batch_id, v_document.id, v_contractor_id,
    case when v_existing.id is null then 'document_uploaded' else 'duplicate_detected' end,
    'user', jsonb_build_object('size_bytes', p_file_size_bytes)
  );
  perform private.refresh_quote_import_batch(p_batch_id);
  return v_document;
end;
$$;

create or replace function private.claim_quote_import_document(
  p_document_id uuid, p_contractor_id uuid
) returns public.quote_import_documents language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_document public.quote_import_documents;
declare v_batch public.quote_import_batches;
begin
  select * into v_document from public.quote_import_documents
  where id = p_document_id and contractor_id = p_contractor_id
    and attempts < 20
    and (status in ('uploaded', 'failed') or (status = 'processing' and locked_until < now()))
  for update;
  if not found then raise exception 'document_not_claimable'; end if;
  select * into v_batch from public.quote_import_batches
  where id = v_document.batch_id and contractor_id = p_contractor_id for share;
  if v_batch.processing_mode <> 'interactive' then raise exception 'interactive_document_required'; end if;
  if v_batch.file_count <> v_batch.requested_quote_count then raise exception 'batch_upload_incomplete'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_document.batch_id::text, 0));
  if (
    select count(*) from public.quote_import_documents
    where batch_id = v_document.batch_id and status = 'processing'
      and locked_until >= now() and id <> v_document.id
  ) >= 2 then raise exception 'batch_concurrency_limit'; end if;
  update public.quote_import_documents
  set status = 'processing', locked_until = now() + interval '2 minutes',
      attempts = attempts + 1, error_code = null, error_message = null
  where id = v_document.id
  returning * into v_document;
  insert into public.quote_import_events (
    batch_id, document_id, contractor_id, event_type, source, detail
  ) values (
    v_document.batch_id, v_document.id, v_document.contractor_id,
    'processing_started', 'system', jsonb_build_object('attempt', v_document.attempts)
  );
  return v_document;
end;
$$;

create or replace function private.claim_quote_import_provider_document(
  p_document_id uuid, p_contractor_id uuid
) returns public.quote_import_documents language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_document public.quote_import_documents;
declare v_batch public.quote_import_batches;
begin
  select * into v_document from public.quote_import_documents
  where id = p_document_id and contractor_id = p_contractor_id
    and attempts < 20
    and (
      (status = 'uploaded' and provider_batch_id is null)
      or (status = 'failed' and (provider_batch_id is null or provider_batch_status = 'ended'))
      or (
        status = 'processing' and provider_batch_id is null
        and provider_batch_status = 'submitting' and locked_until < now()
      )
    )
  for update;
  if not found then raise exception 'provider_document_not_claimable'; end if;
  select * into v_batch from public.quote_import_batches
  where id = v_document.batch_id and contractor_id = p_contractor_id for share;
  if v_batch.processing_mode <> 'provider_batch' then raise exception 'provider_batch_document_required'; end if;
  if v_batch.file_count <> v_batch.requested_quote_count then raise exception 'batch_upload_incomplete'; end if;
  update public.quote_import_documents
  set status = 'processing', locked_until = now() + interval '2 minutes',
      attempts = attempts + 1, provider_batch_status = 'submitting',
      provider_batch_id = null, provider_batch_expires_at = null,
      provider_batch_ended_at = null, provider_result_status = null,
      error_code = null, error_message = null
  where id = v_document.id
  returning * into v_document;
  insert into public.quote_import_events (
    batch_id, document_id, contractor_id, event_type, source, detail
  ) values (
    v_document.batch_id, v_document.id, v_document.contractor_id,
    'provider_batch_submission_started', 'system',
    jsonb_build_object('attempt', v_document.attempts)
  );
  return v_document;
end;
$$;

create or replace function private.record_quote_import_provider_batch(
  p_document_id uuid, p_contractor_id uuid, p_provider_batch_id text,
  p_provider_status text, p_expires_at timestamptz,
  p_page_count integer, p_extraction_model text, p_schema_version text
) returns public.quote_import_documents language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_document public.quote_import_documents;
begin
  if p_provider_status not in ('in_progress', 'canceling', 'ended') then raise exception 'invalid_provider_batch_status'; end if;
  if nullif(btrim(p_provider_batch_id), '') is null then raise exception 'provider_batch_id_required'; end if;
  select * into v_document from public.quote_import_documents
  where id = p_document_id and contractor_id = p_contractor_id for update;
  if not found then raise exception 'provider_submission_not_found'; end if;
  if v_document.status = 'processing'
    and v_document.provider_batch_id = left(btrim(p_provider_batch_id), 200) then
    return v_document;
  end if;
  update public.quote_import_documents
  set provider_batch_id = left(btrim(p_provider_batch_id), 200),
      provider_batch_status = p_provider_status,
      provider_batch_expires_at = p_expires_at,
      page_count = p_page_count,
      extraction_model = left(p_extraction_model, 100),
      extraction_schema_version = left(p_schema_version, 50),
      locked_until = greatest(coalesce(p_expires_at, now() + interval '24 hours'), now() + interval '1 hour')
  where id = p_document_id and contractor_id = p_contractor_id
    and status = 'processing' and provider_batch_status = 'submitting'
    and provider_batch_id is null
  returning * into v_document;
  if not found then raise exception 'provider_submission_not_found'; end if;
  insert into public.quote_import_events (
    batch_id, document_id, contractor_id, event_type, source, detail
  ) values (
    v_document.batch_id, v_document.id, v_document.contractor_id,
    'provider_batch_submitted', 'extractor',
    jsonb_build_object(
      'provider_batch_id', left(btrim(p_provider_batch_id), 200),
      'provider_status', p_provider_status,
      'expires_at', p_expires_at
    )
  );
  return v_document;
end;
$$;

create or replace function private.record_quote_import_provider_batch_status(
  p_document_id uuid, p_contractor_id uuid, p_provider_status text,
  p_ended_at timestamptz default null, p_result_status text default null
) returns public.quote_import_documents language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_document public.quote_import_documents;
begin
  if p_provider_status not in ('in_progress', 'canceling', 'ended') then raise exception 'invalid_provider_batch_status'; end if;
  if p_result_status is not null and p_result_status not in ('succeeded', 'errored', 'canceled', 'expired') then
    raise exception 'invalid_provider_result_status';
  end if;
  select * into v_document from public.quote_import_documents
  where id = p_document_id and contractor_id = p_contractor_id for update;
  if not found then raise exception 'provider_document_not_found'; end if;
  if v_document.status <> 'processing' then return v_document; end if;
  if v_document.provider_batch_status = p_provider_status
    and (p_result_status is null or v_document.provider_result_status = p_result_status) then
    return v_document;
  end if;
  update public.quote_import_documents
  set provider_batch_status = p_provider_status,
      provider_batch_ended_at = case when p_provider_status = 'ended' then coalesce(p_ended_at, now()) else provider_batch_ended_at end,
      provider_result_status = coalesce(p_result_status, provider_result_status)
  where id = p_document_id and contractor_id = p_contractor_id
    and status = 'processing' and provider_batch_id is not null
  returning * into v_document;
  if not found then raise exception 'provider_document_not_found'; end if;
  if p_provider_status = 'ended' then
    insert into public.quote_import_events (
      batch_id, document_id, contractor_id, event_type, source, detail
    ) values (
      v_document.batch_id, v_document.id, v_document.contractor_id,
      'provider_batch_ended', 'extractor',
      jsonb_build_object('result_status', p_result_status)
    );
  end if;
  return v_document;
end;
$$;

create or replace function private.record_quote_import_result(
  p_document_id uuid, p_contractor_id uuid, p_status text, p_page_count integer,
  p_extraction_model text, p_schema_version text, p_extracted_payload jsonb,
  p_reviewed_payload jsonb, p_validation_result jsonb, p_semantic_hash text,
  p_input_tokens integer, p_output_tokens integer,
  p_duration_ms integer, p_error_code text default null, p_error_message text default null
) returns public.quote_import_documents language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare v_document public.quote_import_documents;
declare v_duplicate public.quote_import_documents;
begin
  select * into v_document from public.quote_import_documents
  where id = p_document_id and contractor_id = p_contractor_id for update;
  if not found then raise exception 'processing_document_not_found'; end if;
  if v_document.status <> 'processing' then
    if v_document.status in ('ready_for_review', 'unsupported', 'failed', 'duplicate', 'imported') then
      return v_document;
    end if;
    raise exception 'processing_document_not_found';
  end if;
  if p_status not in ('ready_for_review', 'unsupported', 'failed') then
    raise exception 'invalid_result_status';
  end if;
  if p_semantic_hash is not null and p_semantic_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_semantic_hash'; end if;
  if p_page_count is not null and p_page_count not between 1 and 20 then
    p_status := 'unsupported';
    p_error_code := 'page_limit';
    p_error_message := 'Het document bevat meer dan 20 pagina''s.';
  end if;
  if p_status = 'ready_for_review' and p_semantic_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_contractor_id::text || ':' || p_semantic_hash, 0));
    select * into v_duplicate from public.quote_import_documents
    where contractor_id = p_contractor_id and semantic_hash = p_semantic_hash
      and id <> p_document_id and status in ('ready_for_review', 'importing', 'imported', 'duplicate')
    order by created_at limit 1;
    if found then p_status := 'duplicate'; end if;
  end if;
  update public.quote_import_documents
  set status = p_status, page_count = p_page_count, extraction_model = left(p_extraction_model, 100),
      extraction_schema_version = left(p_schema_version, 50),
      extracted_payload = case when p_status = 'failed' then null else p_extracted_payload end,
      reviewed_payload = case when p_status = 'ready_for_review' then p_reviewed_payload else null end,
      semantic_hash = p_semantic_hash,
      duplicate_of = case when p_status = 'duplicate' then v_duplicate.id else duplicate_of end,
      cleanup_status = case when p_status = 'duplicate' then 'pending' else cleanup_status end,
      validation_result = p_validation_result, input_tokens = p_input_tokens,
      output_tokens = p_output_tokens, processing_duration_ms = p_duration_ms,
      error_code = left(p_error_code, 100), error_message = left(p_error_message, 500),
      provider_batch_status = case
        when provider_batch_id is null and provider_batch_status = 'submitting' then null
        else provider_batch_status
      end,
      locked_until = null
  where id = p_document_id and contractor_id = p_contractor_id and status = 'processing'
  returning * into v_document;
  if not found then raise exception 'processing_document_not_found'; end if;
  insert into public.quote_import_events (
    batch_id, document_id, contractor_id, event_type, source, detail
  ) values (
    v_document.batch_id, v_document.id, v_document.contractor_id,
    case p_status when 'ready_for_review' then 'extraction_completed'
      when 'unsupported' then 'document_unsupported'
      when 'duplicate' then 'duplicate_detected' else 'processing_failed' end,
    'extractor', jsonb_build_object('status', p_status, 'error_code', p_error_code)
  );
  perform private.refresh_quote_import_batch(v_document.batch_id);
  return v_document;
end;
$$;

create or replace function private.save_quote_import_review(
  p_document_id uuid, p_reviewed_payload jsonb, p_identity_mode text,
  p_warnings_acknowledged boolean default false, p_rounding_override_reason text default null
) returns public.quote_import_documents language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare v_contractor_id uuid := private.require_quote_import_user();
declare v_document public.quote_import_documents;
begin
  if p_identity_mode not in ('preserve_source', 'new_identity') then raise exception 'identity_mode_required'; end if;
  if p_reviewed_payload is null or jsonb_typeof(p_reviewed_payload) <> 'object' then
    raise exception 'invalid_review_payload';
  end if;
  select * into v_document from public.quote_import_documents
  where id = p_document_id and contractor_id = v_contractor_id for update;
  if not found then raise exception 'review_document_not_found'; end if;
  if v_document.quote_id is not null then return v_document; end if;
  if v_document.status <> 'ready_for_review' then raise exception 'review_document_not_found'; end if;
  update public.quote_import_documents
  set reviewed_payload = p_reviewed_payload, identity_mode = p_identity_mode,
      warnings_acknowledged = p_warnings_acknowledged,
      rounding_override_reason = nullif(left(btrim(p_rounding_override_reason), 500), '')
  where id = v_document.id
  returning * into v_document;
  insert into public.quote_import_events (
    batch_id, document_id, contractor_id, event_type, source,
    detail
  ) values (
    v_document.batch_id, v_document.id, v_contractor_id, 'review_saved', 'user',
    jsonb_build_object('identity_mode', p_identity_mode, 'warnings_acknowledged', p_warnings_acknowledged)
  );
  return v_document;
end;
$$;

create or replace function private.approve_quote_import_document(p_document_id uuid)
returns public.quotes language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare v_contractor_id uuid := private.require_quote_import_user();
declare v_document public.quote_import_documents;
declare v_quote public.quotes;
declare v_quote_id uuid := gen_random_uuid();
declare v_quote_number text;
declare v_issue_date date;
declare v_valid_until date;
declare v_customer jsonb;
declare v_meta jsonb;
declare v_lines jsonb;
declare v_line_count integer;
declare v_stage_id uuid;
declare v_line record;
declare v_normalized text;
declare v_calculated_subtotal bigint;
declare v_calculated_vat bigint;
declare v_source_subtotal bigint;
declare v_source_vat bigint;
declare v_source_total bigint;
begin
  select * into v_document from public.quote_import_documents
  where id = p_document_id and contractor_id = v_contractor_id for update;
  if not found then raise exception 'review_document_not_found'; end if;
  if v_document.quote_id is not null then
    select * into v_quote from public.quotes where id = v_document.quote_id;
    return v_quote;
  end if;
  if v_document.status <> 'ready_for_review' or v_document.reviewed_payload is null then
    raise exception 'document_not_ready_for_approval';
  end if;
  if v_document.identity_mode is null then raise exception 'identity_mode_required'; end if;
  if (
    coalesce(jsonb_array_length(coalesce(v_document.reviewed_payload->'inferredPaths', '[]'::jsonb)), 0) > 0
    or coalesce(jsonb_array_length(coalesce(v_document.validation_result->'issues', '[]'::jsonb)), 0) > 0
  ) and not v_document.warnings_acknowledged then
    raise exception 'review_acknowledgement_required';
  end if;
  if exists (
    select 1 from public.quote_import_documents
    where contractor_id = v_contractor_id and sha256 = v_document.sha256
      and quote_id is not null and id <> v_document.id
  ) then raise exception 'document_already_imported'; end if;

  v_customer := v_document.reviewed_payload->'customer';
  v_meta := v_document.reviewed_payload->'quote';
  v_lines := v_document.reviewed_payload->'lines';
  if jsonb_typeof(v_customer) <> 'object' or jsonb_typeof(v_meta) <> 'object'
    or jsonb_typeof(v_lines) <> 'array' then raise exception 'invalid_review_payload'; end if;
  v_line_count := jsonb_array_length(v_lines);
  if v_line_count < 1 or v_line_count > 250 then raise exception 'invalid_line_count'; end if;

  if v_document.identity_mode = 'preserve_source' then
    v_quote_number := btrim(v_meta->>'number');
    v_issue_date := nullif(v_meta->>'issueDate', '')::date;
    v_valid_until := nullif(v_meta->>'validUntil', '')::date;
    if v_quote_number = '' or v_issue_date is null then raise exception 'source_identity_incomplete'; end if;
  else
    v_quote_number := upper(substr(v_quote_id::text, 1, 8));
    v_issue_date := (now() at time zone 'Europe/Brussels')::date;
    v_valid_until := v_issue_date + 30;
  end if;
  if v_valid_until is not null and v_valid_until < v_issue_date then raise exception 'invalid_valid_until'; end if;
  if exists (
    select 1 from public.quotes
    where contractor_id = v_contractor_id and lower(quote_number) = lower(v_quote_number)
  ) then raise exception 'duplicate_quote_number'; end if;

  for v_line in
    select * from jsonb_to_recordset(v_lines) as x(
      description text, notes text, quantity numeric, unit text, "unitCode" text,
      "unitPriceCents" integer, "vatRate" numeric, "vatCategory" text, "lineType" text
    )
  loop
    if btrim(coalesce(v_line.description, '')) = '' or v_line.quantity is null or v_line.quantity <= 0
      or btrim(coalesce(v_line.unit, '')) = '' or v_line."unitPriceCents" is null
      or v_line."unitPriceCents" < 0 then raise exception 'invalid_import_line'; end if;
    if v_line."unitCode" is not null and v_line."unitCode" not in ('MTK', 'HUR', 'C62', 'MTR', 'KGM') then
      raise exception 'invalid_import_unit_code';
    end if;
    if not ((v_line."vatCategory" = 'AE' and v_line."vatRate" = 0)
      or (v_line."vatCategory" = 'S' and v_line."vatRate" in (0.06, 0.21))) then
      raise exception 'invalid_import_vat';
    end if;
  end loop;

  select coalesce(sum(line_total), 0), coalesce(sum(round(group_total * vat_rate)), 0)
  into v_calculated_subtotal, v_calculated_vat
  from (
    select (x."vatRate")::numeric as vat_rate,
      sum(round((x.quantity)::numeric * (x."unitPriceCents")::numeric))::numeric as group_total,
      sum(round((x.quantity)::numeric * (x."unitPriceCents")::numeric))::bigint as line_total
    from jsonb_to_recordset(v_lines) as x(quantity numeric, "unitPriceCents" integer, "vatRate" numeric)
    group by x."vatRate"
  ) totals;
  v_source_subtotal := nullif(v_document.reviewed_payload->'sourceTotals'->>'subtotalCents', '')::bigint;
  v_source_vat := nullif(v_document.reviewed_payload->'sourceTotals'->>'vatTotalCents', '')::bigint;
  v_source_total := nullif(v_document.reviewed_payload->'sourceTotals'->>'totalCents', '')::bigint;
  if (v_source_subtotal is not null and abs(v_source_subtotal - v_calculated_subtotal) > 1)
    or (v_source_vat is not null and abs(v_source_vat - v_calculated_vat) > 1)
    or (v_source_total is not null and abs(v_source_total - (v_calculated_subtotal + v_calculated_vat)) > 1)
  then
    if not v_document.warnings_acknowledged
      or nullif(btrim(coalesce(v_document.rounding_override_reason, '')), '') is null then
      raise exception 'reviewed_totals_mismatch_unacknowledged';
    end if;
  end if;

  select id into v_stage_id from public.pipeline_stages
  where contractor_id = v_contractor_id order by sort_order, id limit 1;
  update public.quote_import_documents set status = 'importing' where id = v_document.id;

  insert into public.quotes (
    id, contractor_id, status, source, quote_number, issue_date, valid_until,
    order_reference, customer_name, customer_address, customer_email,
    customer_phone, pipeline_stage_id
  ) values (
    v_quote_id, v_contractor_id, 'draft', 'pdf_import', v_quote_number, v_issue_date,
    v_valid_until, nullif(btrim(v_meta->>'orderReference'), ''),
    nullif(btrim(v_customer->>'name'), ''), nullif(btrim(v_customer->>'address'), ''),
    nullif(btrim(v_customer->>'email'), ''), nullif(btrim(v_customer->>'phone'), ''),
    v_stage_id
  ) returning * into v_quote;

  insert into public.quote_line_items (
    quote_id, description, source_notes, quantity, unit, unit_code,
    unit_price_cents, vat_rate, vat_category, line_type, sort_order
  )
  select v_quote.id, btrim(line->>'description'), nullif(btrim(line->>'notes'), ''),
    (line->>'quantity')::numeric, btrim(line->>'unit'), nullif(line->>'unitCode', ''),
    (line->>'unitPriceCents')::integer, (line->>'vatRate')::numeric,
    line->>'vatCategory', coalesce(nullif(line->>'lineType', ''), 'combined'), ordinality::integer - 1
  from jsonb_array_elements(v_lines) with ordinality as item(line, ordinality);

  for v_line in
    select description, quantity, unit, unit_code, unit_price_cents, vat_rate
    from public.quote_line_items
    where quote_id = v_quote.id and vat_category = 'S' and unit_code is not null
  loop
    v_normalized := lower(regexp_replace(btrim(v_line.description), '[^[:alnum:]]+', ' ', 'g'));
    insert into public.catalog_price_suggestions (
      contractor_id, normalized_description, suggested_name, unit, unit_code, vat_rate,
      latest_price_cents, minimum_price_cents, maximum_price_cents,
      observation_count, source_quote_ids, latest_source_date
    ) values (
      v_contractor_id, v_normalized, v_line.description, v_line.unit, v_line.unit_code,
      v_line.vat_rate, v_line.unit_price_cents, v_line.unit_price_cents,
      v_line.unit_price_cents, 1, array[v_quote.id], v_issue_date
    )
    on conflict (contractor_id, normalized_description, unit, vat_rate) do update set
      latest_price_cents = case
        when excluded.latest_source_date >= coalesce(public.catalog_price_suggestions.latest_source_date, '-infinity'::date)
        then excluded.latest_price_cents else public.catalog_price_suggestions.latest_price_cents end,
      suggested_name = case
        when excluded.latest_source_date >= coalesce(public.catalog_price_suggestions.latest_source_date, '-infinity'::date)
        then excluded.suggested_name else public.catalog_price_suggestions.suggested_name end,
      minimum_price_cents = least(public.catalog_price_suggestions.minimum_price_cents, excluded.minimum_price_cents),
      maximum_price_cents = greatest(public.catalog_price_suggestions.maximum_price_cents, excluded.maximum_price_cents),
      observation_count = public.catalog_price_suggestions.observation_count + 1,
      source_quote_ids = array_append(public.catalog_price_suggestions.source_quote_ids, v_quote.id),
      latest_source_date = greatest(public.catalog_price_suggestions.latest_source_date, excluded.latest_source_date);
  end loop;

  update public.quote_import_documents
  set status = 'imported', quote_id = v_quote.id, cleanup_status = 'pending', locked_until = null
  where id = v_document.id;
  insert into public.quote_import_events (
    batch_id, document_id, contractor_id, event_type, source, detail
  ) values (
    v_document.batch_id, v_document.id, v_contractor_id, 'document_imported', 'user',
    jsonb_build_object('quote_id', v_quote.id, 'identity_mode', v_document.identity_mode)
  );
  perform private.refresh_quote_import_batch(v_document.batch_id);
  return v_quote;
end;
$$;

create or replace function private.record_quote_import_source_deleted(
  p_document_id uuid, p_success boolean, p_error_message text default null
) returns public.quote_import_documents language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_document public.quote_import_documents;
begin
  update public.quote_import_documents
  set storage_path = case when p_success then null else storage_path end,
      source_deleted_at = case when p_success then now() else source_deleted_at end,
      cleanup_status = case when p_success then 'deleted' else 'failed' end,
      error_code = case when p_success then error_code else 'source_cleanup_failed' end,
      error_message = case when p_success then error_message else left(p_error_message, 500) end
  where id = p_document_id
  returning * into v_document;
  if not found then raise exception 'import_document_not_found'; end if;
  insert into public.quote_import_events (
    batch_id, document_id, contractor_id, event_type, source, detail
  ) values (
    v_document.batch_id, v_document.id, v_document.contractor_id,
    case when p_success then 'source_deleted' else 'source_delete_failed' end,
    'system', jsonb_build_object('success', p_success)
  );
  return v_document;
end;
$$;

create or replace function private.claim_quote_import_cleanup(p_limit integer default 25)
returns setof public.quote_import_documents language plpgsql security definer
set search_path = public, pg_catalog as $$
begin
  return query
  with candidates as (
    select id from public.quote_import_documents
    where storage_path is not null and (
      cleanup_status in ('pending', 'failed')
      or (created_at < now() - interval '14 days' and status <> 'processing')
    )
    order by created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  )
  update public.quote_import_documents d
  set cleanup_status = 'pending',
      status = case when d.created_at < now() - interval '14 days'
        and d.status not in ('imported', 'duplicate') then 'failed' else d.status end,
      error_code = case when d.created_at < now() - interval '14 days'
        and d.status not in ('imported', 'duplicate') then 'source_expired' else d.error_code end,
      error_message = case when d.created_at < now() - interval '14 days'
        and d.status not in ('imported', 'duplicate') then null else d.error_message end
  from candidates c where d.id = c.id returning d.*;
end;
$$;

create or replace function private.set_quote_import_profile_suggestion(
  p_batch_id uuid, p_contractor_id uuid, p_suggestion jsonb
) returns public.quote_import_batches language plpgsql security definer
set search_path = public, pg_catalog as $$
declare v_batch public.quote_import_batches;
begin
  update public.quote_import_batches
  set profile_suggestion = p_suggestion,
      profile_suggestion_status = case when p_suggestion is null then 'unavailable' else 'pending' end
  where id = p_batch_id and contractor_id = p_contractor_id
  returning * into v_batch;
  if not found then raise exception 'import_batch_not_found'; end if;
  return v_batch;
end;
$$;

create or replace function private.review_quote_import_profile_suggestion(
  p_batch_id uuid, p_accept boolean, p_profile jsonb default null
) returns public.quote_import_batches language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare v_contractor_id uuid := private.require_quote_import_user();
declare v_batch public.quote_import_batches;
begin
  select * into v_batch from public.quote_import_batches
  where id = p_batch_id and contractor_id = v_contractor_id for update;
  if not found then raise exception 'import_batch_not_found'; end if;
  if p_accept then
    if nullif(btrim(p_profile->>'vatNumber'), '') is not null
      and not private.valid_belgian_enterprise_number(p_profile->>'vatNumber') then
      raise exception 'invalid_profile_vat';
    end if;
    if nullif(btrim(p_profile->>'enterpriseNumber'), '') is not null
      and not private.valid_belgian_enterprise_number(p_profile->>'enterpriseNumber') then
      raise exception 'invalid_profile_enterprise_number';
    end if;
    if nullif(btrim(p_profile->>'iban'), '') is not null
      and not private.valid_iban(p_profile->>'iban') then
      raise exception 'invalid_profile_iban';
    end if;
    update public.contractors set
      company_name = coalesce(nullif(btrim(p_profile->>'companyName'), ''), company_name),
      address = coalesce(nullif(btrim(p_profile->>'address'), ''), address),
      street = coalesce(nullif(btrim(p_profile->>'street'), ''), street),
      postal_code = coalesce(nullif(btrim(p_profile->>'postalCode'), ''), postal_code),
      city = coalesce(nullif(btrim(p_profile->>'city'), ''), city),
      vat_number = coalesce(nullif(btrim(p_profile->>'vatNumber'), ''), vat_number),
      registration_number = coalesce(nullif(btrim(p_profile->>'enterpriseNumber'), ''), registration_number),
      phone = coalesce(nullif(btrim(p_profile->>'phone'), ''), phone),
      email = coalesce(nullif(btrim(p_profile->>'email'), ''), email),
      iban = coalesce(nullif(btrim(p_profile->>'iban'), ''), iban)
    where id = v_contractor_id;
  end if;
  update public.quote_import_batches
  set profile_suggestion_status = case when p_accept then 'accepted' else 'rejected' end
  where id = p_batch_id returning * into v_batch;
  insert into public.quote_import_events (batch_id, contractor_id, event_type, source, detail)
  values (p_batch_id, v_contractor_id, 'profile_suggestion_reviewed', 'user',
    jsonb_build_object('accepted', p_accept));
  return v_batch;
end;
$$;

create or replace function private.review_catalog_price_suggestion(
  p_suggestion_id uuid, p_accept boolean, p_input jsonb default null
) returns public.catalog_price_suggestions language plpgsql security definer
set search_path = public, private, pg_catalog as $$
declare v_contractor_id uuid := private.require_quote_import_user();
declare v_suggestion public.catalog_price_suggestions;
declare v_catalog public.catalog_items;
begin
  select * into v_suggestion from public.catalog_price_suggestions
  where id = p_suggestion_id and contractor_id = v_contractor_id and status = 'pending' for update;
  if not found then raise exception 'catalog_suggestion_not_found'; end if;
  if p_accept then
    if btrim(coalesce(p_input->>'name', '')) = '' or btrim(coalesce(p_input->>'unit', '')) = ''
      or (p_input->>'unitCode') not in ('MTK', 'HUR', 'C62', 'MTR', 'KGM')
      or (p_input->>'priceCents')::integer < 0
      or (p_input->>'vatRate')::numeric not in (0.06, 0.21)
    then raise exception 'invalid_catalog_suggestion_input'; end if;
    insert into public.catalog_items (
      contractor_id, name, unit, unit_code, pricing_mode, combined_price_cents,
      materials_price_cents, labor_price_cents, vat_rate
    ) values (
      v_contractor_id, btrim(p_input->>'name'), btrim(p_input->>'unit'),
      p_input->>'unitCode', 'combined', (p_input->>'priceCents')::integer,
      null, null, (p_input->>'vatRate')::numeric
    ) returning * into v_catalog;
    update public.catalog_price_suggestions
    set status = 'accepted', accepted_catalog_item_id = v_catalog.id
    where id = p_suggestion_id returning * into v_suggestion;
  else
    update public.catalog_price_suggestions set status = 'rejected'
    where id = p_suggestion_id returning * into v_suggestion;
  end if;
  return v_suggestion;
end;
$$;

create or replace function private.redact_deleted_imported_quote()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if old.source = 'pdf_import' and old.status = 'draft' then
    insert into public.quote_import_events (batch_id, document_id, contractor_id, event_type, source, detail)
    select batch_id, id, contractor_id, 'imported_quote_deleted', 'user',
      jsonb_build_object('quote_id', old.id)
    from public.quote_import_documents where quote_id = old.id;
    update public.quote_import_documents
    set extracted_payload = null, reviewed_payload = null, validation_result = null,
        quote_id = null, status = 'failed', error_code = 'quote_deleted', error_message = null
    where quote_id = old.id;
  end if;
  return old;
end;
$$;
create trigger quotes_redact_import_before_delete
before delete on public.quotes for each row execute function private.redact_deleted_imported_quote();

create or replace function public.create_quote_import_batch(p_requested_quote_count integer)
returns public.quote_import_batches language sql security definer set search_path = ''
as $$ select private.create_quote_import_batch(p_requested_quote_count) $$;
create or replace function public.register_quote_import_document(
  p_batch_id uuid, p_original_filename text, p_storage_path text,
  p_sha256 text, p_file_size_bytes bigint
) returns public.quote_import_documents language sql security definer set search_path = ''
as $$ select private.register_quote_import_document(p_batch_id, p_original_filename, p_storage_path, p_sha256, p_file_size_bytes) $$;
create or replace function public.claim_quote_import_document(p_document_id uuid, p_contractor_id uuid)
returns public.quote_import_documents language sql security definer set search_path = ''
as $$ select private.claim_quote_import_document(p_document_id, p_contractor_id) $$;
create or replace function public.claim_quote_import_provider_document(p_document_id uuid, p_contractor_id uuid)
returns public.quote_import_documents language sql security definer set search_path = ''
as $$ select private.claim_quote_import_provider_document(p_document_id, p_contractor_id) $$;
create or replace function public.record_quote_import_provider_batch(
  p_document_id uuid, p_contractor_id uuid, p_provider_batch_id text,
  p_provider_status text, p_expires_at timestamptz,
  p_page_count integer, p_extraction_model text, p_schema_version text
) returns public.quote_import_documents language sql security definer set search_path = ''
as $$ select private.record_quote_import_provider_batch(
  p_document_id, p_contractor_id, p_provider_batch_id, p_provider_status,
  p_expires_at, p_page_count, p_extraction_model, p_schema_version
) $$;
create or replace function public.record_quote_import_provider_batch_status(
  p_document_id uuid, p_contractor_id uuid, p_provider_status text,
  p_ended_at timestamptz default null, p_result_status text default null
) returns public.quote_import_documents language sql security definer set search_path = ''
as $$ select private.record_quote_import_provider_batch_status(
  p_document_id, p_contractor_id, p_provider_status, p_ended_at, p_result_status
) $$;
create or replace function public.record_quote_import_result(
  p_document_id uuid, p_contractor_id uuid, p_status text, p_page_count integer,
  p_extraction_model text, p_schema_version text, p_extracted_payload jsonb,
  p_reviewed_payload jsonb, p_validation_result jsonb, p_semantic_hash text,
  p_input_tokens integer, p_output_tokens integer,
  p_duration_ms integer, p_error_code text default null, p_error_message text default null
) returns public.quote_import_documents language sql security definer set search_path = ''
as $$ select private.record_quote_import_result(p_document_id, p_contractor_id, p_status, p_page_count,
  p_extraction_model, p_schema_version, p_extracted_payload, p_reviewed_payload, p_validation_result, p_semantic_hash,
  p_input_tokens, p_output_tokens, p_duration_ms, p_error_code, p_error_message) $$;
create or replace function public.save_quote_import_review(
  p_document_id uuid, p_reviewed_payload jsonb, p_identity_mode text,
  p_warnings_acknowledged boolean default false, p_rounding_override_reason text default null
) returns public.quote_import_documents language sql security definer set search_path = ''
as $$ select private.save_quote_import_review(p_document_id, p_reviewed_payload, p_identity_mode,
  p_warnings_acknowledged, p_rounding_override_reason) $$;
create or replace function public.approve_quote_import_document(p_document_id uuid)
returns public.quotes language sql security definer set search_path = ''
as $$ select private.approve_quote_import_document(p_document_id) $$;
create or replace function public.record_quote_import_source_deleted(
  p_document_id uuid, p_success boolean, p_error_message text default null
) returns public.quote_import_documents language sql security definer set search_path = ''
as $$ select private.record_quote_import_source_deleted(p_document_id, p_success, p_error_message) $$;
create or replace function public.claim_quote_import_cleanup(p_limit integer default 25)
returns setof public.quote_import_documents language sql security definer set search_path = ''
as $$ select * from private.claim_quote_import_cleanup(p_limit) $$;
create or replace function public.set_quote_import_profile_suggestion(
  p_batch_id uuid, p_contractor_id uuid, p_suggestion jsonb
) returns public.quote_import_batches language sql security definer set search_path = ''
as $$ select private.set_quote_import_profile_suggestion(p_batch_id, p_contractor_id, p_suggestion) $$;
create or replace function public.review_quote_import_profile_suggestion(
  p_batch_id uuid, p_accept boolean, p_profile jsonb default null
) returns public.quote_import_batches language sql security definer set search_path = ''
as $$ select private.review_quote_import_profile_suggestion(p_batch_id, p_accept, p_profile) $$;
create or replace function public.review_catalog_price_suggestion(
  p_suggestion_id uuid, p_accept boolean, p_input jsonb default null
) returns public.catalog_price_suggestions language sql security definer set search_path = ''
as $$ select private.review_catalog_price_suggestion(p_suggestion_id, p_accept, p_input) $$;

revoke all on public.quote_import_batches, public.quote_import_documents,
  public.quote_import_events, public.catalog_price_suggestions from anon;
revoke insert, update, delete on public.quote_import_batches, public.quote_import_documents,
  public.quote_import_events, public.catalog_price_suggestions from authenticated;
grant select on public.quote_import_batches, public.quote_import_documents,
  public.quote_import_events, public.catalog_price_suggestions to authenticated;
grant select on public.quote_import_batches, public.quote_import_documents,
  public.quote_import_events, public.catalog_price_suggestions to service_role;

revoke execute on function public.touch_quote_import_updated_at() from public, anon, authenticated;
revoke execute on function public.prevent_quote_import_event_mutation() from public, anon, authenticated;
revoke execute on function public.populate_quote_import_event_actor() from public, anon, authenticated;
revoke execute on function public.populate_quote_identity() from public, anon, authenticated;
revoke execute on function public.create_quote_import_batch(integer) from public, anon;
revoke execute on function public.register_quote_import_document(uuid, text, text, text, bigint) from public, anon;
revoke execute on function public.save_quote_import_review(uuid, jsonb, text, boolean, text) from public, anon;
revoke execute on function public.approve_quote_import_document(uuid) from public, anon;
revoke execute on function public.review_quote_import_profile_suggestion(uuid, boolean, jsonb) from public, anon;
revoke execute on function public.review_catalog_price_suggestion(uuid, boolean, jsonb) from public, anon;
grant execute on function public.create_quote_import_batch(integer) to authenticated;
grant execute on function public.register_quote_import_document(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.save_quote_import_review(uuid, jsonb, text, boolean, text) to authenticated;
grant execute on function public.approve_quote_import_document(uuid) to authenticated;
grant execute on function public.review_quote_import_profile_suggestion(uuid, boolean, jsonb) to authenticated;
grant execute on function public.review_catalog_price_suggestion(uuid, boolean, jsonb) to authenticated;

revoke execute on function public.claim_quote_import_document(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.claim_quote_import_provider_document(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.record_quote_import_provider_batch(uuid, uuid, text, text, timestamptz, integer, text, text) from public, anon, authenticated;
revoke execute on function public.record_quote_import_provider_batch_status(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.record_quote_import_result(uuid, uuid, text, integer, text, text, jsonb, jsonb, jsonb, text, integer, integer, integer, text, text) from public, anon, authenticated;
revoke execute on function public.record_quote_import_source_deleted(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.claim_quote_import_cleanup(integer) from public, anon, authenticated;
revoke execute on function public.set_quote_import_profile_suggestion(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.claim_quote_import_document(uuid, uuid) to service_role;
grant execute on function public.claim_quote_import_provider_document(uuid, uuid) to service_role;
grant execute on function public.record_quote_import_provider_batch(uuid, uuid, text, text, timestamptz, integer, text, text) to service_role;
grant execute on function public.record_quote_import_provider_batch_status(uuid, uuid, text, timestamptz, text) to service_role;
grant execute on function public.record_quote_import_result(uuid, uuid, text, integer, text, text, jsonb, jsonb, jsonb, text, integer, integer, integer, text, text) to service_role;
grant execute on function public.record_quote_import_source_deleted(uuid, boolean, text) to service_role;
grant execute on function public.claim_quote_import_cleanup(integer) to service_role;
grant execute on function public.set_quote_import_profile_suggestion(uuid, uuid, jsonb) to service_role;

revoke execute on all functions in schema private from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-imports', 'quote-imports', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy quote_imports_insert_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'quote-imports'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ ('^' || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/[0-9a-f]{64}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$')
  and exists (
    select 1 from public.quote_import_batches b
    where b.id::text = (storage.foldername(name))[2]
      and b.contractor_id = (select auth.uid())
  )
);
create policy quote_imports_select_own on storage.objects for select to authenticated
using (
  bucket_id = 'quote-imports'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
