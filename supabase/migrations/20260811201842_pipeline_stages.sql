-- pipeline_stages: contractor-defined stages after a quote is finalized.
-- Migration version aligned with the hosted production history.
-- Concept and Afgewerkt are NOT rows here — they're derived directly from
-- quotes.status, so there's nothing to keep in sync and nothing that can be
-- accidentally renamed or deleted out from under the app.
create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  name text not null,
  sort_order integer not null,
  created_at timestamptz not null default now()
);
create index pipeline_stages_contractor_idx on pipeline_stages(contractor_id, sort_order);

alter table pipeline_stages enable row level security;
create policy pipeline_stages_own on pipeline_stages
  for all using (contractor_id = auth.uid()) with check (contractor_id = auth.uid());

-- Meaningful only while status = 'final'. null while final means "sitting
-- in Afgewerkt, not moved further yet"; ignored entirely while draft.
-- on delete restrict is a DB-level backstop — the delete action checks for
-- occupying quotes itself and returns a friendly error before this could fire.
alter table quotes add column pipeline_stage_id uuid references pipeline_stages(id) on delete restrict;

-- Extend the existing signup trigger function to also seed 4 default
-- stages for every new contractor, editable/deletable like any other stage.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.contractors (id, company_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'company_name', ''));

  insert into public.pipeline_stages (contractor_id, name, sort_order) values
    (new.id, 'Verzonden naar klant', 1),
    (new.id, 'In onderhandeling', 2),
    (new.id, 'Gewonnen', 3),
    (new.id, 'Verloren', 4);

  return new;
end;
$$;
