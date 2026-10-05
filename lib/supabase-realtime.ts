import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

let realtimeClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseRealtimeClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!realtimeClient) {
    realtimeClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return realtimeClient;
}
