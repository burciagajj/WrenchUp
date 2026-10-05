import { describe, expect, it } from "vitest";
import { reducer, initialState } from "../store-reducer";
import { buildMechanicJobFromDispatchRequest } from "../mechanic-dispatch-job";
import { generateMechanicJob } from "../mechanic-sim";
import type { DispatchRequest } from "../live-dispatch";
import type { Job, MechanicJob } from "../types";

const baseDispatchRequest: DispatchRequest = {
  id: "req-flow-1",
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

function makeCustomerJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "j_flow_1",
    mechanicId: "unassigned",
    vehicleId: "v_default",
    service: "diagnostic",
    location: "El Paso, TX",
    status: "searching",
    createdAt: Date.now(),
    fare: { service: 45, bookingFee: 40, total: 85 },
    remoteRequestId: "req-flow-1",
    ...overrides,
  };
}

describe("job flow simulation", () => {
  it("simulates customer booking through completion", () => {
    let state = reducer(initialState, { type: "CREATE_JOB", payload: makeCustomerJob() });
    expect(state.activeJobId).toBe("j_flow_1");

    const statuses = ["accepted", "enroute", "arrived", "in_progress", "completed"] as const;
    for (const status of statuses) {
      state = reducer(state, { type: "UPDATE_JOB_STATUS", payload: { id: "j_flow_1", status } });
      expect(state.jobs[0].status).toBe(status);
    }
    expect(state.activeJobId).toBeNull();

    state = reducer(state, {
      type: "COMPLETE_JOB",
      payload: { id: "j_flow_1", rating: 5, tip: 10, ratingComment: "Great" },
    });
    const completed = state.jobs.find((j) => j.id === "j_flow_1")!;
    expect(completed.rating).toBe(5);
    expect(completed.tip).toBe(10);
  });

  it("simulates mechanic accept through completion from dispatch row", () => {
    const mechanicJob = buildMechanicJobFromDispatchRequest(baseDispatchRequest);
    let state = reducer(initialState, { type: "ADD_MECHANIC_JOB", payload: mechanicJob });
    expect(state.mechanicJobs[0].status).toBe("pending");

    const mechanicStatuses = ["heading_there", "arrived", "in_progress", "completed"] as const;
    for (const status of mechanicStatuses) {
      state = reducer(state, {
        type: "UPDATE_MECHANIC_JOB_STATUS",
        payload: { id: mechanicJob.id, status },
      });
      expect(state.mechanicJobs.find((j) => j.id === mechanicJob.id)?.status).toBe(status);
    }
    expect(state.mechanicActiveJobId).toBeNull();
  });

  it("simulates local mechanic job generation and full progression", () => {
    const generated: MechanicJob = generateMechanicJob({ latitude: 31.76, longitude: -106.48 });
    expect(generated.status).toBe("pending");
    expect(generated.pickup).toBeDefined();
    expect(generated.mechanicStart).toBeDefined();

    let state = reducer(initialState, { type: "ADD_MECHANIC_JOB", payload: generated });
    state = reducer(state, {
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: generated.id, status: "heading_there" },
    });
    state = reducer(state, {
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: generated.id, status: "arrived" },
    });
    state = reducer(state, {
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: generated.id, status: "in_progress" },
    });
    state = reducer(state, {
      type: "UPDATE_MECHANIC_JOB_STATUS",
      payload: { id: generated.id, status: "completed" },
    });

    const done = state.mechanicJobs.find((j) => j.id === generated.id)!;
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBeDefined();
  });
});