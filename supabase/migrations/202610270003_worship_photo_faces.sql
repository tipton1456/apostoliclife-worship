-- Face recognition index for service photos.
-- Photo bytes stay in Dropbox. These tables remember face descriptors,
-- folder scans, and suggestions waiting for approval.

create table if not exists public.worship_face_references (
  id bigint generated always as identity primary key,
  tag text not null,
  tag_key text not null,
  dropbox_id text not null,
  embedding jsonb not null,
  created_by uuid references public.worship_users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint worship_face_references_tag_check check (char_length(tag) between 1 and 40)
);

create index if not exists worship_face_references_tag_key_idx
  on public.worship_face_references (tag_key, created_at);

create table if not exists public.worship_face_scans (
  dropbox_id text primary key,
  folder_path text not null,
  scanned_at timestamptz not null default now()
);

create table if not exists public.worship_face_suggestions (
  id bigint generated always as identity primary key,
  client_key text not null,
  folder_path text not null,
  dropbox_id text not null,
  path text not null,
  file_name text not null,
  box jsonb not null,
  crop_jpeg text not null,
  embedding jsonb not null,
  status text not null default 'pending',
  suggested_tag text,
  suggested_tag_key text,
  distance double precision,
  created_at timestamptz not null default now(),
  constraint worship_face_suggestions_client_key unique (client_key),
  constraint worship_face_suggestions_status_check check (status in ('pending', 'approved', 'dismissed')),
  constraint worship_face_suggestions_tag_check check (suggested_tag is null or char_length(suggested_tag) between 1 and 40)
);

create index if not exists worship_face_suggestions_status_idx
  on public.worship_face_suggestions (status, path);

alter table public.worship_face_references enable row level security;
alter table public.worship_face_scans enable row level security;
alter table public.worship_face_suggestions enable row level security;

revoke all on table public.worship_face_references from public, anon, authenticated;
revoke all on table public.worship_face_scans from public, anon, authenticated;
revoke all on table public.worship_face_suggestions from public, anon, authenticated;

grant select, insert, update, delete on table public.worship_face_references to service_role;
grant select, insert, update, delete on table public.worship_face_scans to service_role;
grant select, insert, update, delete on table public.worship_face_suggestions to service_role;

grant usage, select on sequence public.worship_face_references_id_seq to service_role;
grant usage, select on sequence public.worship_face_suggestions_id_seq to service_role;
