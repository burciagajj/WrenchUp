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
  const cancellationRate = accepted === 0 ? 100 : toPercent(((accepted - cancelled) / accepted) * 100);
  const completionRate = accepted === 0 ? 100 : toPercent((completed / accepted) * 100);

  return { acceptanceRate, cancellationRate, completionRate };
}
