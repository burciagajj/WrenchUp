#!/usr/bin/env node
/**
 * DANGER: Deletes ALL users (auth.users) and cascades to profiles, vehicles, jobs, service_requests etc.
 * Use to start over fresh.
 *
 * Prerequisites:
 * 1. Go to Supabase Dashboard > your project > Settings > API
 * 2. Copy the "service_role" key (secret, never commit)
 * 3. Add to .env : SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
 * 4. Run: node scripts/reset-supabase-accounts.mjs
 *
 * This uses the Admin API (auth.admin.deleteUser) which requires service_role.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(root, '.env');
  const env = { ...process.env };
  if (!existsSync(envPath)) return env;

  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    if (!line || line.trim().startsWith('#')) continue;
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim().replace(/^["']|["']$/g, '');
      if (!env[key]) env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;

// Allow passing key via CLI for convenience: node ... --service-key=eyJ...
let serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const keyArg = process.argv.find(a => a.startsWith('--service-key='));
if (keyArg) {
  serviceKey = keyArg.split('=')[1];
}

if (!supabaseUrl) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL in .env');
  process.exit(1);
}

if (!serviceKey) {
  console.error(`
❌ Missing SUPABASE_SERVICE_ROLE_KEY

To erase all accounts:

Option 1 (recommended):
1. Open Supabase Dashboard: https://supabase.com/dashboard/project/ftvbmpajwocikjqxwbao
2. Settings (gear) → API → copy the "service_role" key (starts with eyJ...)
3. Add to your .env :
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
4. Re-run: node scripts/reset-supabase-accounts.mjs

Option 2 (one-off, no edit to .env):
   node scripts/reset-supabase-accounts.mjs --service-key=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

⚠️ Never commit the service_role key. It has full admin access.

After deletion you can sign up fresh accounts in the app.
`);
  process.exit(1);
}

console.log('🚨 DANGER: This will PERMANENTLY DELETE all auth users and related data (profiles, vehicles, jobs, service requests, etc.)');
console.log('Project:', supabaseUrl);
console.log('Connecting with service role...');

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function resetAllAccounts() {
  try {
    // List all users (paginated, but for dev usually small)
    console.log('Fetching users...');
    const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;

    console.log(`Found ${users.length} user(s).`);

    if (users.length === 0) {
      console.log('✅ No users to delete. Database is already clean.');
      return;
    }

    let deleted = 0;
    for (const user of users) {
      console.log(`Deleting user: ${user.email || user.id} ...`);
      const { error: delErr } = await supabase.auth.admin.deleteUser(user.id);
      if (delErr) {
        console.error(`  ❌ Failed to delete ${user.id}:`, delErr.message);
      } else {
        deleted++;
        console.log(`  ✅ Deleted ${user.id}`);
      }
    }

    console.log(`\n🎉 Done. Deleted ${deleted}/${users.length} users.`);

    // Also empty the profile-photos storage bucket (using service role)
    try {
      console.log('\nCleaning profile-photos storage bucket...');
      const bucket = 'profile-photos';
      const { data: files, error: listErr } = await supabase.storage.from(bucket).list('', { limit: 1000 });
      if (listErr) {
        console.log('  (Bucket may not exist or no access):', listErr.message);
      } else if (files && files.length > 0) {
        const paths = files.map(f => f.name);
        const { error: removeErr } = await supabase.storage.from(bucket).remove(paths);
        if (removeErr) {
          console.error('  ❌ Failed to remove some files:', removeErr.message);
        } else {
          console.log(`  ✅ Removed ${paths.length} file(s) from ${bucket} bucket.`);
        }
      } else {
        console.log('  (No files in bucket)');
      }
    } catch (e) {
      console.log('  (Storage cleanup skipped:', e.message || e, ')');
    }

    console.log('\n✅ Supabase accounts and related data (profiles, vehicles, jobs, requests, photos) have been cleared.');
    console.log('You can now start fresh by signing up new accounts in the app.');
    console.log('Tip: You may also want to clear the app\'s local storage (e.g. uninstall/reinstall dev build or clear AsyncStorage in dev menu).');

  } catch (err) {
    console.error('Error during reset:', err);
    if (err.message && err.message.includes('Invalid API key')) {
      console.error('\n❌ The service key provided is invalid or truncated (you used "...").');
      console.error('Please copy the COMPLETE service_role key from Supabase Dashboard → Settings → API and try again.');
    }
    process.exit(1);
  }
}

resetAllAccounts();