import { describe, it, expect } from "vitest";
import { reducer, initialState } from "../store-reducer";
import type { MechanicJob } from "../types";

function makeJob(overrides: Partial<MechanicJob> = {}): MechanicJob {
  return {
    id: "mj_1",
    customerName: "Test Cust",
    vehicle: "2020 Honda Civic",
    service: "oil_change",
    location: "100 Main St",
    distanceMiles: 1.2,
    payout: 75,
    status: "pending",
    receivedAt: 1,
    ...overrides,
  };
}

describe("mechanic reducer", () => {
  it("SET_ROLE switches role", () => {
    const next = reducer(initialState, { type: "SET_ROLE", payload: "mechanic" });
    expect(next.role).toBe("mechanic");
  });

  it("SET_MECHANIC_ONLINE toggles", () => {
    const next = reducer(initialState, { type: "SET_MECHANIC_ONLINE", payload: true });
    expect(next.mechanicOnline).toBe(true);
  });

  it("ADD_MECHANIC_JOB prepends incoming job", () => {
    const next = reducer(initialState, { type: "ADD_MECHANIC_JOB", payload: makeJob() });
    expect(next.mechanicJobs).toHaveLength(1);
    expect(next.mechanicJobs[0].id).toBe("mj_1");
    // Pending jobs do NOT immediately become active; only acceptance does.
    expect(next.mechanicActiveJobId).toBeNull();
  });

  it("Accepting a job (heading_there) sets it active and stamps acceptedAt", () => {
    const s1 = reducer(initialState, { type: "ADD_MECHANIC_JOB", payload: makeJob() });
    const s2 = reducer(s1, {
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: "mj_1", status: "heading_there" },
    });
    expect(s2.mechanicActiveJobId).toBe("mj_1");
    const job = s2.mechanicJobs.find((j) => j.id === "mj_1")!;
    expect(job.status).toBe("heading_there");
    expect(job.acceptedAt).toBeDefined();
  });

  it("Completing a mechanic job clears active and stamps completedAt", () => {
    const s1 = reducer(initialState, { type: "ADD_MECHANIC_JOB", payload: makeJob() });
    const s2 = reducer(s1, {
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: "mj_1", status: "heading_there" },
    });
    const s3 = reducer(s2, {
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: "mj_1", status: "completed" },
    });
    expect(s3.mechanicActiveJobId).toBeNull();
    const job = s3.mechanicJobs.find((j) => j.id === "mj_1")!;
    expect(job.status).toBe("completed");
    expect(job.completedAt).toBeDefined();
  });

  it("Declining a job marks declined and does not become active", () => {
    const s1 = reducer(initialState, { type: "ADD_MECHANIC_JOB", payload: makeJob() });
    const s2 = reducer(s1, {
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: "mj_1", status: "declined" },
    });
    expect(s2.mechanicActiveJobId).toBeNull();
    expect(s2.mechanicJobs[0].status).toBe("declined");
  });

  it("Cancelling the active job clears active", () => {
    const s1 = reducer(initialState, { type: "ADD_MECHANIC_JOB", payload: makeJob() });
    const s2 = reducer(s1, {
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: "mj_1", status: "heading_there" },
    });
    expect(s2.mechanicActiveJobId).toBe("mj_1");
    const s3 = reducer(s2, {
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: "mj_1", status: "cancelled" },
    });
    expect(s3.mechanicActiveJobId).toBeNull();
  });
});
