-- Resolve the output-column name collision in the idempotent acceptance RPC.
-- Migration version aligned with the hosted production history.
create or replace function public.accept_quote_by_token_hash(p_token_hash text)
returns table (
  quote_id uuid,
  contractor_id uuid,
  quote_status text,
  customer_name text,
  customer_email text,
  quote_number text,
  accepted_at timestamptz,
  already_accepted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
begin
  if p_token_hash is null or btrim(p_token_hash) = '' then
    raise exception 'invalid_acceptance_token';
  end if;

  select q.*
  into v_quote
  from public.quotes q
  join public.quote_acceptance_tokens t on t.quote_id = q.id
  where t.token_hash = btrim(p_token_hash)
  for update of q;

  if not found then
    raise exception 'invalid_acceptance_token';
  end if;

  if v_quote.status = 'accepted' then
    return query select v_quote.id, v_quote.contractor_id, v_quote.status,
      v_quote.customer_name, v_quote.customer_email, v_quote.quote_number,
      v_quote.accepted_at, true;
    return;
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'quote_not_sent';
  end if;

  update public.quotes q
  set status = 'accepted'
  where q.id = v_quote.id;

  insert into public.contractor_notifications (
    contractor_id, quote_id, notification_type, title, body, href
  ) values (
    v_quote.contractor_id,
    v_quote.id,
    'quote_accepted',
    'Offerte aanvaard',
    coalesce(v_quote.customer_name, 'De klant') || ' heeft offerte ' || coalesce(v_quote.quote_number, left(v_quote.id::text, 8)) || ' aanvaard.',
    '/offertes/' || v_quote.id::text
  )
  on conflict on constraint contractor_notifications_quote_type_key do nothing;

  select q.* into v_quote from public.quotes q where q.id = v_quote.id;
  return query select v_quote.id, v_quote.contractor_id, v_quote.status,
    v_quote.customer_name, v_quote.customer_email, v_quote.quote_number,
    v_quote.accepted_at, false;
end;
$$;

revoke all on function public.accept_quote_by_token_hash(text) from public, anon, authenticated;
grant execute on function public.accept_quote_by_token_hash(text) to service_role;
