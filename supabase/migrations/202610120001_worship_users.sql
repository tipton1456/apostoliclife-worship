-- Apostolic Worship sign-in profiles.
-- Passwords are not stored in this table. Supabase Auth keeps a hash in
-- auth.users, and this table records who may use Worship and which features
-- an administrator has assigned.

create table if not exists public.worship_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  first_name text not null default '',
  last_name text not null default '',
  access_level text not null default 'member' check (access_level in ('admin', 'member')),
  active boolean not null default true,
  must_reset_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.worship_user_features (
  user_id uuid not null references public.worship_users (id) on delete cascade,
  feature text not null,
  primary key (user_id, feature),
  constraint worship_user_features_feature_check check (
    feature in (
      'control_panel',
      'mic_board',
      'select_board',
      'manual_board',
      'docs',
      'choir_sunday',
      'big_top',
      'serve_report'
    )
  )
);

create table if not exists public.worship_user_audit_logs (
  id bigint generated always as identity primary key,
  action text not null,
  actor_user_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists worship_user_audit_logs_created_at_idx
  on public.worship_user_audit_logs (created_at desc);

create or replace function public.set_worship_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_worship_users_updated_at on public.worship_users;
create trigger set_worship_users_updated_at
  before update on public.worship_users
  for each row
  execute function public.set_worship_users_updated_at();

alter table public.worship_users enable row level security;
alter table public.worship_user_features enable row level security;
alter table public.worship_user_audit_logs enable row level security;

drop policy if exists "Users can read their own worship profile" on public.worship_users;
create policy "Users can read their own worship profile"
  on public.worship_users
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can read their own worship features" on public.worship_user_features;
create policy "Users can read their own worship features"
  on public.worship_user_features
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.worship_users from public, anon;
revoke all on table public.worship_user_features from public, anon;
revoke all on table public.worship_user_audit_logs from public, anon, authenticated;

grant select on table public.worship_users to authenticated;
grant select on table public.worship_user_features to authenticated;
grant all on table public.worship_users to service_role;
grant all on table public.worship_user_features to service_role;
grant all on table public.worship_user_audit_logs to service_role;
grant usage, select on sequence public.worship_user_audit_logs_id_seq to service_role;

-- Existing Apostolic Life accounts for Steve become Worship administrators.
-- No password is changed. The portal password continues to work.
insert into public.worship_users (
  id,
  email,
  first_name,
  last_name,
  access_level,
  active,
  must_reset_password
)
select
  users.id,
  users.email,
  coalesce(users.raw_user_meta_data ->> 'first_name', ''),
  coalesce(users.raw_user_meta_data ->> 'last_name', ''),
  'admin',
  true,
  false
from auth.users users
where users.email is not null
  and lower(users.email) in (
    's.tipton@apostoliclifeupc.com',
    's.tipton@apostoliclifeupci.com',
    'stevetipton@apostoliclifeupc.com',
    'stevetipton@apostoliclifeupci.com',
    'tipton1456@gmail.com'
  )
on conflict (id) do update
set
  email = excluded.email,
  access_level = 'admin',
  active = true;
