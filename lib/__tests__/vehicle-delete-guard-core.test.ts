import { describe, expect, it } from "vitest";
import { isVehicleReferencedByActiveJob } from "@/lib/vehicle-delete-guard-core";

describe("isVehicleReferencedByActiveJob", () => {
  it("blocks deletion when the vehicle has a searching job", () => {
    expect(isVehicleReferencedByActiveJob("v1", [{ vehicleId: "v1", status: "searching" }])).toBe(true);
  });

  it("blocks deletion when the vehicle is in progress", () => {
    expect(isVehicleReferencedByActiveJob("v1", [{ vehicleId: "v1", status: "in_progress" }])).toBe(true);
  });

  it("allows deletion when the vehicle's only jobs are completed/cancelled", () => {
    expect(
      isVehicleReferencedByActiveJob("v1", [
        { vehicleId: "v1", status: "completed" },
        { vehicleId: "v1", status: "cancelled" },
      ]),
    ).toBe(false);
  });

  it("allows deletion when no job references the vehicle", () => {
    expect(isVehicleReferencedByActiveJob("v1", [{ vehicleId: "v2", status: "searching" }])).toBe(false);
  });

  it("allows deletion when there are no jobs at all", () => {
    expect(isVehicleReferencedByActiveJob("v1", [])).toBe(false);
  });
});
