-- RPR is not part of the V1 contractor invoice profile anymore.
-- Migration version aligned with the hosted production history.
-- Replace the issue function before dropping the contractor column because its
-- row-type reference must be compiled against the new table shape.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('private.issue_invoice(uuid)'::regprocedure)
    into definition;

  definition := replace(definition,
    $rpr$'rpr', coalesce(v_contractor.rpr, ''),$rpr$,
    '');
  definition := replace(definition,
    $rpr$or coalesce(v_invoice.seller_snapshot->>'rpr', '') = ''$rpr$,
    '');

  if definition ~* '(^|[^a-z])rpr([^a-z]|$)' then
    raise exception 'rpr_reference_remains_in_issue_function';
  end if;
  execute definition;
end;
$migration$;

alter table public.contractors drop column if exists rpr;
