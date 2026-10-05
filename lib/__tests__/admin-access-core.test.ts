import { describe, expect, it } from "vitest";
import { isAdminAccess, normalizeAdminEmail } from "../admin-access-core";

describe("admin access core", () => {
  it("normalizes emails for comparison", () => {
    expect(normalizeAdminEmail(" Admin@Example.COM ")).toBe("admin@example.com");
  });

  it("role alone is not sufficient — email must also match", () => {
    expect(isAdminAccess({ role: "admin", email: "user@test.com" }, "other@test.com")).toBe(false);
  });

  it("allows configured admin email regardless of role", () => {
    expect(isAdminAccess({ role: "mechanic", email: "admin@test.com" }, "admin@test.com")).toBe(true);
  });

  it("always allows the hardcoded authorized admin email, even with no configured email and a non-admin role", () => {
    expect(isAdminAccess({ role: "mechanic", email: "jjburciagap@gmail.com" }, null)).toBe(true);
    expect(isAdminAccess({ role: "mechanic", email: "JJBurciagaP@Gmail.com" }, undefined)).toBe(true);
  });

  it("denies non-admin users", () => {
    expect(isAdminAccess({ role: "customer", email: "user@test.com" }, "admin@test.com")).toBe(false);
  });

  it("denies when profile/email is missing", () => {
    expect(isAdminAccess(null, "admin@test.com")).toBe(false);
    expect(isAdminAccess({ role: "admin", email: null }, "admin@test.com")).toBe(false);
  });
});
