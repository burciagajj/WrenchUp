import { AppDrawer } from "@/components/app-drawer";
import { useAuth } from "@/lib/auth-context";

/** Renders the slide-in menu only when the user is signed in. */
export function AuthenticatedDrawer() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading || !isAuthenticated) return null;
  return <AppDrawer />;
}
