import { describe, it, expect } from "vitest";
import { connectAccountCountryParams, resolveConnectAccountCountry } from "../connect-account-core";

describe("resolveConnectAccountCountry", () => {
  it("uses the region the app sends", () => {
    expect(resolveConnectAccountCountry("MX", "US")).toBe("MX");
    expect(resolveConnectAccountCountry("us", null)).toBe("US");
  });

  it("falls back to the presence region for older app builds", () => {
    expect(resolveConnectAccountCountry(undefined, "MX")).toBe("MX");
  });

  it("ignores unknown values and defaults to US", () => {
    expect(resolveConnectAccountCountry("CA", "BR")).toBe("US");
    expect(resolveConnectAccountCountry(null, undefined)).toBe("US");
    expect(resolveConnectAccountCountry(42, {})).toBe("US");
  });
});

describe("connectAccountCountryParams", () => {
  it("creates Mexican mechanics as cross-border recipients", () => {
    expect(connectAccountCountryParams("MX")).toEqual({
      country: "MX",
      "tos_acceptance[service_agreement]": "recipient",
    });
  });

  it("creates US mechanics as plain US accounts", () => {
    expect(connectAccountCountryParams("US")).toEqual({ country: "US" });
  });
});
