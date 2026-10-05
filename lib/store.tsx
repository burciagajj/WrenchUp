import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useCallback, useState } from "react";
import { initialState, reducer, type Action } from "./store-reducer";
import { getDeviceRegionHint } from "./region-detection";
import { resolveServiceLocationLabel } from "./location-label";
import { shouldResetStaleMechanicOnline } from "./mechanic-presence-core";
import type { AppState } from "./types";

const STORAGE_KEY = "yojitan_state_v1";

type StoreContextValue = {
  state: AppState;
  dispatch: (action: Action) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

const PERSISTABLE_KEYS: (keyof AppState)[] = [
  "userName",
  "phoneNumber",
  "defaultLocation",
  "userCoords",
  "userCoordsAt",
  "serviceLocationCoords",
  "locationStatus",
  "vehicles",
  "selectedVehicleId",
  "activeJobId",
  "jobs",
  "role",
  "dashboardRoleOverride",
  "mechanicOnline",
  "mechanicOnlineHeartbeatAt",
  "mechanicJobs",
  "mechanicActiveJobId",
  "detectedCountry",
  "regionPreference",
  "paymentMethods",
  "defaultPaymentMethodId",
  "notificationsInbox",
  "recentCancellations",
];

function pickPersistable(state: AppState): Partial<AppState> {
  const out: Partial<AppState> = {};
  for (const k of PERSISTABLE_KEYS) {
    // @ts-expect-error generic key
    out[k] = state[k];
  }
  return out;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const hasHydrated = useRef(false);

  // Hydrate once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<AppState>;
          parsed.defaultLocation = resolveServiceLocationLabel(
            parsed.defaultLocation,
            parsed.userCoords ?? null
          );
          // Only reset genuinely invalid/legacy region state — a real manual
          // choice ("US"/"MX") from the region toggle in Settings must
          // survive a restart, otherwise the toggle can never actually stick.
          if (
            parsed.regionPreference !== "auto" &&
            parsed.regionPreference !== "US" &&
            parsed.regionPreference !== "MX"
          ) {
            parsed.regionPreference = "auto";
          }
          if (!parsed.detectedCountry) {
            parsed.detectedCountry = getDeviceRegionHint();
          }
          // A mechanic who was online when the app got killed (not just
          // backgrounded — the AppState listener in mechanic-live-job-sync.tsx
          // already handles a clean background/foreground cycle) would
          // otherwise rehydrate as "online" forever, even after days with no
          // heartbeat ever reaching the server. Cold-start is the one place
          // that can catch a hard kill, since it's the only code path
          // guaranteed to run again once the app reopens. Reset locally using
          // the same staleness window the server already uses to exclude this
          // mechanic from matching, so the toggle never lies about being
          // "online" longer than the mechanic could have actually been
          // reachable for.
          if (
            shouldResetStaleMechanicOnline({
              mechanicOnline: !!parsed.mechanicOnline,
              lastHeartbeatAt: parsed.mechanicOnlineHeartbeatAt,
            })
          ) {
            parsed.mechanicOnline = false;
            parsed.mechanicOnlineHeartbeatAt = null;
          }
          dispatch({ type: "HYDRATE", payload: parsed });
        } else {
          dispatch({
            type: "HYDRATE",
            payload: { detectedCountry: getDeviceRegionHint(), regionPreference: "auto" },
          });
        }
      } catch {
        dispatch({ type: "HYDRATE", payload: {} });
      } finally {
        hasHydrated.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist on changes (after hydration)
  useEffect(() => {
    if (!state.hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pickPersistable(state))).catch(() => {});
  }, [state]);

  const safeDispatch = useCallback((action: Action) => {
    dispatch(action);
  }, []);

  const value = useMemo(() => ({ state, dispatch: safeDispatch }), [state, safeDispatch]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}

/**
 * Performance-optimized selector hook.
 * Only re-renders the component when the selected value actually changes.
 * 
 * Usage:
 *   const userName = useStoreSelector(s => s.userName);
 *   const activeJob = useStoreSelector(s => s.jobs.find(j => j.id === s.activeJobId));
 */
export function useStoreSelector<T>(selector: (state: AppState) => T): T {
  const { state } = useStore();
  
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const [selected, setSelected] = useState(() => selector(state));

  useEffect(() => {
    const newValue = selectorRef.current(state);
    if (!Object.is(selected, newValue)) {
      setSelected(newValue);
    }
  }, [state]); // We still depend on full state here, but the component only re-renders if selector result changed

  return selected;
}

export function useActiveJob() {
  const { state } = useStore();
  if (!state.activeJobId) return null;
  return state.jobs.find((j) => j.id === state.activeJobId) ?? null;
}

export function useSelectedVehicle() {
  const { state } = useStore();
  if (!state.selectedVehicleId) return null;
  return state.vehicles.find((v) => v.id === state.selectedVehicleId) ?? null;
}

export function useJob(id?: string | string[]) {
  const { state } = useStore();
  const jobId = Array.isArray(id) ? id[0] : id;
  if (!jobId) return null;
  return state.jobs.find((j) => j.id === jobId) ?? null;
}

export function useMechanicActiveJob() {
  const { state } = useStore();
  if (!state.mechanicActiveJobId) return null;
  return state.mechanicJobs.find((j) => j.id === state.mechanicActiveJobId) ?? null;
}

export function usePendingMechanicJob() {
  const { state } = useStore();
  // First pending job (FIFO)
  return state.mechanicJobs.find((j) => j.status === "pending") ?? null;
}

// === Performance-optimized granular selectors ===
// These help avoid pulling the entire state object in heavy components.

export function useJobs() {
  const { state } = useStore();
  return state.jobs;
}

export function useMechanicJobs() {
  const { state } = useStore();
  return state.mechanicJobs;
}

export function useVehicles() {
  const { state } = useStore();
  return state.vehicles;
}

export function useNotifications() {
  const { state } = useStore();
  return state.notificationsInbox;
}

export function useMechanicOnline() {
  const { state } = useStore();
  return state.mechanicOnline;
}
