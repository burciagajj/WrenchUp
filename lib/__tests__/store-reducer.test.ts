import { describe, it, expect } from "vitest";
import { reducer, initialState } from "../store-reducer";
import type { Job, Vehicle } from "../types";

describe("reducer", () => {
  it("HYDRATE merges partial state and marks hydrated", () => {
    const next = reducer(initialState, { type: "HYDRATE", payload: { userName: "Sam" } });
    expect(next.hydrated).toBe(true);
    expect(next.userName).toBe("Sam");
    expect(next.vehicles).toEqual(initialState.vehicles);
  });

  it("ADD_VEHICLE appends and selects when none selected", () => {
    const empty = { ...initialState, vehicles: [], selectedVehicleId: null };
    const v: Vehicle = {
      id: "v1",
      nickname: "Wagon",
      year: 2022,
      make: "Subaru",
      model: "Outback",
      color: "Green",
      plate: "ABC123",
    };
    const next = reducer(empty, { type: "ADD_VEHICLE", payload: v });
    expect(next.vehicles).toHaveLength(1);
    expect(next.selectedVehicleId).toBe("v1");
  });

  it("UPDATE_VEHICLE replaces existing vehicle", () => {
    const v = initialState.vehicles[0];
    const updated: Vehicle = { ...v, nickname: "Renamed" };
    const next = reducer(initialState, { type: "UPDATE_VEHICLE", payload: updated });
    expect(next.vehicles[0].nickname).toBe("Renamed");
  });

  it("DELETE_VEHICLE removes and reselects", () => {
    const v = initialState.vehicles[0];
    const next = reducer(initialState, { type: "DELETE_VEHICLE", payload: v.id });
    expect(next.vehicles.find((x) => x.id === v.id)).toBeUndefined();
    expect(next.selectedVehicleId).toBe(null);
  });

  it("CREATE_JOB sets active job", () => {
    const job: Job = {
      id: "j1",
      mechanicId: "m_marcus",
      vehicleId: "v_default",
      service: "oil_change",
      location: "loc",
      status: "searching",
      createdAt: 1,
      fare: { base: 1, service: 2, distance: 3, total: 6 },
    };
    const next = reducer(initialState, { type: "CREATE_JOB", payload: job });
    expect(next.activeJobId).toBe("j1");
    expect(next.jobs[0].id).toBe("j1");
  });

  it("UPDATE_JOB_STATUS clears active when completed", () => {
    const job: Job = {
      id: "j1",
      mechanicId: "m_marcus",
      vehicleId: "v_default",
      service: "oil_change",
      location: "loc",
      status: "in_progress",
      createdAt: 1,
      fare: { base: 1, service: 2, distance: 3, total: 6 },
    };
    const s1 = reducer(initialState, { type: "CREATE_JOB", payload: job });
    const s2 = reducer(s1, { type: "UPDATE_JOB_STATUS", payload: { id: "j1", status: "completed" } });
    expect(s2.activeJobId).toBe(null);
    expect(s2.jobs[0].status).toBe("completed");
  });

  it("COMPLETE_JOB records rating and tip", () => {
    const job: Job = {
      id: "j2",
      mechanicId: "m_marcus",
      vehicleId: "v_default",
      service: "oil_change",
      location: "loc",
      status: "in_progress",
      createdAt: 1,
      fare: { base: 1, service: 2, distance: 3, total: 6 },
    };
    const s1 = reducer(initialState, { type: "CREATE_JOB", payload: job });
    const s2 = reducer(s1, {
      type: "COMPLETE_JOB",
      payload: { id: "j2", rating: 5, tip: 10, ratingComment: "Great" },
    });
    const completed = s2.jobs.find((j) => j.id === "j2")!;
    expect(completed.status).toBe("completed");
    expect(completed.rating).toBe(5);
    expect(completed.tip).toBe(10);
    expect(completed.ratingComment).toBe("Great");
    expect(s2.activeJobId).toBe(null);
  });
});
