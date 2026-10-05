import { describe, expect, it } from "vitest";
import {
  buildMechanicJobFromDispatchRequest,
  isIncomingDispatchForMechanic,
  matchesMechanicRegion,
  mechanicHasBlockingJob,
} from "../mechanic-dispatch-job";
import type { DispatchRequest } from "../live-dispatch";

const baseRequest: DispatchRequest = {
  id: "req-1",
  customer_user_id: "cust-1",
  customer_name: "Alex",
  service_code: "diagnostic",
  vehicle_label: "2018 BMW 320i",
  location_label: "El Paso, TX",
  offered_price: 85,
  currency: "USD",
  status: "searching",
  assigned_mechanic_user_id: "mech-1",
  assigned_mechanic_name: "Mike",
  receipt_number: null,
  region_code: "US",
  created_at: "2026-06-30T12:00:00.000Z",
  updated_at: "2026-06-30T12:00:00.000Z",
};

describe("mechanic dispatch job helpers", () => {
  it("matches region by region_code", () => {
    expect(matchesMechanicRegion(baseRequest, "US")).toBe(true);
    expect(matchesMechanicRegion({ ...baseRequest, region_code: "MX" }, "US")).toBe(false);
  });

  it("detects incoming assigned searching jobs", () => {
    expect(isIncomingDispatchForMechanic(baseRequest, "mech-1", "US")).toBe(true);
    expect(isIncomingDispatchForMechanic(baseRequest, "mech-2", "US")).toBe(false);
    expect(isIncomingDispatchForMechanic({ ...baseRequest, status: "accepted" }, "mech-1", "US")).toBe(false);
  });

  it("builds pending mechanic jobs from dispatch rows", () => {
    const job = buildMechanicJobFromDispatchRequest(baseRequest);
    expect(job.id).toBe("req-1");
    expect(job.vehicle).toBe("2018 BMW 320i");
    expect(job.status).toBe("pending");
    expect(job.payout).toBe(85);
  });

  it("hydrates pickup coords and distance when customer coordinates exist", () => {
    const job = buildMechanicJobFromDispatchRequest(
      {
        ...baseRequest,
        customer_latitude: 31.76,
        customer_longitude: -106.48,
      },
      { latitude: 31.77, longitude: -106.49 },
    );
    expect(job.pickup).toEqual({ latitude: 31.76, longitude: -106.48 });
    expect(job.mechanicStart).toEqual({ latitude: 31.77, longitude: -106.49 });
    expect(job.distanceMiles).toBeGreaterThan(0);
  });

  it("detects blocking active/pending jobs", () => {
    expect(mechanicHasBlockingJob([{ status: "pending" }])).toBe(true);
    expect(mechanicHasBlockingJob([{ status: "completed" }])).toBe(false);
  });
});
