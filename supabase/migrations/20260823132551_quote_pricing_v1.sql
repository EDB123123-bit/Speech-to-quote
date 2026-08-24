-- V1 job-specific quote pricing. Legacy catalogue columns and line_type values
-- Migration version aligned with the hosted production history.
-- remain for historical rows and imports; new quote paths no longer depend on them.

alter table public.quotes drop constraint if exists quotes_source_check;
alter table public.quotes
  add constraint quotes_source_check
  check (source in ('voice', 'manual', 'pdf_import'));

alter table public.quote_line_items
  add column if not exists classification text,
  add column if not exists line_kind text not null default 'detailed',
  add column if not exists price_source text not null default 'unknown';

alter table public.quote_line_items
  alter column quantity drop not null,
  alter column unit drop not null;

update public.quote_line_items
set classification = case line_type
  when 'materials' then 'material'
  when 'labor' then 'labor_service'
  else 'unclassified'
end
where classification is null;

update public.quote_line_items
set price_source = case when unit_price_cents is null then 'unknown' else 'explicit' end
where price_source = 'unknown';

alter table public.quote_line_items drop constraint if exists quote_line_items_quantity_check;
alter table public.quote_line_items
  add constraint quote_line_items_quantity_check
  check (quantity is null or quantity > 0);

alter table public.quote_line_items drop constraint if exists quote_line_items_classification_check;
alter table public.quote_line_items
  add constraint quote_line_items_classification_check
  check (classification is null or classification in ('material', 'labor_service', 'unclassified'));

alter table public.quote_line_items drop constraint if exists quote_line_items_line_kind_check;
alter table public.quote_line_items
  add constraint quote_line_items_line_kind_check
  check (line_kind in ('simple', 'detailed'));

alter table public.quote_line_items drop constraint if exists quote_line_items_price_source_check;
alter table public.quote_line_items
  add constraint quote_line_items_price_source_check
  check (price_source in ('explicit', 'historical_suggestion', 'manual', 'unknown'));

create or replace function public.prepare_quote_line_item_v1()
returns trigger
language plpgsql
as $$
begin
  if new.classification is null then
    new.classification := case new.line_type
      when 'materials' then 'material'
      when 'labor' then 'labor_service'
      else 'unclassified'
    end;
  end if;

  if new.unit_price_cents is null then
    new.price_source := 'unknown';
  elsif new.price_source = 'unknown' then
    new.price_source := 'explicit';
  end if;

  if new.line_kind = 'detailed' and (new.quantity is null or new.unit is null) then
    new.line_kind := 'simple';
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_quote_line_item_v1 on public.quote_line_items;
create trigger prepare_quote_line_item_v1
before insert or update on public.quote_line_items
for each row execute function public.prepare_quote_line_item_v1();
