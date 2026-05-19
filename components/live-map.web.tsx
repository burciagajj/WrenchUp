import { MapCard } from "@/components/map-card";
import type { LiveMapProps } from "./live-map-types";

/**
 * Web fallback: real maps require native modules; we keep the stylized SVG map.
 */
export function LiveMap({ status, etaMinutes, height = 220 }: LiveMapProps) {
  return <MapCard status={mapStatus(status)} etaMinutes={etaMinutes} height={height} />;
}

function mapStatus(s: LiveMapProps["status"]): React.ComponentProps<typeof MapCard>["status"] {
  if (s === "accepted" || s === "heading_there") return "enroute";
  return s as React.ComponentProps<typeof MapCard>["status"];
}
