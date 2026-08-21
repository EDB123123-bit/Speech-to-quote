-- Keep tenant audit-history queries and foreign-key checks efficient as the
-- append-only import-event table grows.
create index if not exists quote_import_events_actor_idx
  on public.quote_import_events (actor_id)
  where actor_id is not null;
