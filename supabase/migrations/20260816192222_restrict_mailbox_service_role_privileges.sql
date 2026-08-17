-- Supabase grants broad default privileges to service_role on new public
-- tables. This feature only needs CRUD access to mailbox credentials.
revoke all on table public.mailbox_connections from service_role;
grant select, insert, update, delete on table public.mailbox_connections to service_role;
