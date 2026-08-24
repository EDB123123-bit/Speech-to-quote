begin;
select plan(21);

select has_table('public', 'customers', 'stable customers table exists');
select has_table('public', 'quote_acceptance_tokens', 'acceptance token table exists');
select has_table('public', 'quote_delivery_events', 'delivery events table exists');
select has_table('public', 'contractor_notifications', 'contractor notifications table exists');
select has_column('public', 'quotes', 'customer_id', 'quotes have a stable customer reference');
select has_column('public', 'quotes', 'finalized_at', 'quotes record finalization time');
select has_column('public', 'quotes', 'sent_at', 'quotes record delivery time');
select has_column('public', 'quotes', 'accepted_at', 'quotes record acceptance time');
select has_column('public', 'quote_acceptance_tokens', 'token_hash', 'only token hashes are stored');
select ok((select relrowsecurity from pg_class where oid = 'public.customers'::regclass), 'customer RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.quote_acceptance_tokens'::regclass), 'token RLS is enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.contractor_notifications'::regclass), 'notification RLS is enabled');
select ok(not has_table_privilege('anon', 'public.quote_acceptance_tokens', 'SELECT'), 'anon cannot read acceptance tokens');
select ok(not has_table_privilege('authenticated', 'public.quote_acceptance_tokens', 'SELECT'), 'authenticated clients cannot read acceptance tokens');
select ok(not has_table_privilege('anon', 'public.quote_delivery_events', 'SELECT'), 'anon cannot read delivery events');
select ok(not has_table_privilege('anon', 'public.contractor_notifications', 'SELECT'), 'anon cannot read notifications');
select ok(not has_function_privilege('anon', 'public.accept_quote_by_token_hash(text)', 'EXECUTE'), 'anon cannot execute acceptance RPC');
select ok(not has_function_privilege('authenticated', 'public.accept_quote_by_token_hash(text)', 'EXECUTE'), 'authenticated clients cannot execute acceptance RPC');
select ok(has_function_privilege('service_role', 'public.accept_quote_by_token_hash(text)', 'EXECUTE'), 'server role can execute acceptance RPC');
select ok(not has_function_privilege('authenticated', 'public.mark_quote_sent(uuid, uuid, text, text, text)', 'EXECUTE'), 'authenticated clients cannot mark quotes sent');
select throws_ok(
  $$select * from public.accept_quote_by_token_hash('invalid-token-hash')$$,
  'invalid_acceptance_token',
  'invalid acceptance tokens are rejected'
);

select * from finish();
rollback;
