-- Keep the token table service-role-only and make the denial explicit for
-- Migration version aligned with the hosted production history.
-- exposed roles, while retaining RLS as defense in depth.
create policy quote_acceptance_tokens_no_client_access on public.quote_acceptance_tokens
  for all to anon, authenticated
  using (false)
  with check (false);
