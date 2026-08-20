-- Tighten the invoice policies after the initial deployment. Function calls
-- are initialized once per statement, and issued status transitions can only
-- happen through the protected RPC context.
alter function public.touch_invoice_updated_at() set search_path = public, pg_catalog;

create or replace function public.prevent_issued_invoice_mutation()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare
  old_immutable jsonb;
  new_immutable jsonb;
begin
  if old.status = 'draft' and new.status in ('issued', 'credited') and current_setting('app.issue_context', true) <> 'on' then
    raise exception 'issue_through_rpc_only';
  end if;
  if old.status in ('issued', 'credited') then
    old_immutable := to_jsonb(old) - array[
      'paid_at', 'delivery_status', 'delivery_submitted_at', 'delivery_external_reference',
      'delivery_receipt_path', 'pdf_path', 'ubl_path', 'pdf_sha256', 'ubl_sha256', 'updated_at', 'status'
    ];
    new_immutable := to_jsonb(new) - array[
      'paid_at', 'delivery_status', 'delivery_submitted_at', 'delivery_external_reference',
      'delivery_receipt_path', 'pdf_path', 'ubl_path', 'pdf_sha256', 'ubl_sha256', 'updated_at', 'status'
    ];
    if old_immutable <> new_immutable then raise exception 'issued_invoice_immutable'; end if;
    if (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path)
      or (old.ubl_path is not null and new.ubl_path is distinct from old.ubl_path)
      or (old.pdf_sha256 is not null and new.pdf_sha256 is distinct from old.pdf_sha256)
      or (old.ubl_sha256 is not null and new.ubl_sha256 is distinct from old.ubl_sha256)
    then raise exception 'issued_invoice_documents_immutable'; end if;
    if old.status = 'credited' and new.status <> 'credited' then raise exception 'credited_invoice_immutable'; end if;
    if old.status = 'issued' and new.status = 'credited' and current_setting('app.credit_context', true) <> 'on' then raise exception 'credit_through_rpc_only'; end if;
  end if;
  return new;
end;
$$;

drop policy if exists invoices_own_update_draft on invoices;
drop policy if exists invoices_own_update_tracking on invoices;
drop policy if exists invoices_own_update on invoices;
create policy invoices_own_update on invoices
  for update to authenticated
  using (contractor_id = (select auth.uid()) and status in ('draft', 'issued', 'credited'))
  with check (contractor_id = (select auth.uid()) and status in ('draft', 'issued', 'credited'));

drop policy if exists document_counters_own on document_counters;
create policy document_counters_own on document_counters
  for select to authenticated using (contractor_id = (select auth.uid()));
drop policy if exists invoices_own_read on invoices;
create policy invoices_own_read on invoices
  for select to authenticated using (contractor_id = (select auth.uid()));
drop policy if exists invoices_own_insert on invoices;
create policy invoices_own_insert on invoices
  for insert to authenticated with check (contractor_id = (select auth.uid()) and status = 'draft');
drop policy if exists invoices_own_delete_draft on invoices;
create policy invoices_own_delete_draft on invoices
  for delete to authenticated using (contractor_id = (select auth.uid()) and status = 'draft');

drop policy if exists invoice_line_items_own_read on invoice_line_items;
create policy invoice_line_items_own_read on invoice_line_items for select to authenticated using (
  exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()))
);
drop policy if exists invoice_line_items_own_insert on invoice_line_items;
create policy invoice_line_items_own_insert on invoice_line_items for insert to authenticated with check (
  exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()) and i.status = 'draft')
);
drop policy if exists invoice_line_items_own_update on invoice_line_items;
create policy invoice_line_items_own_update on invoice_line_items for update to authenticated
  using (exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()) and i.status = 'draft'))
  with check (exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()) and i.status = 'draft'));
drop policy if exists invoice_line_items_own_delete on invoice_line_items;
create policy invoice_line_items_own_delete on invoice_line_items for delete to authenticated using (
  exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()) and i.status = 'draft')
);

drop policy if exists invoice_events_own_read on invoice_events;
create policy invoice_events_own_read on invoice_events for select to authenticated using (contractor_id = (select auth.uid()));
drop policy if exists invoice_events_own_insert on invoice_events;
create policy invoice_events_own_insert on invoice_events for insert to authenticated with check (
  contractor_id = (select auth.uid()) and exists (select 1 from invoices i where i.id = invoice_id and i.contractor_id = (select auth.uid()))
);

drop policy if exists invoice_documents_insert_own on storage.objects;
create policy invoice_documents_insert_own on storage.objects for insert to authenticated with check (
  bucket_id = 'invoice-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists invoice_documents_select_own on storage.objects;
create policy invoice_documents_select_own on storage.objects for select to authenticated using (
  bucket_id = 'invoice-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
);
