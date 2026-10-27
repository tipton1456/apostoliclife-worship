-- People tags for service photos, and cached folder photo counts.
-- The photo bytes stay in Dropbox. These tables only remember tags and totals.

create table if not exists public.worship_photo_tags (
  id bigint generated always as identity primary key,
  dropbox_id text not null,
  path text not null,
  file_name text not null,
  size_bytes bigint not null default 0,
  client_modified timestamptz,
  tag text not null,
  tag_key text not null,
  created_by uuid references public.worship_users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint worship_photo_tags_tag_check check (char_length(tag) between 1 and 40),
  constraint worship_photo_tags_size_check check (size_bytes >= 0),
  constraint worship_photo_tags_dropbox_tag_key unique (dropbox_id, tag_key)
);

create index if not exists worship_photo_tags_tag_key_idx
  on public.worship_photo_tags (tag_key);

create index if not exists worship_photo_tags_dropbox_id_idx
  on public.worship_photo_tags (dropbox_id);

create table if not exists public.worship_photo_index_runs (
  id bigint generated always as identity primary key,
  root_name text not null,
  ready boolean not null default false,
  indexed_at timestamptz not null default now()
);

create table if not exists public.worship_photo_folder_stats (
  run_id bigint not null references public.worship_photo_index_runs (id) on delete cascade,
  path text not null,
  name text not null,
  parent_path text,
  photo_count integer not null,
  size_bytes bigint not null,
  primary key (run_id, path),
  constraint worship_photo_folder_stats_totals_check check (photo_count >= 0 and size_bytes >= 0)
);

create index if not exists worship_photo_folder_stats_run_idx
  on public.worship_photo_folder_stats (run_id);

alter table public.worship_photo_tags enable row level security;
alter table public.worship_photo_index_runs enable row level security;
alter table public.worship_photo_folder_stats enable row level security;

revoke all on table public.worship_photo_tags from public, anon, authenticated;
revoke all on table public.worship_photo_index_runs from public, anon, authenticated;
revoke all on table public.worship_photo_folder_stats from public, anon, authenticated;

grant select, insert, update, delete on table public.worship_photo_tags to service_role;
grant select, insert, update, delete on table public.worship_photo_index_runs to service_role;
grant select, insert, update, delete on table public.worship_photo_folder_stats to service_role;

grant usage, select on sequence public.worship_photo_tags_id_seq to service_role;
grant usage, select on sequence public.worship_photo_index_runs_id_seq to service_role;
