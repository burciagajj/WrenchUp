-- WrenchUp — Step 2: profile-photos storage bucket + RLS
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- Fixes: "Bucket not found" when uploading profile pictures
-- Bucket id must match lib/_core/supabase-storage.ts → bucketName = 'profile-photos'

-- ---------------------------------------------------------------------------
-- Bucket (public read; uploads restricted to own folder via RLS below)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- RLS policies on storage.objects
-- Path format from app: {user_id}/{user_id}_{timestamp}.jpg
-- ---------------------------------------------------------------------------
drop policy if exists "profile_photos_public_read" on storage.objects;
drop policy if exists "profile_photos_auth_insert" on storage.objects;
drop policy if exists "profile_photos_auth_update" on storage.objects;
drop policy if exists "profile_photos_auth_delete" on storage.objects;

-- Anyone can view (bucket is public; avatars shown in app)
create policy "profile_photos_public_read"
on storage.objects
for select
to public
using (bucket_id = 'profile-photos');

-- Signed-in users upload only under their own folder
create policy "profile_photos_auth_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "profile_photos_auth_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "profile_photos_auth_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
