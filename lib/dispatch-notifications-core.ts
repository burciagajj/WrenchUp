export type DispatchNotificationEvent =
  | "new_service_request"
  | "mechanic_matched"
  | "mechanic_offer_sent"
  | "mechanic_accepted_request"
  | "customer_accepted_quote"
  | "mechanic_arrived"
  | "job_completed"
  | "job_cancelled_by_mechanic"
  | "job_cancelled_by_customer"
  | "mechanic_withdrew_from_booking";

export type DispatchNotificationRouteInput = {
  event: DispatchNotificationEvent;
  requestId: string;
  scheduledFor?: string | null;
};

export type DispatchNotificationBodyInput = DispatchNotificationRouteInput & {
  customerName?: string | null;
  mechanicName?: string | null;
  serviceCode?: string | null;
};

export function shouldSkipDispatchNotification(input: {
  recipientUserId: string | null | undefined;
  initiatorUserId: string | null | undefined;
  actorUserId?: string | null | undefined;
}): boolean {
  const recipientUserId = input.recipientUserId?.trim();
  const initiatorUserId = input.initiatorUserId?.trim();
  const actorUserId = input.actorUserId?.trim();
  return !!recipientUserId && (recipientUserId === initiatorUserId || recipientUserId === actorUserId);
}

const SERVICE_LABELS: Record<string, string> = {
  battery_jump: "battery jump",
  flat_tire: "flat tire",
  lockout: "lockout",
  car_wash: "car wash",
  quick_check_up: "quick check-up",
  oil_change: "oil change",
  brake_service: "brake service",
  diagnostic: "diagnostic",
  engine_repair: "engine repair",
  ac_service: "A/C service",
  general_checkup: "general check-up",
  fuel_delivery: "fuel delivery",
  other: "service",
};

function firstName(value: string | null | undefined, fallback: string): string {
  const cleaned = value?.trim();
  if (!cleaned) return fallback;
  return cleaned.split(/\s+/)[0] || fallback;
}

function serviceLabel(code: string | null | undefined): string {
  if (!code) return "service";
  return SERVICE_LABELS[code] ?? code.replace(/_/g, " ");
}

export function buildDispatchNotificationRoute({
  event,
  requestId,
  scheduledFor,
}: DispatchNotificationRouteInput): string {
  const booked = !!scheduledFor;
  switch (event) {
    case "new_service_request":
      return booked ? `/mechanic/booked?id=${encodeURIComponent(requestId)}` : `/mechanic/incoming?id=${encodeURIComponent(requestId)}`;
    case "mechanic_matched":
      return "/request-pending";
    case "mechanic_offer_sent":
      // A priced counter-offer, not just a match — send straight to the
      // stacked offers screen where the customer can actually accept/decline
      // it, instead of the generic "still searching" screen.
      return "/mechanic-offers";
    case "mechanic_accepted_request":
    case "mechanic_arrived":
    case "job_completed":
      return "/tracking";
    case "customer_accepted_quote":
      return booked ? `/mechanic/incoming?id=${encodeURIComponent(requestId)}` : `/mechanic/incoming?id=${encodeURIComponent(requestId)}`;
    case "job_cancelled_by_mechanic":
    case "mechanic_withdrew_from_booking":
      return booked ? "/(tabs)/booked-requests" : "/";
    case "job_cancelled_by_customer":
      return "/(tabs)";
    default:
      return "/(tabs)";
  }
}

export function buildDispatchNotificationContent(input: DispatchNotificationBodyInput): {
  title: string;
  body: string;
  route: string;
} {
  const customerFirst = firstName(input.customerName, "Customer");
  const customerDisplay = input.customerName?.trim() || customerFirst;
  const mechanicFirst = firstName(input.mechanicName, "Mechanic");
  const service = serviceLabel(input.serviceCode);
  const route = buildDispatchNotificationRoute(input);

  switch (input.event) {
    case "new_service_request":
      return {
        title: "New service request",
        body: `${customerFirst} needs ${service}.`,
        route,
      };
    case "mechanic_matched":
      return {
        title: "Mechanic matched",
        body: `${mechanicFirst} has been matched to your request.`,
        route,
      };
    case "mechanic_offer_sent":
      return {
        title: "New offer",
        body: `${mechanicFirst} sent you an offer.`,
        route,
      };
    case "mechanic_accepted_request":
      return {
        title: "Mechanic accepted your request",
        body: `${mechanicFirst} has accepted your request.`,
        route,
      };
    case "customer_accepted_quote":
      return {
        title: "Service offered",
        body: `${customerDisplay} has offered you their requested service, accept or decline`,
        route,
      };
    case "mechanic_arrived":
      return {
        title: "Mechanic arrived",
        body: `${mechanicFirst} has arrived.`,
        route,
      };
    case "job_completed":
      return {
        title: "Job completed",
        body: `${mechanicFirst} marked the job complete. Please confirm to release payout.`,
        route,
      };
    case "job_cancelled_by_mechanic":
      return {
        title: input.scheduledFor ? "Booked service cancelled" : "Service cancelled",
        body: `${mechanicFirst} cancelled your ${service} request.`,
        route,
      };
    case "mechanic_withdrew_from_booking":
      return {
        title: "Mechanic unavailable",
        body: `${mechanicFirst} withdrew from your booked ${service}. We're finding another mechanic.`,
        route,
      };
    case "job_cancelled_by_customer":
      return {
        title: "Job cancelled",
        body: `${customerFirst} cancelled the ${service} request.`,
        route,
      };
    default:
      return {
        title: "Update",
        body: `${service} update available.`,
        route,
      };
  }
}
