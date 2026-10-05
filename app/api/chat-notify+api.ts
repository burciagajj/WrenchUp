import { buildChatNotificationBody, buildChatNotificationRoute } from "@/lib/chat-notifications";
import {
  getCurrentUserId,
  getNotificationServiceConfig,
  sendExpoPush,
  supabaseRest,
} from "@/lib/notification-service";
import { recordAnalyticsEvent } from "@/lib/analytics-service";

type ChatPushRole = "customer" | "mechanic";

function normalizeName(profile: { display_name?: string | null; full_name?: string | null }, fallback: string): string {
  const raw = profile.display_name?.trim() || profile.full_name?.trim() || fallback;
  return raw.split(/\s+/)[0] || fallback;
}

export async function POST(request: Request) {
  let requestId = "";
  let senderUserId = "";
  let senderRole: ChatPushRole | undefined;
  let recipientUserId = "";
  let recipientRole: ChatPushRole | null = null;
  try {
    const authHeader = request.headers.get("authorization") || "";
    const sessionToken = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!sessionToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    requestId = String(body?.requestId || "");
    senderUserId = String(body?.senderUserId || "");
    senderRole = body?.senderRole as ChatPushRole | undefined;
    const message = String(body?.message || "").trim();

    if (!requestId || !senderUserId || (senderRole !== "customer" && senderRole !== "mechanic") || !message) {
      return Response.json({ error: "requestId, senderUserId, senderRole, and message are required" }, { status: 400 });
    }

    const { supabaseUrl, serviceKey } = getNotificationServiceConfig();
    if (!supabaseUrl || !serviceKey) {
      return Response.json({ error: "Notification service unavailable" }, { status: 503 });
    }

    const currentUserId = await getCurrentUserId(supabaseUrl, serviceKey, sessionToken);
    if (!currentUserId || currentUserId !== senderUserId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requestRows = await supabaseRest<{
      id: string;
      customer_user_id: string;
      assigned_mechanic_user_id: string | null;
      customer_name: string | null;
      assigned_mechanic_name: string | null;
    }[]>(
      `/service_requests?id=eq.${encodeURIComponent(requestId)}&select=id,customer_user_id,assigned_mechanic_user_id,customer_name,assigned_mechanic_name`,
      "GET",
      serviceKey,
    );
    const dispatchRequest = Array.isArray(requestRows) ? requestRows[0] : null;
    if (!dispatchRequest) {
      return Response.json({ ok: true, delivered: false, reason: "request_not_found" });
    }

    // The sender-identity check above only proves the caller isn't lying
    // about who they are — it doesn't prove they're actually a party to
    // *this* request. Without this, anyone who learns a requestId they
    // aren't part of (mechanics see other people's open requests via normal
    // polling before being matched) could push arbitrary message text as a
    // spoofed chat notification to that job's real customer or mechanic.
    if (
      currentUserId !== dispatchRequest.customer_user_id &&
      currentUserId !== dispatchRequest.assigned_mechanic_user_id
    ) {
      return Response.json({ error: "Unauthorized" }, { status: 403 });
    }

    const nextRecipientUserId = senderRole === "customer"
      ? dispatchRequest.assigned_mechanic_user_id
      : dispatchRequest.customer_user_id;
    if (!nextRecipientUserId) {
      return Response.json({ ok: true, delivered: false, reason: "no_recipient" });
    }
    recipientUserId = nextRecipientUserId;
    recipientRole = senderRole === "customer" ? "mechanic" : "customer";

    const [recipientRows, senderRows] = await Promise.all([
      supabaseRest<{
        expo_push_token: string | null;
        chat_notifications_enabled: boolean | null;
      }[]>(
        `/user_profiles?user_id=eq.${encodeURIComponent(recipientUserId)}&select=expo_push_token,chat_notifications_enabled`,
        "GET",
        serviceKey,
      ),
      supabaseRest<{ display_name: string | null; full_name: string | null }[]>(
        `/user_profiles?user_id=eq.${encodeURIComponent(senderUserId)}&select=display_name,full_name`,
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
          channel: "chat",
          request_id: requestId,
          sender_user_id: senderUserId,
          recipient_user_id: recipientUserId,
          reason: "no_token",
        },
      });
      return Response.json({ ok: true, delivered: false, reason: "no_token" });
    }
    if (recipientProfile?.chat_notifications_enabled === false) {
      void recordAnalyticsEvent({
        eventName: "notification_failed",
        userId: recipientUserId,
        role: recipientRole,
        properties: {
          channel: "chat",
          request_id: requestId,
          sender_user_id: senderUserId,
          recipient_user_id: recipientUserId,
          reason: "muted_chat",
        },
      });
      return Response.json({ ok: true, delivered: false, reason: "muted_chat" });
    }

    const senderProfile = Array.isArray(senderRows) ? senderRows[0] : null;
    const peerName = normalizeName(
      senderProfile ?? {},
      senderRole === "customer" ? "Customer" : "Mechanic",
    );
    const route = buildChatNotificationRoute(requestId, peerName);
    // The client sends the raw text it typed, so redact it with the same
    // database function the service_messages trigger uses (migration 054)
    // before it reaches the push preview. If that fails, don't leak the raw
    // text — fall back to a generic preview.
    const redacted = await supabaseRest<string>("/rpc/redact_contact_info", "POST", serviceKey, {
      p_text: message,
    }).catch(() => null);
    const preview = typeof redacted === "string"
      ? buildChatNotificationBody(redacted)
      : "New message";

    await sendExpoPush(recipientToken, "New Message", preview, {
      service_request_id: requestId,
      job_id: requestId,
      route,
      requestId,
      peerName,
      senderUserId,
      senderRole,
    });

    return Response.json({ ok: true, delivered: true });
  } catch (error) {
    console.error("[chat-notify] Error:", error);
    void recordAnalyticsEvent({
      eventName: "notification_failed",
      userId: recipientUserId || null,
      role: recipientRole,
      properties: {
        channel: "chat",
        request_id: requestId,
        sender_user_id: senderUserId || null,
        recipient_user_id: recipientUserId || null,
        reason: "send_failed",
      },
    });
    return Response.json({ ok: true, delivered: false, error: "Notification delivery failed" });
  }
}
