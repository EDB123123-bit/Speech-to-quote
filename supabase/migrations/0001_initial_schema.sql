-- Contractors extend Supabase auth.users with business details for the PDF letterhead.
create table contractors (
  id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null,
  address text,
  vat_number text,
  phone text,
  created_at timestamptz not null default now()
);

-- The contractor's own price list. vat_rate is explicit — never defaulted.
create table catalog_items (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  name text not null,
  unit text not null,
  materials_price_cents integer not null check (materials_price_cents >= 0),
  labor_price_cents integer not null check (labor_price_cents >= 0),
  vat_rate numeric(4,2) not null check (vat_rate in (0.06, 0.21)),
  created_at timestamptz not null default now()
);
create index catalog_items_contractor_idx on catalog_items(contractor_id);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  transcript text,
  status text not null default 'draft' check (status in ('draft', 'final')),
  customer_name text,
  customer_address text,
  customer_email text,
  customer_phone text,
  audio_path text,
  audio_deleted_at timestamptz,
  pdf_path text,
  created_at timestamptz not null default now()
);
create index quotes_contractor_idx on quotes(contractor_id, created_at desc);

-- Prices and vat_rate are COPIED here at generation time so later catalog
-- edits never retroactively change an existing quote. Nullable because
-- unmatched/ad-hoc items are created empty for the contractor to fill in.
create table quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  catalog_item_id uuid references catalog_items(id) on delete set null,
  description text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  unit_price_cents integer check (unit_price_cents >= 0),
  vat_rate numeric(4,2) check (vat_rate in (0.06, 0.21)),
  line_type text not null check (line_type in ('materials', 'labor')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index quote_line_items_quote_idx on quote_line_items(quote_id, sort_order);

create table quote_clarifications (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  question_nl text not null,
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'dismissed')),
  retry_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index quote_clarifications_quote_idx on quote_clarifications(quote_id, created_at);

-- Structured pipeline logs, queried directly in the Supabase dashboard.
create table pipeline_events (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes(id) on delete cascade,
  contractor_id uuid not null references contractors(id) on delete cascade,
  step text not null check (step in (
    'upload', 'transcribe', 'extract', 'clarification_answer',
    'tts_generate', 'pdf_generate', 'audio_cleanup'
  )),
  status text not null check (status in ('success', 'error')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index pipeline_events_quote_idx on pipeline_events(quote_id, created_at desc);
create index pipeline_events_contractor_idx on pipeline_events(contractor_id, created_at desc);

-- Row Level Security: a contractor sees only their own data.
alter table contractors enable row level security;
alter table catalog_items enable row level security;
alter table quotes enable row level security;
alter table quote_line_items enable row level security;
alter table quote_clarifications enable row level security;
alter table pipeline_events enable row level security;

create policy contractors_self on contractors
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy catalog_items_own on catalog_items
  for all using (contractor_id = auth.uid()) with check (contractor_id = auth.uid());

create policy quotes_own on quotes
  for all using (contractor_id = auth.uid()) with check (contractor_id = auth.uid());

create policy quote_line_items_own on quote_line_items
  for all using (
    exists (select 1 from quotes q where q.id = quote_id and q.contractor_id = auth.uid())
  ) with check (
    exists (select 1 from quotes q where q.id = quote_id and q.contractor_id = auth.uid())
  );

create policy quote_clarifications_own on quote_clarifications
  for all using (
    exists (select 1 from quotes q where q.id = quote_id and q.contractor_id = auth.uid())
  ) with check (
    exists (select 1 from quotes q where q.id = quote_id and q.contractor_id = auth.uid())
  );

-- Logs are readable by their owner; only the service role writes them.
create policy pipeline_events_own_read on pipeline_events
  for select using (contractor_id = auth.uid());

-- A contractor row is created automatically on signup.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.contractors (id, company_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'company_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
