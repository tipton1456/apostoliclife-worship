-- Big Top Back to School Bash check-in (Tithely event 11266056)
-- Run in Supabase SQL editor or via supabase db push.
-- Service role only: RLS enabled with no public policies.

create table if not exists public.big_top_attendees (
  confirmation_code text primary key,
  event_id text not null default '11266056',
  ticket text not null default '',
  registrant_name text not null default '',
  registrant_email text not null default '',
  active_attending text not null default '',
  attendee_registered text not null default '',
  attendee_name text not null default '',
  attendee_email text not null default '',
  attendee_street text not null default '',
  attendee_city text not null default '',
  attendee_state text not null default '',
  attendee_postal text not null default '',
  attendee_country text not null default '',
  birth_date text not null default '',
  phone_number text not null default '',
  backpack text not null default '',
  home_church text not null default '',
  home_church_where text not null default '',
  imported_at timestamptz not null default now(),
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists big_top_attendees_name_idx
  on public.big_top_attendees (lower(attendee_name));

create index if not exists big_top_attendees_registrant_idx
  on public.big_top_attendees (lower(registrant_name));

create table if not exists public.big_top_check_ins (
  confirmation_code text not null
    references public.big_top_attendees (confirmation_code)
    on delete cascade,
  event_day date not null,
  checked_in_at timestamptz not null default now(),
  method text not null check (method in ('scan', 'manual')),
  primary key (confirmation_code, event_day)
);

create index if not exists big_top_check_ins_day_idx
  on public.big_top_check_ins (event_day);

alter table public.big_top_attendees enable row level security;
alter table public.big_top_check_ins enable row level security;

-- No public/anon policies: only service role (and postgres) can access.
comment on table public.big_top_attendees is
  'Tithely Big Top event attendees for /big-top check-in (worship app)';
comment on table public.big_top_check_ins is
  'Per-day check-ins for Big Top (2026-08-01 and 2026-08-02)';
