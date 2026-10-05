import { describe, expect, it } from "vitest";
import { findBlockingCustomerJob } from "../active-customer-job-core";
import type { Job } from "../types";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "j1",
    mechanicId: "unassigned",
    vehicleId: "v1",
    service: "diagnostic",
    location: "El Paso, TX",
    status: "searching",
    createdAt: 1,
    fare: { service: 2, bookingFee: 4, total: 6 },
    ...overrides,
  };
}

describe("findBlockingCustomerJob", () => {
  it("returns the active non-terminal job when activeJobId points at it", () => {
    const job = makeJob({ id: "active-1", status: "enroute" });
    const found = findBlockingCustomerJob([job], "active-1");
    expect(found?.id).toBe("active-1");
  });

  it("ignores completed and cancelled jobs", () => {
    const jobs = [
      makeJob({ id: "done", status: "completed" }),
      makeJob({ id: "old", status: "cancelled" }),
    ];
    expect(findBlockingCustomerJob(jobs, "done")).toBeNull();
    expect(findBlockingCustomerJob(jobs, null)).toBeNull();
  });

  it("falls back to any in-progress job when activeJobId is stale", () => {
    const blocking = makeJob({ id: "searching-1", status: "searching" });
    const found = findBlockingCustomerJob([blocking], null);
    expect(found?.id).toBe("searching-1");
  });
});