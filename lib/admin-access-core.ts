export type AdminAccessProfile = {
  role?: string | null;
  email?: string | null;
};

// Admin access is locked to this specific account, on top of whatever
// ADMIN_USER_EMAIL / EXPO_PUBLIC_ADMIN_EMAIL happens to be configured. A
// `role` column value of "admin" is intentionally NOT sufficient on its own
// (see isAdminAccess below) — that field can drift (manual DB edits, future
// bugs, a different account someone flags as admin) and previously would
// have granted full admin API access to anyone it was set on, regardless of
// email. Email is the actual gate now.
const AUTHORIZED_ADMIN_EMAIL = "jjburciagap@gmail.com";

export function normalizeAdminEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || "";
}

export function isAdminAccess(
  profile: AdminAccessProfile | null | undefined,
  configuredAdminEmail?: string | null,
): boolean {
  const userEmail = normalizeAdminEmail(profile?.email);
  if (!userEmail) return false;
  if (userEmail === normalizeAdminEmail(AUTHORIZED_ADMIN_EMAIL)) return true;
  const adminEmail = normalizeAdminEmail(configuredAdminEmail);
  return !!adminEmail && userEmail === adminEmail;
}
