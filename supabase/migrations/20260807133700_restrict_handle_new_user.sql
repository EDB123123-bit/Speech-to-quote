-- handle_new_user() is SECURITY DEFINER and only meant to run inside the
-- Migration version aligned with the hosted production history.
-- on_auth_user_created trigger. Revoke direct EXECUTE so it can't be called
-- as a public RPC (trigger invocation is unaffected: it runs as the table
-- owner regardless of the invoking role's EXECUTE grant).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
