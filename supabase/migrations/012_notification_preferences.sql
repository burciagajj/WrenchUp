-- Yojitan — Step 12: notification preferences in user_profiles
-- Store chat/marketing notification preferences safely per user.

alter table if exists public.user_profiles
  add column if not exists chat_notifications_enabled boolean,
  add column if not exists marketing_notifications_enabled boolean;

update public.user_profiles
set
  chat_notifications_enabled = coalesce(chat_notifications_enabled, true),
  marketing_notifications_enabled = coalesce(marketing_notifications_enabled, true);

alter table public.user_profiles
  alter column chat_notifications_enabled set default true,
  alter column marketing_notifications_enabled set default true;

alter table public.user_profiles
  alter column chat_notifications_enabled set not null,
  alter column marketing_notifications_enabled set not null;
