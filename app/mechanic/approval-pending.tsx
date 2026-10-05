import { Redirect } from "expo-router";

/**
 * Superseded by app/approval-pending.tsx, which handles both roles
 * (mechanics need document approval AND photo approval; customers need
 * photo approval). Kept as a redirect so any old cached route/link still
 * lands somewhere sensible.
 */
export default function MechanicApprovalPendingRedirect() {
  return <Redirect href="/approval-pending" />;
}
