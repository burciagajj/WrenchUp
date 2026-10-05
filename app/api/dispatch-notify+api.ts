import {
  buildDispatchNotificationContent,
  shouldSkipDispatchNotification,
  type DispatchNotificationEvent,
} from "@/lib/dispatch-notifications-core";
import {
  getCurrentUserId,
  getNotificationServiceConfig,
  sendExpoPush,
  supabaseRest,
} from "@/lib/notification-service";
import { deriveBookedMeta } from "@/lib/booked-trip";
import { recordAnalyticsEvent } from "@/lib/analytics-service";

type DispatchPushRole = "customer" | "mechanic";

function isDispatchEvent(value: unknown): value is DispatchNotificationEvent {
  return (
    value === "new_service_request" ||
    value === "mechanic_matched" ||
    value === "mechanic_offer_sent" ||
    value === "mechanic_accepted_request" ||
    value === "customer_accepted_quote" ||
    value === "mechanic_arrived" ||
    value === "job_completed" ||
    value === "job_cancelled_by_mechanic" ||
    value === "job_cancelled_by_customer" ||
    value === "mechanic_withdrew_from_booking"
  );
}

function isAllowedRecipient(event: DispatchNotificationEvent): DispatchPushRole {
  if (
    event === "new_service_request" ||
    event === "customer_accepted_quote" ||
    event === "job_cancelled_by_customer"
  ) {
    return "mechanic";
  }
  return "customer";
}

export async function POST(request: Request) {
  let requestId = "";
  let initiatorUserId = "";
  let actorUserId = "";
  let event: DispatchNotificationEvent | undefined;
  let recipientUserId = "";
  let recipientRole: DispatchPushRole | null = null;
  try {
    const authHeader = request.headers.get("authorization") || "";
    const sessionToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!sessionToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    requestId = String(body?.requestId || "");
    initiatorUserId = String(body?.initiatorUserId || "");
    actorUserId = String(body?.actorUserId || initiatorUserId || "");
    event = body?.event;

    if (!requestId || !initiatorUserId || !isDispatchEvent(event)) {
      return Response.json({ error: "requestId, initiatorUserId, and event are required" }, { status: 400 });
    }

    const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
    if (!supabaseUrl || !serviceKey) {
      return Response.json({ error: "Notification service unavailable" }, { status: 503 });
    }

    const currentUserId = await getCurrentUserId(supabaseUrl, serviceKey, sessionToken);
    if (!currentUserId || currentUserId !== initiatorUserId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestRows = await supabaseRest<{
      id: string;
      customer_user_id: string;
      assigned_mechanic_user_id: string | null;
      customer_name: string | null;
      assigned_mechanic_name: string | null;
      service_code: string;
      scheduled_for: string | null;
      status: string;
      customer_note: string | null;
    }[]>(
      `/service_requests?id=eq.${encodeURIComponent(requestId)}&select=id,customer_user_id,assigned_mechanic_user_id,customer_name,assigned_mechanic_name,service_code,scheduled_for,status,customer_note`,
      "GET",
      serviceKey,
    );

    const dispatchRequest = Array.isArray(requestRows) ? requestRows[0] : null;
    if (!dispatchRequest) {
      return Response.json({ ok: true, delivered: false, reason: "request_not_found" });
    }

    // The initiator check above only proves the caller isn't lying about
    // their own identity — it doesn't prove they're actually a party to
    // *this* request. Mechanics see other people's open request ids through
    // normal polling before being matched, so without this check anyone
    // could fire notification events for a job they have nothing to do
    // with. Mirrors the ownership check in mechanic-cancel-service.ts.
    if (
      currentUserId !== dispatchRequest.customer_user_id &&
      currentUserId !== dispatchRequest.assigned_mechanic_user_id
    ) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    recipientRole = isAllowedRecipient(event);
    const nextRecipientUserId =
      recipientRole === "mechanic" ? dispatchRequest.assigned_mechanic_user_id : dispatchRequest.customer_user_id;
    if (!nextRecipientUserId) {
      return Response.json({ ok: true, delivered: false, reason: "no_recipient" });
    }
    recipientUserId = nextRecipientUserId;

    if (
      shouldSkipDispatchNotification({
        recipientUserId,
        initiatorUserId,
        actorUserId,
      })
    ) {
      return Response.json({ ok: true, delivered: false, reason: "self_notification_skipped" });
    }

    const [recipientRows, senderRows] = await Promise.all([
      supabaseRest<{
        expo_push_token: string | null;
        chat_notifications_enabled: boolean | null;
        marketing_notifications_enabled: boolean | null;
      }[]>(
        `/user_profiles?user_id=eq.${encodeURIComponent(recipientUserId)}&select=expo_push_token,chat_notifications_enabled,marketing_notifications_enabled`,
        "GET",
        serviceKey,
      ),
      supabaseRest<{
        display_name: string | null;
        full_name: string | null;
      }[]>(
        `/user_profiles?user_id=eq.${encodeURIComponent(actorUserId)}&select=display_name,full_name`,
        "GET",
        serviceKey,
      ),
    ]);

    const recipientProfile = Array.isArray(recipientRows) ? recipientRows[0] : null;
    const recipientToken = recipientProfile?.expo_push_token?.trim();
    if (!recipientToken) {
      void recordAnalyticsEvent({
        eventName: "notification_failed",
        userId: recipientUserId,
        role: recipientRole,
        properties: {
          channel: "dispatch",
          request_id: requestId,
          event,
          initiator_user_id: initiatorUserId,
          actor_user_id: actorUserId,
          recipient_user_id: recipientUserId,
          reason: "no_token",
        },
      });
      return Response.json({ ok: true, delivered: false, reason: "no_token" });
    }

    const senderProfile = Array.isArray(senderRows) ? senderRows[0] : null;
    const content = buildDispatchNotificationContent({
      event,
      requestId,
      scheduledFor: dispatchRequest.scheduled_for,
      customerName: dispatchRequest.customer_name ?? senderProfile?.full_name ?? senderProfile?.display_name ?? null,
      mechanicName: dispatchRequest.assigned_mechanic_name ?? senderProfile?.full_name ?? senderProfile?.display_name ?? null,
      serviceCode: dispatchRequest.service_code,
    });

    await sendExpoPush(recipientToken, content.title, content.body, {
      requestId,
      service_request_id: requestId,
      route: content.route,
      event,
      actionType: event === "customer_accepted_quote" ? "customer_service_offer" : undefined,
      actorUserId,
      recipientUserId,
      status: dispatchRequest.status,
      isBooked: deriveBookedMeta(dispatchRequest.scheduled_for, dispatchRequest.customer_note).isBooked,
    });

    return Response.json({ ok: true, delivered: true });
  } catch (error) {
    console.error("[dispatch-notify] Error:", error);
    void recordAnalyticsEvent({
      eventName: "notification_failed",
      userId: recipientUserId || null,
      role: recipientRole,
      properties: {
        channel: "dispatch",
        request_id: requestId,
        event,
        initiator_user_id: initiatorUserId || null,
        actor_user_id: actorUserId || null,
        recipient_user_id: recipientUserId || null,
        reason: "send_failed",
      },
    });
    return Response.json({ ok: true, delivered: false, error: "Notification delivery failed" });
  }
}
