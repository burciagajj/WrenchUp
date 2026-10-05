import type { Job, JobStatus } from "@/lib/types";

const TERMINAL_JOB_STATUSES: JobStatus[] = ["completed", "cancelled"];

/** True if any non-terminal (active/upcoming) job still references this vehicle. */
export function isVehicleReferencedByActiveJob(
  vehicleId: string,
  jobs: Pick<Job, "vehicleId" | "status">[],
): boolean {
  return jobs.some(
    (job) => job.vehicleId === vehicleId && !TERMINAL_JOB_STATUSES.includes(job.status),
  );
}
