-- The profile-photos bucket (holds the mandatory admin-reviewed
-- face-verification photo, plus regular avatars) was created public with a
-- "to public" SELECT policy on storage.objects — anyone who obtained a
-- photo's URL could view it with no auth at all, forever. Every other
-- document/photo bucket in this app (mechanic-documents, vehicle-documents,
-- service-evidence) is private with no public/authenticated read policy;
-- access goes through service-role-minted signed URLs instead (see
-- app/api/profile-photo+api.ts's createSignedUrl, and
-- app/api/admin/photo-verifications+api.ts for the admin review path).
-- This migration brings profile-photos in line with that pattern. Existing
-- rows whose avatar_url still points at the old public URL format are
-- migrated separately — see scripts/resign-profile-photos.mjs.
update storage.buckets set public = false where id = 'profile-photos';

drop policy if exists "profile_photos_public_read" on storage.objects;

-- profile_photos_auth_insert / _update / _delete (scoped to the caller's own
-- folder) are left in place — they're what let the client-side direct-upload
-- fallback path (lib/_core/supabase-storage.ts) still write photos when the
-- server-side service-role path isn't available.
