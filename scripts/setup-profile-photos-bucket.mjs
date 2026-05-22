#!/usr/bin/env node
/**
 * Creates the profile-photos Supabase Storage bucket via the Storage API.
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (Dashboard → Settings → API → service_role).
 *
 * Usage: node scripts/setup-profile-photos-bucket.mjs
 *
 * Alternative: run supabase/migrations/002_profile_photos_bucket.sql in SQL Editor.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const BUCKET_ID = "profile-photos";

function loadEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return {};
  const text = readFileSync(envPath, "utf8");
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL in .env");
  process.exit(1);
}

if (!serviceKey) {
  console.error(`
Missing SUPABASE_SERVICE_ROLE_KEY in .env

Option A — SQL (no service key needed):
  1. Open Supabase Dashboard → SQL Editor
  2. Paste and run: supabase/migrations/002_profile_photos_bucket.sql

Option B — this script:
  1. Dashboard → Settings → API → copy service_role key
  2. Add to .env: SUPABASE_SERVICE_ROLE_KEY=your_key_here
  3. Run: node scripts/setup-profile-photos-bucket.mjs
`);
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function main() {
  const check = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET_ID}`, { headers });
  if (check.ok) {
    console.log(`Bucket "${BUCKET_ID}" already exists.`);
    console.log("If uploads still fail, run 002_profile_photos_bucket.sql for RLS policies.");
    return;
  }

  const res = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      id: BUCKET_ID,
      name: BUCKET_ID,
      public: true,
      file_size_limit: 5242880,
      allowed_mime_types: ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"],
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Failed to create bucket:", res.status, body);
    console.error("\nRun supabase/migrations/002_profile_photos_bucket.sql in SQL Editor instead.");
    process.exit(1);
  }

  console.log(`Created bucket "${BUCKET_ID}" successfully.`);
  console.log("Also run 002_profile_photos_bucket.sql in SQL Editor to apply upload RLS policies.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
