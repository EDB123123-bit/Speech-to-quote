-- Cancelling a draft must release its material requirements so they can be
-- Migration version aligned with the hosted production history.
-- selected for a replacement draft. The operation is atomic.
create or replace function public.cancel_supplier_order(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  order_row public.supplier_orders%rowtype;
begin
  select o.* into order_row
  from public.supplier_orders o
  where o.id = p_order_id
    and o.contractor_id = (select auth.uid())
  for update;

  if not found then raise exception 'supplier_order_not_found'; end if;
  if order_row.status <> 'draft' then raise exception 'supplier_order_not_cancellable'; end if;
  if order_row.cancelled_at is not null then return; end if;

  -- Delete the draft lines before cancelling the header. This releases the
  -- unique material_requirement assignment without changing requirement data.
  delete from public.supplier_order_lines where supplier_order_id = p_order_id;
  update public.supplier_orders
  set cancelled_at = now()
  where id = p_order_id;
end;
$$;

revoke execute on function public.cancel_supplier_order(uuid) from public, anon;
grant execute on function public.cancel_supplier_order(uuid) to authenticated;
