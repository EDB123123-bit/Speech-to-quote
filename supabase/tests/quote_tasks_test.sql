begin;
select plan(14);

select has_table('public', 'quote_tasks', 'quote tasks table exists');
select has_column('public', 'quote_tasks', 'quote_id', 'tasks link to a quote');
select has_column('public', 'quote_tasks', 'title', 'tasks have a title');
select has_column('public', 'quote_tasks', 'status', 'tasks have a simple status');
select has_column('public', 'quote_tasks', 'due_date', 'tasks have a deadline');
select col_is_null('public', 'quote_tasks', 'due_date', 'task deadline is optional');
select has_column('public', 'quote_tasks', 'activated_at', 'draft task activation is recorded');
select ok((select relrowsecurity from pg_class where oid = 'public.quote_tasks'::regclass), 'task RLS is enabled');
select ok(not has_table_privilege('anon', 'public.quote_tasks', 'SELECT'), 'anon cannot read tasks');
select ok(not has_table_privilege('anon', 'public.quote_tasks', 'INSERT'), 'anon cannot create tasks');
select ok(has_table_privilege('authenticated', 'public.quote_tasks', 'SELECT'), 'authenticated contractors can read owned tasks');
select ok(has_table_privilege('authenticated', 'public.quote_tasks', 'UPDATE'), 'authenticated contractors can update owned tasks');
select ok(not has_function_privilege('authenticated', 'public.prepare_quote_task()', 'EXECUTE'), 'task trigger cannot be called directly');
select ok(not has_function_privilege('authenticated', 'public.guard_quote_lifecycle()', 'EXECUTE'), 'lifecycle guard cannot be called directly');

select * from finish();
rollback;
