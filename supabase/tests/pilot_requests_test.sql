begin;
select plan(5);

select results_eq($$select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and table_name='pilot_requests' and grantee='anon'$$, array[0::bigint], 'anonymous visitors have no direct pilot-request privileges');
select results_eq($$select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and table_name='pilot_requests' and grantee='authenticated'$$, array[0::bigint], 'contractors cannot read other visitors'' pilot requests');
select ok((select relrowsecurity from pg_class where oid = 'public.pilot_requests'::regclass), 'pilot requests keep row level security enabled');
select lives_ok($$insert into public.pilot_requests (name, phone, region) values ('Jan Peeters', '0470 12 34 56', 'vlaanderen')$$, 'a minimal request with name, phone and region is stored');
select throws_ok($$insert into public.pilot_requests (name, phone, region) values ('Jan Peeters', '0470 12 34 56', 'wallonie')$$, '23514', null, 'unknown regions are rejected');

select * from finish();
rollback;
