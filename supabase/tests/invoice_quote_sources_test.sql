begin;
select plan(15);

select has_table('public', 'invoice_quote_sources', 'invoice quote source junction exists');
select has_column('public', 'invoice_quote_sources', 'quote_id', 'each source points to one quote');
select has_column('public', 'invoice_line_items', 'source_quote_id', 'invoice lines retain source quote provenance');
select has_column('public', 'invoice_line_items', 'source_quote_line_item_id', 'invoice lines retain source line provenance');
select ok((select relrowsecurity from pg_class where oid = 'public.invoice_quote_sources'::regclass), 'source RLS is enabled');
select ok(has_table_privilege('authenticated', 'public.invoice_quote_sources', 'SELECT'), 'authenticated contractors can read source links');
select ok(not has_table_privilege('authenticated', 'public.invoice_quote_sources', 'INSERT'), 'source links cannot be inserted directly');
select ok(not has_table_privilege('anon', 'public.invoice_quote_sources', 'SELECT'), 'anonymous users cannot read source links');
select ok((select count(*) from pg_indexes where indexname = 'invoice_quote_sources_quote_id_key') = 1, 'a quote can be consumed by only one invoice');
select has_function('public', 'create_invoice_draft_from_quotes', ARRAY['uuid[]', 'jsonb'], 'multi-source invoice RPC exists');
select has_function('public', 'create_invoice_draft_from_quote', ARRAY['uuid', 'jsonb'], 'legacy invoice RPC remains available');
select ok(has_function_privilege('authenticated', 'public.create_invoice_draft_from_quotes(uuid[], jsonb)', 'EXECUTE'), 'authenticated can use multi-source invoice RPC');
select ok(not has_function_privilege('anon', 'public.create_invoice_draft_from_quotes(uuid[], jsonb)', 'EXECUTE'), 'anonymous users cannot create invoices');
select ok((select count(*) from pg_constraint where conrelid = 'public.invoice_quote_sources'::regclass and contype = 'u') >= 2, 'source uniqueness prevents duplicate invoice links');
select ok((select count(*) from pg_constraint where conrelid = 'public.invoice_line_items'::regclass and confrelid in ('public.quotes'::regclass, 'public.quote_line_items'::regclass)) >= 2, 'source line constraints are represented by foreign keys');

select * from finish();
rollback;
