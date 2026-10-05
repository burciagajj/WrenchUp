import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth-context";
import type { AppState } from "@/lib/types";
import { setMechanicOnlineState } from "../mechanic-online";

const mocks = vi.hoisted(() => ({
  alertMock: vi.fn(),
  warningMock: vi.fn(),
  mediumMock: vi.fn(),
  resolveAuthSessionMock: vi.fn(),
  getOrCreateProfileMock: vi.fn(),
  setMechanicPresenceMock: vi.fn(),
  fetchLocationAndAddressMock: vi.fn(),
}));

vi.mock("react-native", () => ({
  Alert: { alert: mocks.alertMock },
}));

vi.mock("@/lib/haptics", () => ({
  haptic: {
    warning: mocks.warningMock,
    medium: mocks.mediumMock,
  },
}));

vi.mock("@/lib/resolve-auth-session", () => ({
  resolveAuthSession: mocks.resolveAuthSessionMock,
}));

vi.mock("@/lib/_core/supabase-user-data", () => ({
  supabaseUserData: {
    getOrCreateProfile: mocks.getOrCreateProfileMock,
  },
}));

vi.mock("@/lib/live-dispatch", () => ({
  setMechanicPresence: mocks.setMechanicPresenceMock,
}));

vi.mock("@/lib/location", () => ({
  fetchLocationAndAddress: mocks.fetchLocationAndAddressMock,
}));

describe("mechanic online gate", () => {
  const dispatch = vi.fn();
  const user = { id: "mechanic-1" } as AuthUser;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthSessionMock.mockResolvedValue({ sessionToken: "token", userId: "mechanic-1" });
  });

  it("shows waiting for verification before vehicle warnings when approval is pending", async () => {
    mocks.getOrCreateProfileMock.mockResolvedValue({ verification_status: "pending" });

    const result = await setMechanicOnlineState({
      user,
      state: {
        jobs: [],
        vehicles: [],
        userName: "Mike",
      } as unknown as AppState,
      dispatch,
      nextOnline: true,
      region: "US",
      labels: {
        verificationRequired: "Waiting for verification",
        verificationRequiredBody: "Your account is still under review.",
        vehicleRequired: "Vehicle documents required",
        vehicleRequiredBody: "Upload documents first.",
        suspended: "Account suspended",
        suspendedBody: "Suspended.",
        connectionIssue: "Connection issue",
        verifyFailed: "Could not verify account",
      },
    });

    expect(result).toBe(false);
    expect(mocks.alertMock).toHaveBeenCalledWith("Waiting for verification", "Your account is still under review.");
    expect(mocks.alertMock).not.toHaveBeenCalledWith(
      "Vehicle documents required",
      "Upload documents first.",
    );
    expect(mocks.setMechanicPresenceMock).not.toHaveBeenCalled();
  });

  it("still blocks online status for approved mechanics without vehicle documents", async () => {
    mocks.getOrCreateProfileMock.mockResolvedValue({ verification_status: "approved" });

    const result = await setMechanicOnlineState({
      user,
      state: {
        jobs: [],
        vehicles: [],
        userName: "Mike",
      } as unknown as AppState,
      dispatch,
      nextOnline: true,
      region: "US",
      labels: {
        verificationRequired: "Waiting for verification",
        verificationRequiredBody: "Your account is still under review.",
        vehicleRequired: "Vehicle documents required",
        vehicleRequiredBody: "Upload documents first.",
        suspended: "Account suspended",
        suspendedBody: "Suspended.",
        connectionIssue: "Connection issue",
        verifyFailed: "Could not verify account",
      },
    });

    expect(result).toBe(false);
    expect(mocks.alertMock).toHaveBeenCalledWith(
      "Vehicle documents required",
      "Upload documents first.",
    );
    expect(mocks.setMechanicPresenceMock).not.toHaveBeenCalled();
  });

  const approvedMechanicState = {
    jobs: [],
    vehicles: [{ insuranceDocUri: "a", registrationStickerUri: "b", approvalStatus: "approved" }],
    userName: "Mike",
  } as unknown as AppState;

  const labels = {
    verificationRequired: "Waiting for verification",
    verificationRequiredBody: "Your account is still under review.",
    vehicleRequired: "Vehicle documents required",
    vehicleRequiredBody: "Upload documents first.",
    suspended: "Account suspended",
    suspendedBody: "Suspended.",
    connectionIssue: "Connection issue",
    verifyFailed: "Could not verify account",
    locationRequired: "Location access required",
    locationRequiredBody: "Turn on location access.",
  };

  it("blocks going online when location access is denied", async () => {
    mocks.getOrCreateProfileMock.mockResolvedValue({ verification_status: "approved" });
    mocks.fetchLocationAndAddressMock.mockResolvedValue({ status: "denied" });

    const result = await setMechanicOnlineState({
      user,
      state: approvedMechanicState,
      dispatch,
      nextOnline: true,
      region: "US",
      labels,
    });

    expect(result).toBe(false);
    expect(mocks.alertMock).toHaveBeenCalledWith("Location access required", "Turn on location access.");
    expect(mocks.setMechanicPresenceMock).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_MECHANIC_ONLINE", payload: false });
  });

  it("proceeds to presence sync once location is granted", async () => {
    mocks.getOrCreateProfileMock.mockResolvedValue({ verification_status: "approved" });
    mocks.fetchLocationAndAddressMock.mockResolvedValue({ status: "granted", coords: { latitude: 1, longitude: 2 } });
    mocks.setMechanicPresenceMock.mockResolvedValue(true);

    const result = await setMechanicOnlineState({
      user,
      state: approvedMechanicState,
      dispatch,
      nextOnline: true,
      region: "US",
      labels,
    });

    expect(result).toBe(true);
    expect(mocks.setMechanicPresenceMock).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_MECHANIC_ONLINE", payload: true });
  });
});
