-- Yojitan — Step 11: store Expo push tokens for chat notifications
-- Safe, idempotent profile column addition.

alter table if exists public.user_profiles
  add column if not exists expo_push_token text;

create index if not exists user_profiles_expo_push_token_idx
  on public.user_profiles (expo_push_token)
  where expo_push_token is not null;
