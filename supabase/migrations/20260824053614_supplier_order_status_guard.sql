-- Migration version aligned with the hosted production history.
create or replace function public.guard_material_requirement_supplier_order_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.status = 'ordered'
    and old.status is distinct from new.status
    and current_setting('app.supplier_order_send', true) is distinct from '1' then
    raise exception 'material_requirement_order_requires_sent_supplier_order';
  end if;
  return new;
end;
$$;

drop trigger if exists material_requirements_supplier_order_status_guard on public.material_requirements;
create trigger material_requirements_supplier_order_status_guard
  before update on public.material_requirements
  for each row execute function public.guard_material_requirement_supplier_order_status();

revoke execute on function public.guard_material_requirement_supplier_order_status() from public, anon, authenticated;
