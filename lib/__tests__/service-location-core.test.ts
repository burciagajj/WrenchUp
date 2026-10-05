import { describe, it, expect } from "vitest";
import {
  chooseRequestLocation,
  isDifferentAddress,
  isValidCoords,
  REQUEST_GPS_MAX_AGE_MS,
} from "../service-location-core";

const home = { latitude: 31.76, longitude: -106.48 };
const roadside = { latitude: 31.8, longitude: -106.4 };
const chosen = { latitude: 31.7, longitude: -106.3 };
const now = 10_000_000;

describe("chooseRequestLocation", () => {
  it("prefers an address the customer chose", () => {
    expect(
      chooseRequestLocation({ chosenAddressCoords: chosen, freshGps: roadside, cachedGps: home, cachedGpsAt: now, now }),
    ).toEqual({ coords: chosen, source: "chosen_address" });
  });

  it("uses a fresh GPS fix over the cached one", () => {
    expect(
      chooseRequestLocation({ chosenAddressCoords: null, freshGps: roadside, cachedGps: home, cachedGpsAt: now, now }),
    ).toEqual({ coords: roadside, source: "gps" });
  });

  it("falls back to the cached fix only if it is recent", () => {
    expect(
      chooseRequestLocation({ chosenAddressCoords: null, freshGps: null, cachedGps: home, cachedGpsAt: now - 30_000, now }),
    ).toEqual({ coords: home, source: "recent_gps" });
  });

  it("refuses a stale cached fix (the old 'first app launch' location)", () => {
    expect(
      chooseRequestLocation({
        chosenAddressCoords: null,
        freshGps: null,
        cachedGps: home,
        cachedGpsAt: now - REQUEST_GPS_MAX_AGE_MS - 1,
        now,
      }),
    ).toBeNull();
    expect(
      chooseRequestLocation({ chosenAddressCoords: null, freshGps: null, cachedGps: home, cachedGpsAt: null, now }),
    ).toBeNull();
  });
});

describe("isValidCoords", () => {
  it("rejects missing, out-of-range and null-island coordinates", () => {
    expect(isValidCoords(home)).toBe(true);
    expect(isValidCoords(null)).toBe(false);
    expect(isValidCoords({ latitude: 0, longitude: 0 })).toBe(false);
    expect(isValidCoords({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidCoords({ latitude: Number.NaN, longitude: 1 })).toBe(false);
  });
});

describe("isDifferentAddress", () => {
  it("ignores case and spacing", () => {
    expect(isDifferentAddress("  123 Main St,  El Paso ", "123 main st, el paso")).toBe(false);
    expect(isDifferentAddress("456 Oak Ave", "123 Main St")).toBe(true);
  });
});
