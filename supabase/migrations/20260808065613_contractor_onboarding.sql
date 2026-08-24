-- Tracks whether a contractor has completed (or skipped) the first-run
-- Migration version aligned with the hosted production history.
-- product walkthrough. Null means "show it"; any timestamp means "don't".
alter table contractors add column onboarding_completed_at timestamptz;
