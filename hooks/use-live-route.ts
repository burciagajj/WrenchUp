import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRouteEta, type RouteResult } from "@/lib/route-eta";
import {
  estimateDriveEta,
  isRoutableCoords,
  pathLengthMiles,
  remainingPath,
  type DriveEta,
} from "@/lib/route-eta-core";
import { haversineMeters } from "@/lib/geo";
import type { LatLng } from "@/lib/types";

/** Re-ask Google only after this long AND this much movement (each call is billed). */
const REFRESH_AFTER_MS = 2 * 60 * 1000;
const REFRESH_AFTER_METERS = 100;

type FetchedRoute = RouteResult & { fetchedAt: number; fetchedFrom: LatLng; destination: LatLng };

/**
 * Road route from a moving origin (the mechanic) to a destination (the
 * customer), for the live maps. Returns the remaining road path to draw and
 * an ETA scaled to how much of that path is left, so the line shrinks and the
 * ETA counts down between (rate-limited) route refreshes. Without a route —
 * Routes API off, offline — falls back to a straight-line estimate and no
 * path, and the map draws its dashed straight line instead.
 */
export function useLiveRoute(
  origin: LatLng | null | undefined,
  destination: LatLng | null | undefined,
  enabled: boolean,
): { eta: DriveEta | null; path: LatLng[] | null } {
  const [route, setRoute] = useState<FetchedRoute | null>(null);
  const inFlightRef = useRef(false);
  const originOk = isRoutableCoords(origin);
  const destinationOk = isRoutableCoords(destination);

  useEffect(() => {
    if (!enabled || !originOk || !destinationOk || inFlightRef.current) return;
    const from = origin as LatLng;
    const to = destination as LatLng;
    const destinationChanged =
      !route ||
      route.destination.latitude !== to.latitude ||
      route.destination.longitude !== to.longitude;
    const stale =
      !!route &&
      Date.now() - route.fetchedAt >= REFRESH_AFTER_MS &&
      haversineMeters(route.fetchedFrom, from) >= REFRESH_AFTER_METERS;
    if (!destinationChanged && !stale) return;

    inFlightRef.current = true;
    fetchRouteEta(from, to, { includePath: true })
      .then((result) => {
        if (result) setRoute({ ...result, fetchedAt: Date.now(), fetchedFrom: from, destination: to });
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [enabled, originOk, destinationOk, origin, destination, route]);

  return useMemo(() => {
    if (!enabled || !originOk || !destinationOk) return { eta: null, path: null };
    const from = origin as LatLng;
    const to = destination as LatLng;
    if (route?.path && route.destination.latitude === to.latitude && route.destination.longitude === to.longitude) {
      const rest = remainingPath(route.path, from);
      const totalMiles = pathLengthMiles(route.path);
      const restMiles = pathLengthMiles(rest);
      const share = totalMiles > 0 ? Math.min(1, restMiles / totalMiles) : 1;
      return {
        eta: {
          distanceMiles: +restMiles.toFixed(1),
          durationMinutes: Math.max(1, Math.ceil(route.durationMinutes * share)),
          source: "route",
        },
        path: rest,
      };
    }
    return { eta: estimateDriveEta(from, to), path: null };
  }, [enabled, originOk, destinationOk, origin, destination, route]);
}
