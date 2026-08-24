begin;
select plan(14);

select has_column('public', 'quotes', 'quote_kind', 'quotes identify standard and meerwerk kinds');
select has_column('public', 'quotes', 'parent_quote_id', 'change orders link to an original quote');
select has_index('public', 'quotes_parent_quote_idx', 'parent quote lookup is indexed');
select ok((select relrowsecurity from pg_class where oid = 'public.quotes'::regclass), 'quote RLS remains enabled');
select has_function('public', 'create_meerwerk_quote', ARRAY['uuid', 'uuid'], 'server change-order creation RPC exists');
select ok(not has_function_privilege('anon', 'public.create_meerwerk_quote(uuid, uuid)', 'EXECUTE'), 'anon cannot create change orders');
select ok(not has_function_privilege('authenticated', 'public.create_meerwerk_quote(uuid, uuid)', 'EXECUTE'), 'authenticated clients cannot bypass server creation');
select ok(has_function_privilege('service_role', 'public.create_meerwerk_quote(uuid, uuid)', 'EXECUTE'), 'server role can create change orders');
select ok(not has_function_privilege('authenticated', 'public.validate_quote_family()', 'EXECUTE'), 'family trigger cannot be called directly');
select ok((select count(*) from pg_constraint where conrelid = 'public.quotes'::regclass and conname = 'quotes_quote_kind_check') = 1, 'quote kind is constrained');
select ok((select count(*) from pg_trigger where tgrelid = 'public.quotes'::regclass and tgname = 'quotes_validate_family') = 1, 'family validation trigger exists');
select ok((select count(*) from pg_trigger where tgrelid = 'public.quotes'::regclass and tgname = 'quotes_guard_commercial_content') = 1, 'commercial immutability trigger exists');
select ok(not has_table_privilege('anon', 'public.quotes', 'INSERT'), 'anon cannot insert quotes');
select ok(has_table_privilege('authenticated', 'public.quotes', 'SELECT'), 'authenticated contractors can read owned quote families');

select * from finish();
rollback;
