import { describe, expect, it } from "vitest";
import { computeMechanicMetrics } from "@/lib/mechanic-metrics";
import type { MechanicJob } from "@/lib/types";

function job(status: MechanicJob["status"]): MechanicJob {
  return { status } as MechanicJob;
}

describe("computeMechanicMetrics", () => {
  it("reports 0% cancellation rate for a mechanic with no accepted jobs", () => {
    const metrics = computeMechanicMetrics([]);
    expect(metrics.cancellationRate).toBe(0);
  });

  it("reports 0% cancellation rate for a spotless mechanic (previously showed 100%)", () => {
    const jobs = [job("completed"), job("completed"), job("completed")];
    const metrics = computeMechanicMetrics(jobs);
    expect(metrics.cancellationRate).toBe(0);
  });

  it("computes cancellation rate as cancelled / accepted, not retention", () => {
    const jobs = [job("completed"), job("completed"), job("cancelled")];
    const metrics = computeMechanicMetrics(jobs);
    // 1 cancelled out of 3 accepted => 33%, not 67% (which retention would give)
    expect(metrics.cancellationRate).toBe(33);
  });

  it("reports 100% cancellation rate when every accepted job was cancelled", () => {
    const jobs = [job("cancelled"), job("cancelled")];
    const metrics = computeMechanicMetrics(jobs);
    expect(metrics.cancellationRate).toBe(100);
  });
});
