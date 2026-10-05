import type { DispatchRequest } from "@/lib/live-dispatch";
import type { Job, JobStatus, MechanicJob, MechanicJobStatus, PaymentMethod, ServiceCode } from "@/lib/types";
import { deriveBookedMeta } from "@/lib/booked-trip";

type Snapshot = {
  jobs: Job[];
  activeJobId: string | null;
  mechanicJobs: MechanicJob[];
  mechanicActiveJobId: string | null;
  paymentMethods: PaymentMethod[];
  defaultPaymentMethodId: string | null;
};

function toCustomerStatus(status: string): JobStatus {
  if (status === "searching" || status === "accepted" || status === "enroute" || status === "arrived" || status === "in_progress" || status === "completed" || status === "cancelled") {
    return status;
  }
  return "searching";
}

function toMechanicStatus(status: string, booked: { isBooked: boolean; scheduledForMs: number | null }, mechanicMarkedDone: boolean): MechanicJobStatus {
  if (status === "completed" || mechanicMarkedDone) return "completed";
  if (status === "searching") return "pending";
  if (status === "accepted") {
    if (booked.isBooked && (!booked.scheduledForMs || booked.scheduledForMs > Date.now())) return "upcoming";
    return "heading_there";
  }
  if (status === "enroute") return "heading_there";
  if (status === "arrived") return "arrived";
  if (status === "in_progress") return "in_progress";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

export function buildSnapshotFromDispatchRows(
  rows: DispatchRequest[],
  user: { id: string },
  existingPaymentMethods: PaymentMethod[],
  existingDefaultPaymentMethodId: string | null,
  recentCancellationIds: string[] = [],
): Snapshot {
  const cancelledIds = new Set(recentCancellationIds);
  const isLocallyCancelled = (requestId: string) => cancelledIds.has(requestId);
  const customerRows = rows.filter((r) => r.customer_user_id === user.id);
  const mechanicRows = rows.filter((r) => r.assigned_mechanic_user_id === user.id);

  const jobs: Job[] = customerRows.map((r) => {
    const booked = deriveBookedMeta(r.scheduled_for ?? null, r.customer_note ?? null);
    const createdAt = Date.parse(r.created_at) || Date.now();
    const updatedAt = Date.parse(r.updated_at) || createdAt;
    const mechanicAcceptedAt = r.mechanic_accepted_at ? Date.parse(r.mechanic_accepted_at) || updatedAt : undefined;
    const customerQuoteAcceptedAt = r.customer_quote_accepted_at
      ? Date.parse(r.customer_quote_accepted_at) || updatedAt
      : undefined;
    const acceptedAt =
      mechanicAcceptedAt ??
      (r.status === "accepted" || r.status === "enroute" || r.status === "arrived" || r.status === "in_progress" || r.status === "completed"
        ? updatedAt
        : undefined);
    const completedAt = r.status === "completed" ? updatedAt : undefined;
    const rating = (r as any).rating != null ? Number((r as any).rating) : undefined;
    const tip = (r as any).tip != null ? Number((r as any).tip) : undefined;
    const ratingComment = (r as any).rating_comment ?? undefined;
    const customerRating = r.customer_rating != null ? Number(r.customer_rating) : undefined;
    const customerRatingComment = r.customer_rating_comment ?? undefined;
    const localCancelled = isLocallyCancelled(r.id) && r.status !== "cancelled" && r.status !== "completed";
    return {
      id: `remote_${r.id}`,
      remoteRequestId: r.id,
      isBooked: booked.isBooked,
      scheduledFor: booked.scheduledForMs,
      mechanicOfferSentAt: r.mechanic_offer_sent_at ? Date.parse(r.mechanic_offer_sent_at) || undefined : undefined,
      offerExpiresAt: r.offer_expires_at ? Date.parse(r.offer_expires_at) || undefined : undefined,
      customerQuoteAcceptedAt,
      mechanicAcceptedAt,
      stripePaymentIntentId: r.stripe_payment_intent_id ?? null,
      mechanicId: r.assigned_mechanic_user_id ?? "unassigned",
      mechanicName: r.assigned_mechanic_name ?? undefined,
      vehicleId: `remote_vehicle_${r.id}`,
      service: (r.service_code as ServiceCode) ?? "diagnostic",
      location: r.location_label,
      status: localCancelled ? "cancelled" : toCustomerStatus(r.status),
      createdAt,
      acceptedAt,
      completedAt,
      fare: {
        service: Number(r.offered_price || 0),
        bookingFee: 0,
        total: Number(r.offered_price || 0),
      },
      rating,
      tip,
      ratingComment,
      customerRating,
      customerRatingComment,
    };
  });

  const mechanicJobs: MechanicJob[] = mechanicRows.map((r) => {
    const booked = deriveBookedMeta(r.scheduled_for ?? null, r.customer_note ?? null);
    const receivedAt = Date.parse(r.created_at) || Date.now();
    const mechanicMarkedDone = !!(r as any).mechanic_marked_done_at;
    const status = isLocallyCancelled(r.id) && r.status !== "cancelled" && r.status !== "completed"
      ? "cancelled"
      : toMechanicStatus(r.status, booked, mechanicMarkedDone);
    const updatedAt = Date.parse(r.updated_at) || receivedAt;
    return {
      id: r.id,
      remoteRequestId: r.id,
      isBooked: booked.isBooked,
      scheduledFor: booked.scheduledForMs,
      customerName: r.customer_name ?? "Customer",
      customerPhotoUrl: r.customer_photo_url ?? null,
      vehicle: r.vehicle_label,
      service: (r.service_code as ServiceCode) ?? "diagnostic",
      location: r.location_label,
      distanceMiles: 1.5,
      payout: Number((r.mechanic_payout ?? r.offered_price) || 0),
      tip: (r as any).tip != null ? Number((r as any).tip) : undefined,
      status,
      receivedAt,
      mechanicOfferSentAt: r.mechanic_offer_sent_at ? Date.parse(r.mechanic_offer_sent_at) || undefined : undefined,
      offerExpiresAt: r.offer_expires_at ? Date.parse(r.offer_expires_at) || undefined : undefined,
      customerQuoteAcceptedAt: r.customer_quote_accepted_at ? Date.parse(r.customer_quote_accepted_at) || undefined : undefined,
      mechanicAcceptedAt: r.mechanic_accepted_at ? Date.parse(r.mechanic_accepted_at) || undefined : undefined,
      stripePaymentIntentId: r.stripe_payment_intent_id ?? null,
      acceptedAt:
        status === "upcoming" || status === "heading_there" || status === "arrived" || status === "in_progress" || status === "completed"
          ? updatedAt
          : undefined,
      completedAt: status === "completed" ? updatedAt : undefined,
      customerNote: booked.cleanNote,
      customerHasParts: typeof r.customer_has_parts === "boolean" ? r.customer_has_parts : null,
      issuePhotoUrl: r.issue_photo_url ?? null,
      rating: r.rating != null ? Number(r.rating) : undefined,
      ratingComment: r.rating_comment ?? undefined,
      customerRating: r.customer_rating != null ? Number(r.customer_rating) : undefined,
      customerRatingComment: r.customer_rating_comment ?? undefined,
    };
  });

  const activeJob = jobs.find((j) => j.status !== "completed" && j.status !== "cancelled") ?? null;
  const activeMechanicJob =
    mechanicJobs.find((j) => j.status === "heading_there" || j.status === "arrived" || j.status === "in_progress") ?? null;

  return {
    jobs,
    activeJobId: activeJob?.id ?? null,
    mechanicJobs,
    mechanicActiveJobId: activeMechanicJob?.id ?? null,
    paymentMethods: existingPaymentMethods,
    defaultPaymentMethodId: existingDefaultPaymentMethodId,
  };
}
