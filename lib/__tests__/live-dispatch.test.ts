import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectOnlineMechanicsForRegion, setMechanicPresence } from "../live-dispatch";

const mocks = vi.hoisted(() => ({
  ensureValidAccessTokenMock: vi.fn(),
  getApiUrlMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/lib/profile-session", () => ({
  ensureValidAccessToken: mocks.ensureValidAccessTokenMock,
}));

vi.mock("@/lib/api-base-url", () => ({
  getApiUrl: mocks.getApiUrlMock,
}));

describe("setMechanicPresence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureValidAccessTokenMock.mockResolvedValue("access-token");
    mocks.getApiUrlMock.mockImplementation((path: string) => `https://api.test${path}`);
    vi.stubGlobal("fetch", mocks.fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fall back to direct rest when the api rejects with 403", async () => {
    mocks.fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: "Forbidden" }),
    });

    const result = await setMechanicPresence("session-token", "mechanic-1", "Mike", true, "US");

    expect(result).toBe(false);
    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMock).toHaveBeenCalledWith(
      "https://api.test/api/mechanic-presence",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});

describe("selectOnlineMechanicsForRegion", () => {
  it("prefers exact region matches and falls back to legacy regionless mechanics", () => {
    const rows = [
      { mechanic_user_id: "us-1", mechanic_name: "US", is_online: true, region_code: "US" as const },
      { mechanic_user_id: "mx-1", mechanic_name: "MX", is_online: true, region_code: "MX" as const },
      { mechanic_user_id: "legacy-1", mechanic_name: "Legacy", is_online: true, region_code: null },
    ];

    expect(selectOnlineMechanicsForRegion(rows, "MX")).toEqual([
      { mechanic_user_id: "mx-1", mechanic_name: "MX", is_online: true, region_code: "MX" },
    ]);
    expect(selectOnlineMechanicsForRegion(rows, "US")).toEqual([
      { mechanic_user_id: "us-1", mechanic_name: "US", is_online: true, region_code: "US" },
    ]);
    expect(
      selectOnlineMechanicsForRegion(
        [{ mechanic_user_id: "legacy-1", mechanic_name: "Legacy", is_online: true, region_code: null }],
        "MX",
      ),
    ).toEqual([
      { mechanic_user_id: "legacy-1", mechanic_name: "Legacy", is_online: true, region_code: null },
    ]);
  });
});
