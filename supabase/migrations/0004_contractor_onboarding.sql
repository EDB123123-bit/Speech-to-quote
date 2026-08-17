-- Tracks whether a contractor has completed (or skipped) the first-run
-- product walkthrough. Null means "show it"; any timestamp means "don't".
alter table contractors add column onboarding_completed_at timestamptz;
