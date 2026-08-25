-- Migration version aligned with the hosted production history.
create index if not exists material_requirements_supplier_fk_idx
  on public.material_requirements (supplier_id);
