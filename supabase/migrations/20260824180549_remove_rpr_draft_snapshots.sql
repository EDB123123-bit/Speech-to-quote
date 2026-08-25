-- Remove obsolete RPR metadata from editable invoice drafts. Issued and
-- Migration version aligned with the hosted production history.
-- credited invoice snapshots are intentionally left immutable.
update public.invoices
set seller_snapshot = seller_snapshot - 'rpr',
    buyer_snapshot = buyer_snapshot - 'rpr'
where status = 'draft'
  and (seller_snapshot ? 'rpr' or buyer_snapshot ? 'rpr');
