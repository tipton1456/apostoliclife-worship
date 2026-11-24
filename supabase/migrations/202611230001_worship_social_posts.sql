-- Social photo submissions. Image bytes stay in Dropbox.
-- The review token is stored only as a hash.

create table if not exists public.worship_social_submissions (
  id uuid primary key,
  token_hash text not null unique,
  media_key text not null,
  folder_path text not null,
  caption text not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending_review',
  submitted_by uuid references public.worship_users (id) on delete set null,
  submitted_by_name text not null default '',
  publish_error text,
  facebook_post_id text,
  instagram_post_id text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worship_social_submissions_status_check check (
    status in ('pending_review', 'approved', 'publishing', 'published', 'rejected', 'failed')
  ),
  constraint worship_social_submissions_caption_check check (char_length(caption) between 1 and 2200)
);

create table if not exists public.worship_social_photos (
  id uuid primary key,
  submission_id uuid not null references public.worship_social_submissions (id) on delete cascade,
  dropbox_id text not null,
  path text not null,
  file_name text not null,
  decision text not null default 'pending',
  sort_order integer not null,
  feed_path text,
  story_path text,
  facebook_story_id text,
  instagram_story_id text,
  constraint worship_social_photos_decision_check check (decision in ('pending', 'approved', 'rejected'))
);

create index if not exists worship_social_submissions_due_idx
  on public.worship_social_submissions (status, scheduled_at);

create index if not exists worship_social_photos_submission_idx
  on public.worship_social_photos (submission_id, sort_order);

alter table public.worship_social_submissions enable row level security;
alter table public.worship_social_photos enable row level security;

revoke all on table public.worship_social_submissions from public, anon, authenticated;
revoke all on table public.worship_social_photos from public, anon, authenticated;

grant select, insert, update, delete on table public.worship_social_submissions to service_role;
grant select, insert, update, delete on table public.worship_social_photos to service_role;
