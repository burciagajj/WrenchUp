import { describe, expect, it } from "vitest";
import { parseMechanicOfferMessage } from "../mechanic-offer";

describe("parseMechanicOfferMessage", () => {
  it("parses mechanic offer payloads", () => {
    const offer = parseMechanicOfferMessage({
      id: "m1",
      request_id: "r1",
      sender_user_id: "u1",
      sender_role: "mechanic",
      message: 'OFFER_JSON:{"kind":"mechanic_offer","mechanic_user_id":"mec-1","mechanic_name":"Johan","proposed_total":42.5,"note":"Checking availability"}',
      created_at: "2026-06-09T18:00:00.000Z",
    });

    expect(offer).toEqual({
      mechanicUserId: "mec-1",
      mechanicName: "Johan",
      proposedTotal: 42.5,
      note: "Checking availability",
      messageId: "m1",
      createdAt: "2026-06-09T18:00:00.000Z",
    });
  });

  it("ignores non-offer messages", () => {
    expect(
      parseMechanicOfferMessage({
        id: "m2",
        request_id: "r1",
        sender_user_id: "u1",
        sender_role: "mechanic",
        message: "hello",
        created_at: "2026-06-09T18:00:00.000Z",
      }),
    ).toBeNull();
  });
});
