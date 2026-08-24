-- Keep the line-item normalization trigger deterministic under Supabase's
-- Migration version aligned with the hosted production history.
-- exposed public schema.
alter function public.prepare_quote_line_item_v1() set search_path = public;
