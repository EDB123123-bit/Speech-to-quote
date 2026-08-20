-- The deployed issue-context release preceded the due-date guard. On a fresh
-- database the following migration installs the final function body; this
-- marker preserves the exact applied migration version without duplicating a
-- function that is immediately replaced.
select 1;
