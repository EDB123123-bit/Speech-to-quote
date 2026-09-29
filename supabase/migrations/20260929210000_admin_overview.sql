-- Administrator overview: which accounts exist and how many quotes each made.
--
-- Admins live in their own table instead of a flag on contractors, because
-- contractors may update their own row and must never be able to grant
-- themselves admin rights. Both the table and the overview function are
-- server-only: browser roles get no privileges at all.
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.app_admins is 'Users who may open /beheer. Server-only; add rows via SQL.';

alter table public.app_admins enable row level security;

revoke all privileges on table public.app_admins from public, anon, authenticated;
grant select, insert, update, delete on table public.app_admins to service_role;

-- One row per account (auth user), newest first. Counts only: no quote
-- contents or customer data leave the tenant boundary.
create or replace function public.admin_account_overview()
returns table (
  user_id uuid,
  email text,
  company_name text,
  signed_up_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  onboarding_completed_at timestamptz,
  deactivated_at timestamptz,
  mailbox_connected boolean,
  quotes_total bigint,
  quotes_draft bigint,
  quotes_final bigint,
  quotes_sent bigint,
  quotes_accepted bigint,
  quotes_by_voice bigint,
  last_quote_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.email::text,
    c.company_name,
    u.created_at,
    u.email_confirmed_at,
    u.last_sign_in_at,
    c.onboarding_completed_at,
    c.deactivated_at,
    exists (
      select 1 from public.mailbox_connections m
      where m.user_id = u.id and m.status = 'connected'
    ),
    count(q.id),
    count(q.id) filter (where q.status = 'draft'),
    count(q.id) filter (where q.status = 'final'),
    count(q.id) filter (where q.status = 'sent'),
    count(q.id) filter (where q.status = 'accepted'),
    count(q.id) filter (where q.source = 'voice'),
    max(q.created_at)
  from auth.users u
  left join public.contractors c on c.id = u.id
  left join public.quotes q on q.contractor_id = u.id
  group by u.id, c.id
  order by u.created_at desc;
$$;

revoke all on function public.admin_account_overview() from public, anon, authenticated;
grant execute on function public.admin_account_overview() to service_role;
