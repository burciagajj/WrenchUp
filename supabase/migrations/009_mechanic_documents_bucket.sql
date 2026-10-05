-- Yojitan — Step 9: mechanic documents storage bucket
-- Private bucket used for mechanic identity uploads.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mechanic-documents',
  'mechanic-documents',
  false,
  10485760,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
