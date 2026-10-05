export type ChatRecipientRole = "customer" | "mechanic";

export type ChatPushRequest = {
  sessionToken: string;
  requestId: string;
  senderUserId: string;
  senderRole: ChatRecipientRole;
  message: string;
};

export function buildChatNotificationBody(message: string, maxLength = 80): string {
  const normalized = message.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.startsWith("OFFER_JSON:")) return "View offer and message";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function buildChatNotificationRoute(requestId: string, peerName?: string | null): string {
  const params = new URLSearchParams({ requestId });
  if (peerName?.trim()) {
    params.set("peerName", peerName.trim());
  }
  return `/messages?${params.toString()}`;
}
