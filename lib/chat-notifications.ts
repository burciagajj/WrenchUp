import { getApiUrl } from "@/lib/api-base-url";
import {
  buildChatNotificationBody,
  buildChatNotificationRoute,
  type ChatPushRequest,
  type ChatRecipientRole,
} from "@/lib/chat-notifications-core";

export { buildChatNotificationBody, buildChatNotificationRoute };
export type { ChatPushRequest, ChatRecipientRole };

export async function notifyChatRecipient(input: ChatPushRequest): Promise<boolean> {
  if (!input.sessionToken || !input.requestId || !input.senderUserId || !input.message.trim()) {
    return false;
  }
  try {
    const res = await fetch(getApiUrl("/api/chat-notify"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.sessionToken}`,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("[chat-notifications] Push notification request failed:", text || res.statusText);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[chat-notifications] Push notification request failed:", error);
    return false;
  }
}
