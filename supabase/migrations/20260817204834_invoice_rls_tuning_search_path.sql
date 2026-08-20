-- Exact follow-up recorded in the deployed migration history. The next
-- forward migration removes this compatibility policy entirely.
alter function public.touch_invoice_updated_at() set search_path = public, pg_catalog;

drop policy if exists invoices_own_update_draft on invoices;
drop policy if exists invoices_own_update_tracking on invoices;
drop policy if exists invoices_own_update on invoices;
create policy invoices_own_update on invoices;
