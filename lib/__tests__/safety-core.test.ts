import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canMechanicSeeExactCustomerLocation,
  paymentStateAfterDisputeCheck,
  toLocationArea,
} from "@/lib/safety-core";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("safety core", () => {
  it("does not reveal exact customer location to unassigned mechanics", () => {
    expect(
      canMechanicSeeExactCustomerLocation(
        { status: "searching", assignedMechanicUserId: null, mechanicAcceptedAt: null },
        "mech_1",
      ),
    ).toBe(false);
  });

  it("reveals exact customer location only after accepted assignment", () => {
    expect(
      canMechanicSeeExactCustomerLocation(
        { status: "searching", assignedMechanicUserId: "mech_1", mechanicAcceptedAt: null },
        "mech_1",
      ),
    ).toBe(false);
    expect(
      canMechanicSeeExactCustomerLocation(
        { status: "accepted", assignedMechanicUserId: "mech_1", mechanicAcceptedAt: "2026-06-10T12:00:00Z" },
        "mech_1",
      ),
    ).toBe(true);
  });

  it("shows an area label instead of a street address before mechanic acceptance", () => {
    expect(toLocationArea("3801 Alameda Avenue, El Paso, Texas")).toBe("El Paso, Texas");
  });

  it("blocks payout release when an open dispute exists", () => {
    expect(paymentStateAfterDisputeCheck("ready_for_release", true)).toBe("dispute_hold");
    expect(paymentStateAfterDisputeCheck("ready_for_release", false)).toBe("ready_for_release");
  });
});

describe("safety migrations", () => {
  it("persists safety reports and disputes with RLS enabled", () => {
    const migration = readFileSync(join(repoRoot, "supabase/migrations/015_safety_disputes.sql"), "utf8");
    expect(migration).toContain("create table if not exists public.service_disputes");
    expect(migration).toContain("create table if not exists public.safety_reports");
    expect(migration).toContain("alter table public.service_disputes enable row level security");
    expect(migration).toContain("alter table public.safety_reports enable row level security");
  });

  it("tightens service request RLS so unassigned mechanics cannot read exact locations", () => {
    const migration = readFileSync(join(repoRoot, "supabase/migrations/015_safety_disputes.sql"), "utf8");
    expect(migration).toContain('drop policy if exists "service_requests_read_related"');
    expect(migration).toContain('drop policy if exists "service_requests_mechanic_update"');
    expect(migration).toContain("auth.uid() = assigned_mechanic_user_id");
    expect(migration).not.toContain("or (status = 'searching' and public.is_mechanic())");
    expect(migration).not.toContain("assigned_mechanic_user_id is null or auth.uid() = assigned_mechanic_user_id");
  });

  it("keeps mechanic documents private from customers", () => {
    const migration = readFileSync(join(repoRoot, "supabase/migrations/009_mechanic_documents_bucket.sql"), "utf8");
    expect(migration).toContain("'mechanic-documents'");
    expect(migration).toContain("false");
    expect(migration).not.toContain("public_read");
  });
});
