/**
 * Runs region detection app-wide after store hydration.
 * Device locale is instant; GPS runs on auth screens (eager) via the same hook there.
 */

import { useRegionBootstrap } from "@/hooks/use-region-bootstrap";

export function RegionBootstrap() {
  useRegionBootstrap({ eager: false });
  return null;
}
