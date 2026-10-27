-- Select access, mobile numbers for password texts, and the photo library.
-- Big Top is no longer an assignable area.

alter table public.worship_users
  add column if not exists phone text not null default '';

alter table public.worship_users
  drop constraint if exists worship_users_access_level_check;

alter table public.worship_users
  add constraint worship_users_access_level_check
  check (access_level in ('admin', 'select', 'member'));

alter table public.worship_users
  alter column access_level set default 'select';

update public.worship_users
set access_level = 'select'
where access_level = 'member';

delete from public.worship_user_features
where feature = 'big_top';

alter table public.worship_user_features
  drop constraint if exists worship_user_features_feature_check;

alter table public.worship_user_features
  add constraint worship_user_features_feature_check
  check (
    feature in (
      'control_panel',
      'mic_board',
      'select_board',
      'manual_board',
      'docs',
      'choir_sunday',
      'serve_report',
      'photos'
    )
  );
