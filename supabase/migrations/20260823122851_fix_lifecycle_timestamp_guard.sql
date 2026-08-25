-- Lifecycle transitions themselves set their timestamps; only same-status
-- Migration version aligned with the hosted production history.
-- timestamp edits are commercial mutations.
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
    or (new.status is not distinct from old.status and new.finalized_at is distinct from old.finalized_at)
    or (new.status is not distinct from old.status and new.sent_at is distinct from old.sent_at)
    or (new.status is not distinct from old.status and new.accepted_at is distinct from old.accepted_at)
  ) then
    raise exception 'quote_commercial_content_is_immutable';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_quote_commercial_content() from public, anon, authenticated;
