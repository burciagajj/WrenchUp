import { describe, expect, it } from "vitest";
import { buildSnapshotFromDispatchRows } from "../remote-job-history";
import type { DispatchRequest } from "../live-dispatch";

function makeRow(overrides: Partial<DispatchRequest> & Pick<DispatchRequest, "id" | "customer_user_id" | "service_code" | "vehicle_label" | "location_label" | "offered_price" | "status" | "assigned_mechanic_user_id" | "assigned_mechanic_name" | "created_at" | "updated_at">): DispatchRequest {
  return {
    currency: "USD",
    customer_name: "Customer One",
    mechanic_latitude: null,
    mechanic_longitude: null,
    mechanic_marked_done_at: null,
    customer_completed_at: null,
    payment_state: null,
    dispute_window_ends_at: null,
    funds_release_at: null,
    before_photo_url: null,
    after_photo_url: null,
    receipt_number: null,
    customer_photo_url: null,
    oil_package: null,
    scheduled_for: null,
    customer_note: null,
    customer_has_parts: null,
    issue_photo_url: null,
    platform_fee_rate: null,
    platform_fee_amount: null,
    mechanic_payout: null,
    region_code: "US",
    ...overrides,
  };
}

describe("buildSnapshotFromDispatchRows", () => {
  it("maps customer and mechanic rows into the saved history snapshot", () => {
    const rows = [
      makeRow({
        id: "cust-1",
        customer_user_id: "user-1",
        service_code: "oil_change",
        vehicle_label: "2020 Toyota Corolla",
        location_label: "123 Main St",
        offered_price: 120,
        status: "searching",
        assigned_mechanic_user_id: null,
        assigned_mechanic_name: null,
        created_at: "2026-06-01T10:00:00.000Z",
        updated_at: "2026-06-01T10:05:00.000Z",
      }),
      makeRow({
        id: "mech-1",
        customer_user_id: "user-2",
        service_code: "battery_jump",
        vehicle_label: "2018 Honda Civic",
        location_label: "456 Oak Ave",
        offered_price: 55,
        status: "accepted",
        assigned_mechanic_user_id: "user-1",
        assigned_mechanic_name: "Jordan",
        mechanic_payout: 40,
        created_at: "2026-06-01T11:00:00.000Z",
        updated_at: "2026-06-01T11:10:00.000Z",
      }),
    ];

    const snapshot = buildSnapshotFromDispatchRows(rows, { id: "user-1" }, [], null);

    expect(snapshot.jobs).toHaveLength(1);
    expect(snapshot.jobs[0]?.remoteRequestId).toBe("cust-1");
    expect(snapshot.activeJobId).toBe("remote_cust-1");

    expect(snapshot.mechanicJobs).toHaveLength(1);
    expect(snapshot.mechanicJobs[0]?.remoteRequestId).toBe("mech-1");
    expect(snapshot.mechanicActiveJobId).toBe("mech-1");
    expect(snapshot.mechanicJobs[0]?.status).toBe("heading_there");
  });

  it("treats mechanic_marked_done_at as completed for mechanic history even if status is in_progress", () => {
    const rows = [
      makeRow({
        id: "mech-done-1",
        customer_user_id: "user-2",
        service_code: "battery_jump",
        vehicle_label: "2018 Honda Civic",
        location_label: "456 Oak Ave",
        offered_price: 55,
        status: "in_progress",
        assigned_mechanic_user_id: "user-1",
        assigned_mechanic_name: "Jordan",
        mechanic_payout: 40,
        created_at: "2026-06-01T11:00:00.000Z",
        updated_at: "2026-06-01T11:30:00.000Z",
        // simulate column present on row
        mechanic_marked_done_at: "2026-06-01T11:25:00.000Z",
      } as any),
    ];

    const snapshot = buildSnapshotFromDispatchRows(rows, { id: "user-1" }, [], null);

    expect(snapshot.mechanicJobs).toHaveLength(1);
    expect(snapshot.mechanicJobs[0]?.status).toBe("completed");
    expect(snapshot.mechanicJobs[0]?.completedAt).toBeTruthy();
  });

  it("keeps a locally canceled remote request out of the active job bucket during hydration", () => {
    const rows = [
      makeRow({
        id: "cancel-me",
        customer_user_id: "user-1",
        service_code: "diagnostic",
        vehicle_label: "2020 Toyota Corolla",
        location_label: "123 Main St",
        offered_price: 85,
        status: "searching",
        assigned_mechanic_user_id: null,
        assigned_mechanic_name: null,
        created_at: "2026-06-01T10:00:00.000Z",
        updated_at: "2026-06-01T10:05:00.000Z",
      }),
    ];

    const snapshot = buildSnapshotFromDispatchRows(rows, { id: "user-1" }, [], null, ["cancel-me"]);

    expect(snapshot.jobs).toHaveLength(1);
    expect(snapshot.jobs[0]?.status).toBe("cancelled");
    expect(snapshot.activeJobId).toBeNull();
  });

  it("keeps a locally canceled mechanic request out of the mechanic active bucket during hydration", () => {
    const rows = [
      makeRow({
        id: "mech-cancel-me",
        customer_user_id: "user-2",
        service_code: "diagnostic",
        vehicle_label: "2020 Toyota Corolla",
        location_label: "123 Main St",
        offered_price: 85,
        status: "searching",
        assigned_mechanic_user_id: "user-1",
        assigned_mechanic_name: "Jordan",
        created_at: "2026-06-01T10:00:00.000Z",
        updated_at: "2026-06-01T10:05:00.000Z",
      }),
    ];

    const snapshot = buildSnapshotFromDispatchRows(rows, { id: "user-1" }, [], null, ["mech-cancel-me"]);

    expect(snapshot.mechanicJobs).toHaveLength(1);
    expect(snapshot.mechanicJobs[0]?.status).toBe("cancelled");
    expect(snapshot.mechanicActiveJobId).toBeNull();
  });
});
