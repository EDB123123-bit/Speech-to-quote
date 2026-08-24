begin;
select plan(6);

select results_eq($$select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and table_name='peppol_connection_secrets' and grantee='authenticated'$$, array[0::bigint], 'authenticated has no Peppol secret-table privileges');
select results_eq($$select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and table_name='peppol_connection_secrets' and grantee='anon'$$, array[0::bigint], 'anonymous has no Peppol secret-table privileges');
select results_eq($$select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and table_name='mailbox_connections' and grantee='authenticated'$$, array[0::bigint], 'authenticated has no mailbox token-table privileges');
select results_eq($$select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and table_name='mailbox_connections' and grantee='anon'$$, array[0::bigint], 'anonymous has no mailbox token-table privileges');
select results_eq($$select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and table_name='quote_acceptance_tokens' and grantee='authenticated'$$, array[0::bigint], 'authenticated has no acceptance-token table privileges');
select results_eq($$select count(*)::bigint from information_schema.role_table_grants where table_schema='public' and table_name='quote_acceptance_tokens' and grantee='anon'$$, array[0::bigint], 'anonymous has no acceptance-token table privileges');

select * from finish();
rollback;
