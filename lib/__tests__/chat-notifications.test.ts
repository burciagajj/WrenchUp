import { describe, expect, it } from "vitest";
import { buildChatNotificationBody, buildChatNotificationRoute } from "../chat-notifications-core";

describe("chat notifications", () => {
  it("trims and truncates push body text", () => {
    expect(buildChatNotificationBody("   Hello   world   ")).toBe("Hello world");
    expect(buildChatNotificationBody("a".repeat(90))).toHaveLength(80);
  });

  it("shows a clean preview for offer payload messages", () => {
    expect(buildChatNotificationBody('OFFER_JSON:{"kind":"mechanic_offer"}')).toBe("View offer and message");
  });

  it("builds a chat route with request id and peer name", () => {
    expect(buildChatNotificationRoute("req-1", "Johan")).toBe("/messages?requestId=req-1&peerName=Johan");
  });
});
