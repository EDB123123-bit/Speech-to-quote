begin;
select plan(18);

select has_table('public', 'invoices', 'invoices table exists');
select has_table('public', 'invoice_line_items', 'invoice lines table exists');
select has_table('public', 'invoice_events', 'invoice audit table exists');
select has_table('public', 'peppol_connections', 'Peppol connection metadata exists');
select has_table('public', 'peppol_connection_secrets', 'service-only Peppol secrets exist');
select has_table('public', 'peppol_submissions', 'Peppol outbox exists');
select has_table('public', 'peppol_submission_events', 'Peppol submission audit exists');

select ok(not has_table_privilege('anon', 'public.invoices', 'SELECT'), 'anon cannot read invoices');
select ok(not has_table_privilege('authenticated', 'public.invoices', 'INSERT'), 'authenticated cannot insert invoices directly');
select ok(not has_table_privilege('authenticated', 'public.invoice_line_items', 'UPDATE'), 'authenticated cannot mutate invoice lines directly');
select ok(not has_table_privilege('authenticated', 'public.invoice_events', 'INSERT'), 'authenticated cannot forge invoice events');
select ok(not has_table_privilege('authenticated', 'public.peppol_connection_secrets', 'SELECT'), 'authenticated cannot read connector secrets');
select ok(has_function_privilege('authenticated', 'public.issue_invoice(uuid)', 'EXECUTE'), 'authenticated can use approved issue RPC');
select ok(not has_function_privilege('authenticated', 'private.issue_invoice(uuid)', 'EXECUTE'), 'private issue implementation is not callable');
select ok(has_function_privilege('service_role', 'public.claim_peppol_submissions(integer)', 'EXECUTE'), 'service role can claim outbox work');
select ok(not has_function_privilege('authenticated', 'public.claim_peppol_submissions(integer)', 'EXECUTE'), 'users cannot claim outbox work');
select ok((select relrowsecurity from pg_class where oid = 'public.invoices'::regclass), 'invoice RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.peppol_submissions'::regclass), 'submission RLS is enabled');

select * from finish();
rollback;
