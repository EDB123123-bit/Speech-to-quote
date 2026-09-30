-- Multi-tenant hardening for the one-auth-user/one-contractor model.
-- Migration version aligned with the hosted production history.
-- This migration is additive and deliberately keeps the existing product model:
-- Supabase Auth manages identities, while public.contractors is the tenant root.

-- New Data API objects must be exposed deliberately. This prevents future tables
-- and functions from becoming browser-accessible through PostgreSQL defaults.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;

-- Anonymous clients do not query application tables directly. Public quote
-- acceptance is intentionally mediated by the server-only token RPC.
revoke all privileges on all tables in schema public from anon;

-- RLS is not evaluated for TRUNCATE, and the application never needs schema-
-- level REFERENCES or TRIGGER privileges through a browser or service key.
revoke truncate, references, trigger on all tables in schema public from authenticated, service_role;

-- The original core tables predate explicit Data API grants. Reset them to the
-- exact operations used by the application so both existing and fresh projects
-- behave identically regardless of Supabase's auto-exposure setting.
revoke all privileges on table
  public.contractors,
  public.catalog_items,
  public.pipeline_stages,
  public.quotes,
  public.quote_line_items,
  public.quote_clarifications,
  public.pipeline_events
from authenticated;

grant select, update on table public.contractors to authenticated;
grant select, insert, update, delete on table public.catalog_items to authenticated;
grant select, insert, update, delete on table public.pipeline_stages to authenticated;
grant select, insert, update, delete on table public.quotes to authenticated;
grant select, insert, update, delete on table public.quote_line_items to authenticated;
grant select, insert, update, delete on table public.quote_clarifications to authenticated;
grant select on table public.pipeline_events to authenticated;

-- Customers were also created while legacy auto-grants were common. Keep delete
-- server-controlled because quotes retain stable customer snapshots.
revoke all privileges on table public.customers from authenticated;
grant select, insert, update on table public.customers to authenticated;

-- Server-side code needs ordinary DML on the core records, never ownership-like
-- TRUNCATE/REFERENCES/TRIGGER powers.
grant select, insert, update, delete on table
  public.contractors,
  public.catalog_items,
  public.pipeline_stages,
  public.quotes,
  public.quote_line_items,
  public.quote_clarifications,
  public.pipeline_events,
  public.customers
to service_role;

-- Remove inherited/direct execution of trigger helpers that remained exposed by
-- historical function defaults. Explicitly granted application RPCs are kept.
revoke execute on all functions in schema public from public, anon;
revoke execute on function public.prepare_quote_line_item_v1() from authenticated;
revoke execute on function public.prevent_issued_invoice_mutation() from authenticated;
revoke execute on function public.touch_gmail_quote_import_updated_at() from authenticated;
revoke execute on function public.touch_invoice_updated_at() from authenticated;

-- Optimize and scope the oldest policies. Contractors may read/update only an
-- active profile; deactivation remains a server-side administrative operation.
drop policy if exists contractors_self on public.contractors;
drop policy if exists contractors_self_select on public.contractors;
drop policy if exists contractors_self_update on public.contractors;
create policy contractors_self_select on public.contractors
  for select to authenticated
  using (id = (select auth.uid()) and deactivated_at is null);
create policy contractors_self_update on public.contractors
  for update to authenticated
  using (id = (select auth.uid()) and deactivated_at is null)
  with check (id = (select auth.uid()) and deactivated_at is null);

drop policy if exists catalog_items_own on public.catalog_items;
create policy catalog_items_own on public.catalog_items
  for all to authenticated
  using (contractor_id = (select auth.uid()))
  with check (contractor_id = (select auth.uid()));

drop policy if exists pipeline_stages_own on public.pipeline_stages;
create policy pipeline_stages_own on public.pipeline_stages
  for all to authenticated
  using (contractor_id = (select auth.uid()))
  with check (contractor_id = (select auth.uid()));

drop policy if exists pipeline_events_own_read on public.pipeline_events;
create policy pipeline_events_own_read on public.pipeline_events
  for select to authenticated
  using (contractor_id = (select auth.uid()));

-- Every RLS-protected application table also requires an active contractor.
-- Restrictive policies compose with the existing ownership policies instead of
-- duplicating or weakening their table-specific rules.
do $policy$
declare
  target record;
begin
  for target in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relname <> 'contractors'
  loop
    execute format('drop policy if exists active_contractor_only on public.%I', target.relname);
    execute format(
      'create policy active_contractor_only on public.%I as restrictive for all to authenticated '
      || 'using ((select exists (select 1 from public.contractors c '
      || 'where c.id = (select auth.uid()) and c.deactivated_at is null))) '
      || 'with check ((select exists (select 1 from public.contractors c '
      || 'where c.id = (select auth.uid()) and c.deactivated_at is null)))',
      target.relname
    );
  end loop;
end
$policy$;

drop policy if exists active_contractor_only on storage.objects;
create policy active_contractor_only on storage.objects
  as restrictive for all to authenticated
  using (
    (select exists (
      select 1 from public.contractors c
      where c.id = (select auth.uid()) and c.deactivated_at is null
    ))
  )
  with check (
    (select exists (
      select 1 from public.contractors c
      where c.id = (select auth.uid()) and c.deactivated_at is null
    ))
  );

-- SECURITY DEFINER RPCs bypass table RLS. A PostgREST pre-request hook applies
-- the same active-account decision before authenticated table and RPC calls.
-- It remains SECURITY INVOKER so its contractor lookup is still governed by RLS.
create or replace function public.check_active_contractor_request()
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  user_id uuid := auth.uid();
begin
  -- Anonymous and service-role requests have no end-user subject. Their access
  -- remains controlled by grants and the narrowly scoped server APIs.
  if user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.contractors c
    where c.id = user_id and c.deactivated_at is null
  ) then
    raise sqlstate '42501' using message = 'account_inactive';
  end if;
end
$function$;

revoke execute on function public.check_active_contractor_request() from public;
grant execute on function public.check_active_contractor_request() to anon, authenticated, service_role, authenticator;
alter role authenticator set pgrst.db_pre_request = 'public.check_active_contractor_request';
notify pgrst, 'reload config';

-- Tenant ownership is part of relational integrity, not merely a UI rule. The
-- triggers reject foreign customer/stage/catalog UUIDs even when a caller can
-- otherwise update its own quote or line item.
create or replace function public.validate_quote_tenant_links()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  linked_contractor_id uuid;
begin
  if new.pipeline_stage_id is not null then
    select s.contractor_id into linked_contractor_id
    from public.pipeline_stages s
    where s.id = new.pipeline_stage_id;

    if linked_contractor_id is distinct from new.contractor_id then
      raise exception 'quote_pipeline_stage_tenant_mismatch';
    end if;
  end if;

  if new.customer_id is not null then
    linked_contractor_id := null;
    select c.contractor_id into linked_contractor_id
    from public.customers c
    where c.id = new.customer_id;

    if linked_contractor_id is distinct from new.contractor_id then
      raise exception 'quote_customer_tenant_mismatch';
    end if;
  end if;

  return new;
end
$function$;

drop trigger if exists zz_quotes_validate_tenant_links on public.quotes;
create trigger zz_quotes_validate_tenant_links
  before insert or update of contractor_id, pipeline_stage_id, customer_id
  on public.quotes
  for each row execute function public.validate_quote_tenant_links();

create or replace function public.validate_quote_line_catalog_tenant()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  quote_contractor_id uuid;
  catalog_contractor_id uuid;
begin
  if new.catalog_item_id is null then
    return new;
  end if;

  select q.contractor_id into quote_contractor_id
  from public.quotes q
  where q.id = new.quote_id;

  select c.contractor_id into catalog_contractor_id
  from public.catalog_items c
  where c.id = new.catalog_item_id;

  if quote_contractor_id is null
    or catalog_contractor_id is distinct from quote_contractor_id then
    raise exception 'quote_line_catalog_tenant_mismatch';
  end if;

  return new;
end
$function$;

drop trigger if exists quote_line_items_validate_catalog_tenant on public.quote_line_items;
create trigger quote_line_items_validate_catalog_tenant
  before insert or update of quote_id, catalog_item_id
  on public.quote_line_items
  for each row execute function public.validate_quote_line_catalog_tenant();

revoke execute on function public.validate_quote_tenant_links() from public, anon, authenticated;
revoke execute on function public.validate_quote_line_catalog_tenant() from public, anon, authenticated;

-- Cover foreign-key lookups and cascades whose existing composite indexes do
-- not start with the referenced column.
create index if not exists contractor_notifications_quote_id_idx
  on public.contractor_notifications (quote_id);
create index if not exists invoice_line_items_source_quote_line_item_id_idx
  on public.invoice_line_items (source_quote_line_item_id);
create index if not exists quote_attachments_quote_id_idx
  on public.quote_attachments (quote_id);
create index if not exists quote_delivery_events_contractor_id_idx
  on public.quote_delivery_events (contractor_id);
create index if not exists supplier_orders_quote_id_idx
  on public.supplier_orders (quote_id);
create index if not exists supplier_orders_supplier_id_idx
  on public.supplier_orders (supplier_id);
