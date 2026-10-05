// Read-only client fetch for a mechanic's own service-capability rows
// (mechanic_service_capabilities is select-restricted to the owning row —
// see supabase/migrations/042_mechanic_service_capabilities.sql). Writes
// always go through app/api/mechanic-capability-doc+api.ts, never direct
// PostgREST, so this module is deliberately read-only.

export type MechanicServiceCapability = {
  capability_code: string;
  document_url: string | null;
  status: "pending_review" | "approved" | "rejected";
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

function getConfig() {
  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "",
  };
}

export async function fetchMechanicServiceCapabilities(
  userId: string,
  sessionToken: string
): Promise<MechanicServiceCapability[]> {
  const { supabaseUrl, anonKey } = getConfig();
  if (!supabaseUrl || !anonKey || !userId || !sessionToken) return [];

  const res = await fetch(
    `${supabaseUrl}/rest/v1/mechanic_service_capabilities?mechanic_user_id=eq.${userId}&select=capability_code,document_url,status,rejection_reason,submitted_at,reviewed_at`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${sessionToken}`,
      },
    }
  );
  if (!res.ok) {
    // Table might not exist yet on an older schema — don't break the
    // requirements screen over it.
    return [];
  }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? (rows as MechanicServiceCapability[]) : [];
}
