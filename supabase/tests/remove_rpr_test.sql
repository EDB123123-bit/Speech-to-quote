begin;
select plan(4);

select ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'contractors' and column_name = 'rpr'
), 'contractors no longer stores RPR');
select ok(not exists (
  select 1 from pg_proc p
  where p.prokind = 'f' and pg_get_functiondef(p.oid) ~* '(^|[^a-z])rpr([^a-z]|$)'
), 'database functions contain no RPR references');
select ok(not exists (
  select 1 from pg_policies
  where schemaname = 'public' and (qual ~* '(^|[^a-z])rpr([^a-z]|$)' or with_check ~* '(^|[^a-z])rpr([^a-z]|$)')
), 'RLS policies contain no RPR references');
select ok(not exists (
  select 1 from public.invoices
  where seller_snapshot ? 'rpr' or buyer_snapshot ? 'rpr'
), 'invoice snapshots contain no RPR metadata');

select * from finish();
rollback;
