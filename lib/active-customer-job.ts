import { findBlockingCustomerJob } from "./active-customer-job-core";
import type { Job } from "./types";
import { updateDispatchStatus } from "./live-dispatch";

export { ACTIVE_CUSTOMER_JOB_STATUSES, findBlockingCustomerJob } from "./active-customer-job-core";

export async function cancelBlockingCustomerRequest(
  token: string,
  job: Job,
  customerUserId: string,
): Promise<boolean> {
  if (!job.remoteRequestId) return true;
  const result = await updateDispatchStatus(token, job.remoteRequestId, "cancelled", {
    cancelReason: "Replaced by newer booking",
    cancelledByRole: "customer",
    cancelledByUserId: customerUserId,
  });
  return result.ok;
}