-- Pilot requests submitted on the public landing page. Only server-owned code
-- (the service role, via the requestPilot server action) reads or writes them;
-- browser roles get no privileges at all, so RLS stays enabled without policies.
create table public.pilot_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  company text check (company is null or char_length(company) <= 160),
  phone text not null check (char_length(phone) between 6 and 40),
  email text check (email is null or char_length(email) <= 254),
  region text not null check (region in ('vlaanderen', 'nederland', 'elders')),
  quotes_per_month text check (quotes_per_month is null or quotes_per_month in ('minder-dan-10', '10-30', 'meer-dan-30')),
  note text check (note is null or char_length(note) <= 1000),
  source jsonb not null default '{}'::jsonb,
  status text not null default 'nieuw' check (status in ('nieuw', 'gecontacteerd', 'pilot', 'afgewezen'))
);

comment on table public.pilot_requests is 'Pilot sign-ups from the landing page. Server-only; follow up via status.';

create index pilot_requests_created_at_idx on public.pilot_requests (created_at desc);

alter table public.pilot_requests enable row level security;

revoke all privileges on table public.pilot_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.pilot_requests to service_role;
