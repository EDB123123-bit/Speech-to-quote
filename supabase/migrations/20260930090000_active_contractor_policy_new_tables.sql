-- Keep the multi-tenant hardening invariant true for tables added after it:
-- every RLS application table carries the restrictive `active_contractor_only`
-- policy (see 20260825192348_multi_tenant_hardening.sql and its test).
--
-- pilot_requests and app_admins are server-only and have no browser grants, so
-- the policy changes nothing in practice; it only keeps the rule uniform.
-- The loop only touches tables that are still missing the policy.
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
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.policyname = 'active_contractor_only'
      )
  loop
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
