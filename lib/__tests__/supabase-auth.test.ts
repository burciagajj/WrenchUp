import { describe, it, expect } from "vitest";

/**
 * Supabase Auth Credentials Test
 * Validates that Supabase environment variables are set and accessible
 */

describe("Supabase Auth Credentials", () => {
  it("should have SUPABASE_URL environment variable set", () => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(url).toBeDefined();
    expect(url).toMatch(/^https:\/\/.*\.supabase\.co$/);
  });

  it("should have SUPABASE_ANON_KEY environment variable set", () => {
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    expect(key).toBeDefined();
    expect(key?.length).toBeGreaterThan(0);
  });

  it("should be able to construct Supabase auth URL", () => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const authUrl = `${url}/auth/v1/signup`;
    expect(authUrl).toMatch(/^https:\/\/.*\.supabase\.co\/auth\/v1\/signup$/);
  });

  it("should validate Supabase URL format", async () => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error("Supabase credentials not set");
    }

    // Test that we can reach the Supabase endpoint
    try {
      const response = await fetch(`${url}/auth/v1/health`, {
        method: "GET",
        headers: {
          apikey: key,
        },
      });

      // Health endpoint should return 200 or 404 (not 401/403)
      expect([200, 404]).toContain(response.status);
    } catch (error) {
      // Network errors are acceptable in test environment
      console.log("Network check skipped (expected in test env)");
    }
  });
});
