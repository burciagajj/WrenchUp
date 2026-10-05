import type { AuthUser } from "@/lib/auth-context";
import { resolveAuthSession } from "@/lib/resolve-auth-session";
import { supabaseUserData } from "@/lib/_core/supabase-user-data";
import { isAdminAccess } from "@/lib/admin-access-core";

function getConfiguredAdminEmail(): string {
  return (
    process.env.EXPO_PUBLIC_ADMIN_EMAIL ||
    process.env.ADMIN_USER_EMAIL ||
    ""
  );
}

export async function checkClientAdminAccess(user: AuthUser | null | undefined): Promise<boolean> {
  if (!user?.id) return false;

  const configuredAdminEmail = getConfiguredAdminEmail();
  if (isAdminAccess({ role: null, email: user.email }, configuredAdminEmail)) {
    return true;
  }

  const resolved = await resolveAuthSession(user);
  if (!resolved) return false;

  try {
    const profile = await supabaseUserData.getOrCreateProfile(
      user.id,
      user.role,
      resolved.sessionToken,
    );
    return isAdminAccess(
      { role: profile.role, email: profile.email ?? user.email },
      configuredAdminEmail,
    );
  } catch {
    return isAdminAccess({ role: null, email: user.email }, configuredAdminEmail);
  }
}
