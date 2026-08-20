-- The issued-document trigger only permits legal status transitions from the
-- numbering RPC context. Keep the deployed function aligned with that guard.
create or replace function private.issue_invoice(p_invoice_id uuid)
returns invoices language plpgsql security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_invoice invoices%rowtype;
  v_line_count integer;
  v_year integer;
  v_next integer;
  v_prefix text;
  v_number text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice_not_found'; end if;
  if v_invoice.contractor_id is distinct from auth.uid() then raise exception 'not_owner'; end if;
  if v_invoice.status <> 'draft' then return v_invoice; end if;
  if v_invoice.document_type = 'invoice' and v_invoice.due_date is null then raise exception 'due_date_required'; end if;
  if coalesce(v_invoice.seller_snapshot->>'name', '') = '' or coalesce(v_invoice.seller_snapshot->>'street', '') = '' or coalesce(v_invoice.seller_snapshot->>'postalCode', '') = '' or coalesce(v_invoice.seller_snapshot->>'city', '') = '' or coalesce(v_invoice.seller_snapshot->>'vatNumber', '') = '' or coalesce(v_invoice.seller_snapshot->>'enterpriseNumber', '') = '' or coalesce(v_invoice.seller_snapshot->>'iban', '') = '' then raise exception 'seller_profile_incomplete'; end if;
  if btrim(coalesce(v_invoice.customer_name, '')) = '' or btrim(coalesce(v_invoice.customer_street, '')) = '' or btrim(coalesce(v_invoice.customer_postal_code, '')) = '' or btrim(coalesce(v_invoice.customer_city, '')) = '' then raise exception 'buyer_address_incomplete'; end if;
  select count(*) into v_line_count from public.invoice_line_items where invoice_id = p_invoice_id;
  if v_line_count = 0 then raise exception 'invoice_without_lines'; end if;
  if v_invoice.customer_type = 'business' and (v_invoice.customer_peppol_id is null or v_invoice.customer_peppol_id !~ '^0208:[0-9]{10}$') then raise exception 'invalid_peppol_id'; end if;
  if v_invoice.customer_type = 'business' and (v_invoice.customer_vat_number is null or v_invoice.customer_enterprise_number is null) then raise exception 'business_without_vat_or_enterprise_number'; end if;
  if v_invoice.vat_treatment = 'reverse_charge' and (v_invoice.customer_type <> 'business' or not v_invoice.reverse_charge_confirmed) then raise exception 'invalid_reverse_charge'; end if;
  if v_invoice.vat_treatment = 'reverse_charge' and exists (select 1 from public.invoice_line_items where invoice_id = p_invoice_id and vat_category <> 'AE') then raise exception 'reverse_charge_lines_not_ae'; end if;
  if v_invoice.vat_treatment = 'standard' and exists (select 1 from public.invoice_line_items where invoice_id = p_invoice_id and vat_category <> 'S') then raise exception 'standard_lines_not_s'; end if;
  v_year := extract(year from coalesce(v_invoice.issue_date, current_date))::integer;
  insert into public.document_counters(contractor_id, year, series, last_value) values (v_invoice.contractor_id, v_year, case when v_invoice.document_type = 'credit_note' then 'credit_note' else 'invoice' end, 0) on conflict (contractor_id, year, series) do nothing;
  select last_value into v_next from public.document_counters where contractor_id = v_invoice.contractor_id and year = v_year and series = case when v_invoice.document_type = 'credit_note' then 'credit_note' else 'invoice' end for update;
  v_next := v_next + 1;
  update public.document_counters set last_value = v_next where contractor_id = v_invoice.contractor_id and year = v_year and series = case when v_invoice.document_type = 'credit_note' then 'credit_note' else 'invoice' end;
  select coalesce(invoice_prefix, 'STQ') into v_prefix from public.contractors where id = v_invoice.contractor_id;
  v_number := v_prefix || case when v_invoice.document_type = 'credit_note' then '-CN-' else '-' end || v_year::text || '-' || lpad(v_next::text, 4, '0');
  perform set_config('app.issue_context', 'on', true);
  update public.invoices set invoice_number = v_number, issue_date = coalesce(issue_date, current_date), issued_at = now(), status = 'issued', delivery_status = case when delivery_channel = 'peppol_manual' then 'ready_for_upload' else 'not_sent' end where id = p_invoice_id returning * into v_invoice;
  insert into public.invoice_events(invoice_id, contractor_id, event_type, detail) values (p_invoice_id, v_invoice.contractor_id, 'issued', jsonb_build_object('invoice_number', v_number));
  return v_invoice;
end;
$$;
