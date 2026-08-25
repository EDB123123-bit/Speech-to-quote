-- Final quote and supplier-order PDFs are server-owned immutable artifacts.
-- Migration version aligned with the hosted production history.
-- Authenticated clients retain tenant-scoped read access but can no longer
-- create, replace or delete those objects directly through Storage.
drop policy if exists quote_pdfs_insert_own on storage.objects;
drop policy if exists quote_pdfs_update_own on storage.objects;
drop policy if exists quote_pdfs_delete_own on storage.objects;
drop policy if exists supplier_order_pdfs_insert_own on storage.objects;
drop policy if exists supplier_order_pdfs_update_own on storage.objects;

-- The server may repair a missing deterministic PDF path after a successful
-- finalization. This narrow flag is transaction-local and the RPC is only
-- executable by service_role.
create or replace function public.guard_quote_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'accepted' then
    if current_setting('app.quote_pdf_write', true) = '1'
      and new.pdf_path is distinct from old.pdf_path
      and (to_jsonb(new) - 'pdf_path') = (to_jsonb(old) - 'pdf_path') then
      return new;
    end if;
    raise exception 'accepted_quote_is_immutable';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and not (
    (old.status = 'draft' and new.status = 'final')
    or (old.status = 'final' and new.status = 'sent')
    or (old.status = 'sent' and new.status = 'accepted')
  ) then
    raise exception 'invalid_quote_status_transition';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'final' then
      new.finalized_at := coalesce(new.finalized_at, now());
    elsif new.status = 'sent' then
      new.sent_at := coalesce(new.sent_at, now());
    elsif new.status = 'accepted' then
      new.accepted_at := coalesce(new.accepted_at, now());
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_quote_commercial_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('final', 'sent', 'accepted') and (
    new.contractor_id is distinct from old.contractor_id
    or new.customer_id is distinct from old.customer_id
    or new.customer_name is distinct from old.customer_name
    or new.customer_address is distinct from old.customer_address
    or new.customer_email is distinct from old.customer_email
    or new.customer_phone is distinct from old.customer_phone
    or new.transcript is distinct from old.transcript
    or new.source is distinct from old.source
    or new.quote_number is distinct from old.quote_number
    or new.issue_date is distinct from old.issue_date
    or new.valid_until is distinct from old.valid_until
    or new.order_reference is distinct from old.order_reference
    or new.audio_path is distinct from old.audio_path
    or new.audio_deleted_at is distinct from old.audio_deleted_at
    or new.quote_kind is distinct from old.quote_kind
    or new.parent_quote_id is distinct from old.parent_quote_id
    or (
      new.pdf_path is distinct from old.pdf_path
      and current_setting('app.quote_pdf_write', true) is distinct from '1'
    )
    or (new.status is not distinct from old.status and new.finalized_at is distinct from old.finalized_at)
    or (new.status is not distinct from old.status and new.sent_at is distinct from old.sent_at)
    or (new.status is not distinct from old.status and new.accepted_at is distinct from old.accepted_at)
  ) then
    raise exception 'quote_commercial_content_is_immutable';
  end if;
  return new;
end;
$$;

create or replace function public.set_quote_pdf_path(
  p_quote_id uuid,
  p_contractor_id uuid,
  p_pdf_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_expected_path text;
begin
  select q.* into v_quote
  from public.quotes q
  where q.id = p_quote_id
    and q.contractor_id = p_contractor_id
  for update;

  if not found then raise exception 'quote_not_found'; end if;
  if v_quote.status not in ('final', 'sent', 'accepted') then
    raise exception 'quote_pdf_requires_final_quote';
  end if;

  v_expected_path := p_contractor_id::text || '/' || p_quote_id::text || '.pdf';
  if p_pdf_path is distinct from v_expected_path then
    raise exception 'invalid_quote_pdf_path';
  end if;
  if v_quote.pdf_path is not null and v_quote.pdf_path is distinct from p_pdf_path then
    raise exception 'quote_pdf_path_is_immutable';
  end if;
  if v_quote.pdf_path is not null then return; end if;

  perform set_config('app.quote_pdf_write', '1', true);
  update public.quotes set pdf_path = p_pdf_path where id = p_quote_id;
end;
$$;

revoke execute on function public.set_quote_pdf_path(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.set_quote_pdf_path(uuid, uuid, text) to service_role;
revoke execute on function public.guard_quote_lifecycle() from public, anon, authenticated;
revoke execute on function public.guard_quote_commercial_content() from public, anon, authenticated;
