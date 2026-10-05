import { deriveBookedMeta } from "@/lib/booked-trip";
import { haversineMeters, metersToMiles } from "@/lib/geo";
import type { DispatchRequest } from "@/lib/live-dispatch";
import type { LatLng, MechanicJob, MechanicJobStatus } from "@/lib/types";

export function matchesMechanicRegion(request: DispatchRequest, region: "US" | "MX"): boolean {
  if (request.region_code === region) return true;
  if (request.region_code) return false;
  const normalizedCurrency = (request.currency || "").toUpperCase();
  return region === "MX" ? normalizedCurrency === "MXN" : normalizedCurrency !== "MXN";
}

export function isIncomingDispatchForMechanic(
  request: DispatchRequest,
  mechanicUserId: string,
  region: "US" | "MX",
): boolean {
  if (request.status !== "searching") return false;
  if (request.assigned_mechanic_user_id !== mechanicUserId) return false;
  if (request.customer_user_id === mechanicUserId) return false;
  return matchesMechanicRegion(request, region);
}

function pickupFromDispatchRequest(request: DispatchRequest): LatLng | undefined {
  const latitude = Number(request.customer_latitude);
  const longitude = Number(request.customer_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return { latitude, longitude };
}

function distanceMilesBetween(a: LatLng, b: LatLng): number {
  return +(metersToMiles(haversineMeters(a, b)).toFixed(1));
}

export function buildMechanicJobFromDispatchRequest(
  request: DispatchRequest,
  mechanicCoords?: LatLng | null,
): MechanicJob {
  const bookedMeta = deriveBookedMeta(request.scheduled_for ?? null, request.customer_note ?? null);
  const payout = Number((request.mechanic_payout ?? request.offered_price) || 0);
  const pickup = pickupFromDispatchRequest(request);
  const mechanicStart =
    mechanicCoords ??
    (typeof request.mechanic_latitude === "number" && typeof request.mechanic_longitude === "number"
      ? { latitude: request.mechanic_latitude, longitude: request.mechanic_longitude }
      : undefined);
  const distanceMiles =
    pickup && mechanicStart ? Math.max(0.1, distanceMilesBetween(mechanicStart, pickup)) : 1.5;
  return {
    id: request.id,
    remoteRequestId: request.id,
    isBooked: bookedMeta.isBooked,
    customerName: request.customer_name ?? "Customer",
    customerPhotoUrl: request.customer_photo_url ?? null,
    vehicle: request.vehicle_label,
    service: request.service_code as MechanicJob["service"],
    location: request.location_label,
    distanceMiles,
    payout: Number.isFinite(payout) ? payout : 0,
    tip: typeof request.tip === "number" ? request.tip : undefined,
    status: "pending",
    receivedAt: Date.now(),
    pickup,
    mechanicStart,
    scheduledFor: bookedMeta.scheduledForMs,
    customerNote: bookedMeta.cleanNote,
    customerHasParts: typeof request.customer_has_parts === "boolean" ? request.customer_has_parts : null,
    issuePhotoUrl: request.issue_photo_url ?? null,
  };
}

export function mechanicHasBlockingJob(
  jobs: Array<{ status: MechanicJobStatus }>,
): boolean {
  return jobs.some(
    (job) =>
      job.status === "pending" ||
      job.status === "heading_there" ||
      job.status === "arrived" ||
      job.status === "in_progress",
  );
}

export function mechanicAlreadyHasRequest(
  jobs: Array<{ id: string; remoteRequestId?: string }>,
  requestId: string,
): boolean {
  return jobs.some((job) => job.id === requestId || job.remoteRequestId === requestId);
}
