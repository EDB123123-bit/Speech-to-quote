begin;
select plan(20);

select has_table('public', 'gmail_quote_imports', 'gmail import table exists');
select has_table('public', 'quote_attachments', 'quote attachment table exists');
select has_column('public', 'gmail_quote_imports', 'gmail_message_id', 'imports retain Gmail message ids');
select has_column('public', 'gmail_quote_imports', 'body_hash', 'imports retain normalized body hashes');
select has_column('public', 'quote_attachments', 'storage_path', 'attachments retain private storage paths');
select has_column('public', 'quote_attachments', 'processing_status', 'attachments expose processing status');
select ok((select relrowsecurity from pg_class where oid = 'public.gmail_quote_imports'::regclass), 'gmail import RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.quote_attachments'::regclass), 'attachment RLS enabled');
select ok((select count(*) from pg_constraint where conrelid = 'public.gmail_quote_imports'::regclass and conname like '%mailbox_connection_id_gmail_message_id%') = 1, 'same Gmail message cannot be imported twice per connection');
select ok((select count(*) from pg_indexes where indexname = 'mailbox_connections_user_provider_idx') = 1, 'one mailbox connection per user/provider');
select ok((select count(*) from pg_indexes where indexname = 'mailbox_connections_default_idx') = 1, 'one outbound default mailbox per user');
select has_function('public', 'create_gmail_quote_import', ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'text', 'timestamptz', 'text', 'text', 'uuid', 'text', 'text', 'text', 'text'], 'atomic Gmail draft import RPC exists');
select ok(has_function_privilege('service_role', 'public.create_gmail_quote_import(uuid, uuid, text, text, text, text, timestamptz, text, text, uuid, text, text, text, text)', 'EXECUTE'), 'only server role can create Gmail imports');
select ok(not has_function_privilege('authenticated', 'public.create_gmail_quote_import(uuid, uuid, text, text, text, text, timestamptz, text, text, uuid, text, text, text, text)', 'EXECUTE'), 'browser roles cannot create Gmail imports');
select ok(has_table_privilege('authenticated', 'public.gmail_quote_imports', 'SELECT'), 'contractors can read own import provenance');
select ok(has_table_privilege('authenticated', 'public.quote_attachments', 'SELECT'), 'contractors can read own attachment metadata');
select ok(not has_table_privilege('anon', 'public.gmail_quote_imports', 'SELECT'), 'anonymous users cannot read Gmail provenance');
select ok(not has_table_privilege('anon', 'public.quote_attachments', 'SELECT'), 'anonymous users cannot read attachment metadata');
select ok((select public from storage.buckets where id = 'quote-attachments') = false, 'attachment bucket is private');
select ok((select count(*) from pg_constraint where conrelid = 'public.quotes'::regclass and conname = 'quotes_source_check') = 1, 'quote source constraint remains present');

select * from finish();
rollback;
