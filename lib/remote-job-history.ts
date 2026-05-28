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

function toMechanicStatus(status: string, booked: { isBooked: boolean; scheduledForMs: number | null }): MechanicJobStatus {
  if (status === "searching") return "pending";
  if (status === "accepted") {
    if (booked.isBooked && (!booked.scheduledForMs || booked.scheduledForMs > Date.now())) return "upcoming";
    return "heading_there";
  }
  if (status === "enroute") return "heading_there";
  if (status === "arrived") return "arrived";
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

export function buildSnapshotFromDispatchRows(
  rows: DispatchRequest[],
  user: { id: string },
  existingPaymentMethods: PaymentMethod[],
  existingDefaultPaymentMethodId: string | null,
): Snapshot {
  const customerRows = rows.filter((r) => r.customer_user_id === user.id);
  const mechanicRows = rows.filter((r) => r.assigned_mechanic_user_id === user.id);

  const jobs: Job[] = customerRows.map((r) => {
    const booked = deriveBookedMeta(r.scheduled_for ?? null, r.customer_note ?? null);
    const createdAt = Date.parse(r.created_at) || Date.now();
    const updatedAt = Date.parse(r.updated_at) || createdAt;
    const acceptedAt = r.status === "accepted" || r.status === "enroute" || r.status === "arrived" || r.status === "in_progress" || r.status === "completed"
      ? updatedAt
      : undefined;
    const completedAt = r.status === "completed" ? updatedAt : undefined;
    return {
      id: `remote_${r.id}`,
      remoteRequestId: r.id,
      isBooked: booked.isBooked,
      scheduledFor: booked.scheduledForMs,
      mechanicId: r.assigned_mechanic_user_id ?? "unassigned",
      mechanicName: r.assigned_mechanic_name ?? undefined,
      vehicleId: `remote_vehicle_${r.id}`,
      service: (r.service_code as ServiceCode) ?? "diagnostic",
      location: r.location_label,
      status: toCustomerStatus(r.status),
      createdAt,
      acceptedAt,
      completedAt,
      fare: {
        base: 0,
        service: Number(r.offered_price || 0),
        distance: 0,
        total: Number(r.offered_price || 0),
      },
    };
  });

  const mechanicJobs: MechanicJob[] = mechanicRows.map((r) => {
    const booked = deriveBookedMeta(r.scheduled_for ?? null, r.customer_note ?? null);
    const receivedAt = Date.parse(r.created_at) || Date.now();
    const status = toMechanicStatus(r.status, booked);
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
      status,
      receivedAt,
      acceptedAt:
        status === "upcoming" || status === "heading_there" || status === "arrived" || status === "in_progress" || status === "completed"
          ? updatedAt
          : undefined,
      completedAt: status === "completed" ? updatedAt : undefined,
      customerNote: booked.cleanNote,
      customerHasParts: typeof r.customer_has_parts === "boolean" ? r.customer_has_parts : null,
      issuePhotoUrl: r.issue_photo_url ?? null,
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
