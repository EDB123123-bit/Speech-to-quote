begin;
select plan(8);

select has_function('public', 'set_quote_pdf_path', array['uuid', 'uuid', 'text'], 'server PDF path function exists');
select ok(has_function_privilege('service_role', 'public.set_quote_pdf_path(uuid, uuid, text)', 'EXECUTE'), 'service role may set a finalized quote PDF path');
select ok(not has_function_privilege('authenticated', 'public.set_quote_pdf_path(uuid, uuid, text)', 'EXECUTE'), 'authenticated users cannot call the PDF path function');

select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('quote_pdfs_insert_own', 'quote_pdfs_update_own', 'quote_pdfs_delete_own')$$,
  array[0::bigint],
  'quote PDF objects have no authenticated write policies'
);
select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('supplier_order_pdfs_insert_own', 'supplier_order_pdfs_update_own')$$,
  array[0::bigint],
  'supplier order PDF objects have no authenticated write policies'
);
select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'quote_pdfs_select_own'$$,
  array[1::bigint],
  'tenant-scoped quote PDF reads remain available'
);
select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'supplier_order_pdfs_select_own'$$,
  array[1::bigint],
  'tenant-scoped supplier-order PDF reads remain available'
);
select isnt_empty(
  $$select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_quote_pdf_path' and p.prosecdef and p.proconfig @> array['search_path=""']$$,
  'PDF path function is SECURITY DEFINER with an empty search path'
);

select * from finish();
rollback;
