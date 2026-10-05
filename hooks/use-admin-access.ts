import { useEffect, useState } from "react";
import type { AuthUser } from "@/lib/auth-context";
import { checkClientAdminAccess } from "@/lib/admin-access";

/**
 * Resolves whether the current user has admin access (role === "admin" or
 * their email matches the configured admin email — see lib/admin-access.ts).
 * Used to conditionally show the in-app "Admin Tools" entry point so admins
 * can reach /admin/* screens from the drawer on native (Android/iOS), not
 * just by typing a URL in a web browser.
 */
export function useIsAdmin(user: AuthUser | null | undefined): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    void checkClientAdminAccess(user).then((allowed) => {
      if (!cancelled) setIsAdmin(allowed);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email, user?.role]);

  return isAdmin;
}
