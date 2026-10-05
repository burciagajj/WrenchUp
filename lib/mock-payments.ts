export type MockPaymentsRuntime = {
  isDev?: boolean;
  appOwnership?: string | null;
  platform?: string;
  mockPaymentsFlag?: string | null;
};

/** Returns true when mock payments should be used instead of live Stripe UI. */
export function shouldUseMockPayments(runtime: MockPaymentsRuntime = {}): boolean {
  const globalIsDev = typeof __DEV__ !== "undefined" ? __DEV__ : false;
  const isDev = runtime.isDev ?? globalIsDev;
  if (!isDev) return false;

  const mockPaymentsFlag = runtime.mockPaymentsFlag ?? "";
  if (mockPaymentsFlag === "true") return true;

  const appOwnership = runtime.appOwnership ?? null;
  const platform = runtime.platform ?? "";

  return appOwnership === "expo" || platform === "web";
}
