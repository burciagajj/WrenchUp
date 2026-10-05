import type { MechanicJob } from "@/lib/types";

export type MechanicMetrics = {
  acceptanceRate: number;
  cancellationRate: number;
  completionRate: number;
};

function toPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function computeMechanicMetrics(jobs: MechanicJob[]): MechanicMetrics {
  const totalOffers = jobs.length;
  const accepted = jobs.filter(
    (j) =>
      j.status === "upcoming" ||
      j.status === "heading_there" ||
      j.status === "arrived" ||
      j.status === "in_progress" ||
      j.status === "completed" ||
      j.status === "cancelled",
  ).length;
  const cancelled = jobs.filter((j) => j.status === "cancelled").length;
  const completed = jobs.filter((j) => j.status === "completed").length;

  const acceptanceRate = totalOffers === 0 ? 100 : toPercent((accepted / totalOffers) * 100);
  // Cancellation rate: share of accepted jobs the mechanic cancelled. 0 (not
  // 100) when there's nothing to divide by — a mechanic with no accepted
  // jobs yet hasn't cancelled anything, so this should read as a clean
  // slate, not the worst possible score. This was previously inverted
  // (computing retention — the % of accepted jobs NOT cancelled — and
  // labeling it "cancellation rate"), so a spotless mechanic saw 100% in red.
  const cancellationRate = accepted === 0 ? 0 : toPercent((cancelled / accepted) * 100);
  const completionRate = accepted === 0 ? 100 : toPercent((completed / accepted) * 100);

  return { acceptanceRate, cancellationRate, completionRate };
}
