-- Track backpack handout for Big Top attendees who selected "Yes"

alter table public.big_top_attendees
  add column if not exists backpack_received_at timestamptz;

create index if not exists big_top_attendees_backpack_received_idx
  on public.big_top_attendees (backpack_received_at)
  where backpack_received_at is not null;

comment on column public.big_top_attendees.backpack_received_at is
  'When the backpack was handed out (null = still needed)';
