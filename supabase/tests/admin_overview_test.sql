begin;
select plan(7);

select results_eq($$select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and table_name='app_admins' and grantee='anon'$$, array[0::bigint], 'anonymous visitors have no admin-table privileges');
select results_eq($$select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and table_name='app_admins' and grantee='authenticated'$$, array[0::bigint], 'contractors cannot read or grant admin rights');
select ok((select relrowsecurity from pg_class where oid = 'public.app_admins'::regclass), 'the admin table keeps row level security enabled');
select ok(not has_function_privilege('anon', 'public.admin_account_overview()', 'EXECUTE'), 'anonymous visitors cannot run the account overview');
select ok(not has_function_privilege('authenticated', 'public.admin_account_overview()', 'EXECUTE'), 'contractors cannot run the account overview');
select ok(has_function_privilege('service_role', 'public.admin_account_overview()', 'EXECUTE'), 'the server can run the account overview');
select lives_ok($$select * from public.admin_account_overview()$$, 'the account overview runs on an empty or seeded database');

select * from finish();
rollback;
