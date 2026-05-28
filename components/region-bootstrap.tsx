/**
 * Runs region detection app-wide after store hydration.
 * Device locale is instant; GPS runs on auth screens (eager) via the same hook there.
 */

import { useRegionBootstrap } from "@/hooks/use-region-bootstrap";

export function RegionBootstrap() {
  // Run eager location refinement app-wide so MX detection works even when device language is English.
  useRegionBootstrap({ eager: true });
  return null;
}
