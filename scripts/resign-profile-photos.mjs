#!/usr/bin/env node
/**
 * One-time migration: the `profile-photos` Storage bucket was switched from
 * public to private (it holds the mandatory admin-reviewed face-verification
 * photo, which shouldn't be viewable by anyone who obtains the URL with no
 * auth at all). Any user_profiles.avatar_url value written before that
 * switch still points at the old `/object/public/profile-photos/...` path,
 * which now 403s since the bucket no longer serves that route. This script
 * re-signs each of those rows with a long-lived signed URL (1 year, matching
 * app/api/profile-photo+api.ts) so existing users' photos keep working.
 *
 * New uploads already get a signed URL automatically — this only needs to
 * run once for rows created before the bucket switched.
 *
 * Prerequisites:
 * 1. SUPABASE_SERVICE_ROLE_KEY set in .env (same key used everywhere else
 *    in this project)
 * 2. Run: node scripts/resign-profile-photos.mjs
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const envPath = resolve(root, ".env");
  const env = { ...process.env };
  if (!existsSync(envPath)) return env;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!env[key]) env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_ID = "profile-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365;
const PUBLIC_URL_PREFIX = `/storage/v1/object/public/${BUCKET_ID}/`;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

async function main() {
  const listRes = await fetch(
    `${supabaseUrl}/rest/v1/user_profiles?avatar_url=like.*${encodeURIComponent(PUBLIC_URL_PREFIX)}*&select=user_id,avatar_url`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!listRes.ok) {
    console.error("Failed to list affected rows:", await listRes.text());
    process.exit(1);
  }
  const rows = await listRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("No rows to migrate — nothing points at the old public URL format.");
    return;
  }

  console.log(`Found ${rows.length} row(s) with an old public-bucket avatar_url. Re-signing...`);

  for (const row of rows) {
    const idx = row.avatar_url.indexOf(PUBLIC_URL_PREFIX);
    if (idx === -1) continue;
    const path = row.avatar_url.slice(idx + PUBLIC_URL_PREFIX.length);

    const signRes = await fetch(`${supabaseUrl}/storage/v1/object/sign/${BUCKET_ID}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
    });
    const signData = await signRes.json().catch(() => ({}));
    if (!signRes.ok || !signData?.signedURL) {
      console.error(`  ✗ ${row.user_id}: could not sign (${signData?.message || signData?.error || signRes.status}) — object may no longer exist at "${path}"`);
      continue;
    }
    const signedPath = String(signData.signedURL);
    const newUrl = signedPath.startsWith("http") ? signedPath : `${supabaseUrl}/storage/v1${signedPath}`;

    const patchRes = await fetch(`${supabaseUrl}/rest/v1/user_profiles?user_id=eq.${row.user_id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ avatar_url: newUrl }),
    });
    if (!patchRes.ok) {
      console.error(`  ✗ ${row.user_id}: signed OK but failed to save (${await patchRes.text()})`);
      continue;
    }
    console.log(`  ✓ ${row.user_id}: re-signed`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
