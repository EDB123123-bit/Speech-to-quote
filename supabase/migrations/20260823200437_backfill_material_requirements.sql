-- Existing accepted quotes predate the acceptance trigger. Populate their
-- Migration version aligned with the hosted production history.
-- operational material rows without changing any accepted commercial data.
insert into public.material_requirements (
  contractor_id, quote_id, source_quote_line_item_id, material_description,
  quoted_quantity, order_quantity, unit, status
)
select q.contractor_id, q.id, l.id, l.description, l.quantity, l.quantity, l.unit, 'to_order'
from public.quotes q
join public.quote_line_items l on l.quote_id = q.id
where q.status = 'accepted' and l.classification = 'material'
on conflict (source_quote_line_item_id) do nothing;
