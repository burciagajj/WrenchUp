import type { LatLng } from "@/lib/types";

export type LiveMapStatus =
  | "idle"
  | "searching"
  | "accepted"
  | "enroute"
  | "heading_there"
  | "arrived"
  | "in_progress"
  | "completed";

export interface LiveMapProps {
  status: LiveMapStatus;
  /** Customer location (pickup pin). */
  pickup?: LatLng | null;
  /** Mechanic current location (animated puck). */
  mechanic?: LatLng | null;
  /** Optional list of nearby mechanic markers. */
  nearby?: { id: string; coord: LatLng; name?: string }[];
  /** ETA in minutes for status chip. */
  etaMinutes?: number;
  /** Height in pixels (default 220). */
  height?: number;
}
