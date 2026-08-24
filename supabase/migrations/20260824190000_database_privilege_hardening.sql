-- Remove default browser table privileges from internal operational records.
-- RLS remains enabled; this also makes the intended grants explicit for tests
-- and for clients that introspect table privileges.

revoke all on public.quote_delivery_events from anon;
grant select on public.quote_delivery_events to authenticated;

revoke all on public.contractor_notifications from anon;
grant select, update on public.contractor_notifications to authenticated;

revoke all on public.material_requirements from anon, authenticated;
grant select, update on public.material_requirements to authenticated;

revoke all on public.quotes from anon;
