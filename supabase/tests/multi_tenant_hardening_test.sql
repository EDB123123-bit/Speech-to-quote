begin;
select plan(37);

-- Grants are explicit and omit privileges that RLS cannot safely constrain.
select results_eq(
  $$select count(*)::bigint from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'$$,
  array[0::bigint],
  'anonymous clients have no direct application-table privileges'
);
select results_eq(
  $$select count(*)::bigint from information_schema.role_table_grants where table_schema = 'public' and grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')$$,
  array[0::bigint],
  'authenticated clients have no ownership-like table privileges'
);
select ok(has_table_privilege('authenticated', 'public.contractors', 'SELECT'), 'authenticated users can read their contractor profile');
select ok(has_table_privilege('authenticated', 'public.contractors', 'UPDATE'), 'authenticated users can update their contractor profile');
select ok(not has_table_privilege('authenticated', 'public.contractors', 'INSERT'), 'authenticated users cannot create contractor profiles directly');
select ok(has_table_privilege('authenticated', 'public.pipeline_events', 'SELECT'), 'authenticated users can read their own pipeline events');
select ok(not has_table_privilege('authenticated', 'public.pipeline_events', 'INSERT'), 'authenticated users cannot write pipeline events directly');

select is(
  (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relname <> 'contractors'
  ),
  (
    select count(*)
    from pg_policies
    where schemaname = 'public' and policyname = 'active_contractor_only'
  ),
  'every RLS application table requires an active contractor'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'active_contractor_only'
      and permissive = 'RESTRICTIVE'
  ),
  'storage access also requires an active contractor'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.quotes'::regclass
      and tgname = 'zz_quotes_validate_tenant_links'
      and not tgisinternal
  ),
  'quote customer and pipeline-stage tenant validation is installed'
);
select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.quote_line_items'::regclass
      and tgname = 'quote_line_items_validate_catalog_tenant'
      and not tgisinternal
  ),
  'quote-line catalog tenant validation is installed'
);
select is(
  (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'contractor_notifications_quote_id_idx',
        'invoice_line_items_source_quote_line_item_id_idx',
        'quote_attachments_quote_id_idx',
        'quote_delivery_events_contractor_id_idx',
        'supplier_orders_quote_id_idx',
        'supplier_orders_supplier_id_idx'
      )
  ),
  6::bigint,
  'all previously unindexed foreign-key columns are covered'
);
select ok(not has_function_privilege('authenticated', 'public.validate_quote_tenant_links()', 'EXECUTE'), 'quote tenant validator cannot be invoked directly');
select ok(not has_function_privilege('authenticated', 'public.validate_quote_line_catalog_tenant()', 'EXECUTE'), 'line tenant validator cannot be invoked directly');
select ok(has_function_privilege('authenticated', 'public.check_active_contractor_request()', 'EXECUTE'), 'authenticated Data API requests can run the active-account hook');
select ok(
  not (select prosecdef from pg_proc where oid = 'public.check_active_contractor_request()'::regprocedure),
  'the active-account hook remains security invoker'
);

-- Two users with realistic tenant roots. The signup trigger creates each
-- contractor and its default pipeline stages exactly as production does.
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
    'tenant-a@example.test', '{}'::jsonb, '{"company_name":"Tenant A"}'::jsonb, now(), now()
  ),
  (
    '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
    'tenant-b@example.test', '{}'::jsonb, '{"company_name":"Tenant B"}'::jsonb, now(), now()
  );

insert into public.catalog_items (
  id, contractor_id, name, unit, materials_price_cents, labor_price_cents, vat_rate
) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Tenant A item', 'stuk', 100, 200, 0.21),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Tenant B item', 'stuk', 300, 400, 0.21);

insert into public.customers (id, contractor_id, name, normalized_name) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Tenant A customer', 'tenant a customer'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Tenant B customer', 'tenant b customer');

insert into public.pipeline_stages (id, contractor_id, name, sort_order) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Tenant A custom stage', 10),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Tenant B custom stage', 10);

insert into public.quotes (id, contractor_id, customer_id, customer_name) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Tenant A customer'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Tenant B customer');

insert into public.quote_line_items (
  id, quote_id, catalog_item_id, description, quantity, unit,
  unit_price_cents, vat_rate, line_type, sort_order
) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Tenant A line', 1, 'stuk', 100, 0.21, 'materials', 0),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Tenant B line', 1, 'stuk', 300, 0.21, 'materials', 0);

insert into public.quote_clarifications (id, quote_id, question_nl) values
  ('70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Tenant A question'),
  ('70000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'Tenant B question');

insert into public.pipeline_events (id, quote_id, contractor_id, step, status) values
  ('80000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'upload', 'success'),
  ('80000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'upload', 'success');

insert into public.quote_tasks (id, contractor_id, quote_id, title) values
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Tenant A task'),
  ('90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'Tenant B task');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select results_eq($$select company_name from public.contractors$$, array['Tenant A'::text], 'user A sees its own contractor profile');
select ok(not exists (select 1 from public.contractors where id = '10000000-0000-0000-0000-000000000002'), 'user A cannot see user B contractor profile');
select results_eq($$select id from public.quotes order by id$$, array['50000000-0000-0000-0000-000000000001'::uuid], 'user A sees only its own quotes');
select results_eq($$select id from public.catalog_items order by id$$, array['20000000-0000-0000-0000-000000000001'::uuid], 'user A sees only its own catalog');
select results_eq($$select id from public.quote_line_items order by id$$, array['60000000-0000-0000-0000-000000000001'::uuid], 'user A sees only its own quote lines');
select results_eq($$select id from public.customers order by id$$, array['30000000-0000-0000-0000-000000000001'::uuid], 'user A sees only its own customers');
select ok(not exists (select 1 from public.pipeline_stages where id = '40000000-0000-0000-0000-000000000002'), 'user A cannot see a user B pipeline stage');
select results_eq($$select id from public.quote_clarifications order by id$$, array['70000000-0000-0000-0000-000000000001'::uuid], 'user A sees only its own clarifications');
select results_eq($$select id from public.pipeline_events order by id$$, array['80000000-0000-0000-0000-000000000001'::uuid], 'user A sees only its own pipeline events');
select results_eq($$select id from public.quote_tasks order by id$$, array['90000000-0000-0000-0000-000000000001'::uuid], 'user A sees only its own tasks');
select results_eq(
  $$with changed as (update public.quotes set customer_name = 'forbidden' where id = '50000000-0000-0000-0000-000000000002' returning 1) select count(*)::bigint from changed$$,
  array[0::bigint],
  'user A cannot update a user B quote'
);
select results_eq(
  $$with removed as (delete from public.catalog_items where id = '20000000-0000-0000-0000-000000000002' returning 1) select count(*)::bigint from removed$$,
  array[0::bigint],
  'user A cannot delete a user B catalog item'
);
select throws_ok(
  $$update public.quotes set customer_id = '30000000-0000-0000-0000-000000000002' where id = '50000000-0000-0000-0000-000000000001'$$,
  'quote_customer_tenant_mismatch',
  'an owned quote cannot reference another tenant customer'
);
select throws_ok(
  $$update public.quotes set pipeline_stage_id = '40000000-0000-0000-0000-000000000002' where id = '50000000-0000-0000-0000-000000000001'$$,
  'quote_pipeline_stage_tenant_mismatch',
  'an owned quote cannot reference another tenant pipeline stage'
);
select throws_ok(
  $$insert into public.quote_line_items (quote_id, catalog_item_id, description, quantity, unit, unit_price_cents, vat_rate, line_type) values ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'forbidden line', 1, 'stuk', 100, 0.21, 'materials')$$,
  'quote_line_catalog_tenant_mismatch',
  'an owned quote line cannot reference another tenant catalog item'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select ok(exists (select 1 from public.quotes where id = '50000000-0000-0000-0000-000000000002'), 'user B sees its own quote');
select ok(not exists (select 1 from public.quotes where id = '50000000-0000-0000-0000-000000000001'), 'user B cannot see user A quote');

reset role;
update public.contractors
set deactivated_at = now()
where id = '10000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select ok(not exists (select 1 from public.contractors), 'a deactivated user cannot read its contractor profile');
select ok(not exists (select 1 from public.quotes), 'a deactivated user cannot read its tenant data');
select results_eq(
  $$with changed as (update public.quotes set customer_name = 'forbidden' where id = '50000000-0000-0000-0000-000000000001' returning 1) select count(*)::bigint from changed$$,
  array[0::bigint],
  'a deactivated user cannot modify its tenant data'
);
select throws_ok(
  $$select public.check_active_contractor_request()$$,
  '42501',
  'account_inactive',
  'the Data API pre-request hook rejects a deactivated user'
);

select * from finish();
rollback;
