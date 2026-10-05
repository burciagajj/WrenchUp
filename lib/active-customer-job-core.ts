import type { Job, JobStatus } from "./types";

export const ACTIVE_CUSTOMER_JOB_STATUSES: JobStatus[] = [
  "searching",
  "accepted",
  "enroute",
  "arrived",
  "in_progress",
];

export function findBlockingCustomerJob(jobs: Job[], activeJobId: string | null): Job | null {
  if (activeJobId) {
    const active = jobs.find((job) => job.id === activeJobId);
    if (active && ACTIVE_CUSTOMER_JOB_STATUSES.includes(active.status)) {
      return active;
    }
  }
  return jobs.find((job) => ACTIVE_CUSTOMER_JOB_STATUSES.includes(job.status)) ?? null;
}