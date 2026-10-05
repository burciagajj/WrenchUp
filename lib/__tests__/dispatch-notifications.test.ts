import { describe, expect, it } from "vitest";
import {
  buildDispatchNotificationContent,
  buildDispatchNotificationRoute,
  shouldSkipDispatchNotification,
} from "../dispatch-notifications-core";

describe("dispatch notifications", () => {
  it("routes a new request to mechanic incoming for immediate jobs", () => {
    expect(
      buildDispatchNotificationRoute({
        event: "new_service_request",
        requestId: "req_1",
      }),
    ).toBe("/mechanic/incoming?id=req_1");
  });

  it("routes a booked request to mechanic booked details", () => {
    expect(
      buildDispatchNotificationRoute({
        event: "new_service_request",
        requestId: "req_2",
        scheduledFor: "2026-06-10T12:00:00.000Z",
      }),
    ).toBe("/mechanic/booked?id=req_2");
  });

  it("builds customer-facing offer and acceptance copy", () => {
    const offer = buildDispatchNotificationContent({
      event: "mechanic_matched",
      requestId: "req_3",
      customerName: "Taylor Swift",
      mechanicName: "Johan Perez",
      serviceCode: "battery_jump",
    });
    expect(offer.title).toBe("Mechanic matched");
    expect(offer.body).toBe("Johan has been matched to your request.");
    expect(offer.route).toBe("/request-pending");

    const sent = buildDispatchNotificationContent({
      event: "mechanic_offer_sent",
      requestId: "req_3",
      customerName: "Taylor Swift",
      mechanicName: "Johan Perez",
      serviceCode: "battery_jump",
    });
    expect(sent.title).toBe("New offer");
    expect(sent.body).toBe("Johan sent you an offer.");
    expect(sent.route).toBe("/mechanic-offers");

    const accepted = buildDispatchNotificationContent({
      event: "mechanic_accepted_request",
      requestId: "req_3",
      customerName: "Taylor Swift",
      mechanicName: "Johan Perez",
      serviceCode: "battery_jump",
    });
    expect(accepted.body).toBe("Johan has accepted your request.");
    expect(accepted.route).toBe("/tracking");
  });

  it("builds mechanic and completion copy", () => {
    const quote = buildDispatchNotificationContent({
      event: "customer_accepted_quote",
      requestId: "req_4",
      customerName: "Taylor Swift",
      mechanicName: "Johan Perez",
      serviceCode: "oil_change",
    });
    expect(quote.title).toBe("Service offered");
    expect(quote.body).toBe("Taylor Swift has offered you their requested service, accept or decline");
    expect(quote.route).toBe("/mechanic/incoming?id=req_4");

    const completed = buildDispatchNotificationContent({
      event: "job_completed",
      requestId: "req_4",
      customerName: "Taylor Swift",
      mechanicName: "Johan Perez",
      serviceCode: "oil_change",
    });
    expect(completed.body).toContain("marked the job complete");
    expect(completed.route).toBe("/tracking");
  });

  it("skips notifications for the user who triggered the event", () => {
    expect(
      shouldSkipDispatchNotification({
        recipientUserId: "user-1",
        initiatorUserId: "user-1",
        actorUserId: "user-2",
      }),
    ).toBe(true);

    expect(
      shouldSkipDispatchNotification({
        recipientUserId: "user-2",
        initiatorUserId: "user-1",
        actorUserId: "user-2",
      }),
    ).toBe(true);

    expect(
      shouldSkipDispatchNotification({
        recipientUserId: "user-1",
        initiatorUserId: "user-2",
        actorUserId: "user-3",
      }),
    ).toBe(false);
  });

  it("routes mechanic cancellation to customer home or booked tab", () => {
    expect(
      buildDispatchNotificationRoute({
        event: "job_cancelled_by_mechanic",
        requestId: "req_cancel",
        scheduledFor: "2026-06-10T12:00:00.000Z",
      }),
    ).toBe("/(tabs)/booked-requests");

    expect(
      buildDispatchNotificationContent({
        event: "job_cancelled_by_mechanic",
        requestId: "req_cancel",
        mechanicName: "Mike",
        serviceCode: "diagnostic",
        scheduledFor: null,
      }).title,
    ).toBe("Service cancelled");
  });

  it("routes customer cancellation to mechanic tabs", () => {
    expect(
      buildDispatchNotificationRoute({
        event: "job_cancelled_by_customer",
        requestId: "req_cancel",
      }),
    ).toBe("/(tabs)");

    const content = buildDispatchNotificationContent({
      event: "job_cancelled_by_customer",
      requestId: "req_cancel",
      customerName: "Alex",
      serviceCode: "oil_change",
    });
    expect(content.body).toContain("Alex");
  });
});
