-- RLS does not protect TRUNCATE. Secret-bearing tables must have no browser
-- Migration version aligned with the hosted production history.
-- role privileges at all, including the less-visible default table grants.
revoke all privileges on table public.peppol_connection_secrets from public, anon, authenticated;
grant select, insert, update, delete on table public.peppol_connection_secrets to service_role;

-- Reassert the same boundary for the other server-only credential/token
-- tables so future grant drift is visible in this final V1 migration chain.
revoke all privileges on table public.mailbox_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.mailbox_connections to service_role;

revoke all privileges on table public.quote_acceptance_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.quote_acceptance_tokens to service_role;
