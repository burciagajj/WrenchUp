-- Yojitan — Step 10: service message history for live dispatch chat
-- Messages are attached to a service_request and visible to the customer + assigned mechanic.

create extension if not exists "pgcrypto";

create table if not exists public.service_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'mechanic')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists service_messages_request_id_created_at_idx
  on public.service_messages (request_id, created_at asc);
create index if not exists service_messages_sender_user_id_idx
  on public.service_messages (sender_user_id, created_at desc);

alter table public.service_messages enable row level security;

drop policy if exists "service_messages_select_participants" on public.service_messages;
create policy "service_messages_select_participants"
  on public.service_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.service_requests sr
      where sr.id = service_messages.request_id
        and (
          sr.customer_user_id = auth.uid()
          or sr.assigned_mechanic_user_id = auth.uid()
        )
    )
  );

drop policy if exists "service_messages_insert_participants" on public.service_messages;
create policy "service_messages_insert_participants"
  on public.service_messages for insert
  to authenticated
  with check (
    sender_user_id = auth.uid()
    and exists (
      select 1
      from public.service_requests sr
      where sr.id = service_messages.request_id
        and (
          sr.customer_user_id = auth.uid()
          or sr.assigned_mechanic_user_id = auth.uid()
        )
    )
  );

grant select, insert on public.service_messages to authenticated;
