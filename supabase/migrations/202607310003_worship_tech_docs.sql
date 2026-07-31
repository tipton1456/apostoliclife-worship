-- Apostolic Worship Tech Documentation library

create extension if not exists pgcrypto;

create table if not exists public.worship_tech_categories (
  name text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.worship_tech_uploaders (
  name text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.worship_tech_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null references public.worship_tech_categories (name),
  description text not null default '',
  uploaded_by text not null references public.worship_tech_uploaders (name),
  storage_path text not null unique,
  original_filename text not null,
  content_type text not null default 'application/octet-stream',
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists worship_tech_documents_category_idx
  on public.worship_tech_documents (category);

create index if not exists worship_tech_documents_created_idx
  on public.worship_tech_documents (created_at desc);

create index if not exists worship_tech_documents_title_idx
  on public.worship_tech_documents (lower(title));

alter table public.worship_tech_categories enable row level security;
alter table public.worship_tech_uploaders enable row level security;
alter table public.worship_tech_documents enable row level security;

-- Seed useful default categories
insert into public.worship_tech_categories (name) values
  ('General'),
  ('Mic Board'),
  ('PreSonus'),
  ('Networking'),
  ('Planning Center'),
  ('Events'),
  ('Lighting'),
  ('Streaming')
on conflict (name) do nothing;

insert into public.worship_tech_uploaders (name) values
  ('Steve Tipton')
on conflict (name) do nothing;

-- Private storage bucket (service role uploads/downloads from the app)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'worship-tech-docs',
  'worship-tech-docs',
  false,
  52428800,
  null
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

comment on table public.worship_tech_documents is
  'Tech department documentation library for Apostolic Worship portal';
