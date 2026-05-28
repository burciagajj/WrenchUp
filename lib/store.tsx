import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useCallback } from "react";
import { initialState, reducer, type Action } from "./store-reducer";
import { getDeviceRegionHint } from "./region-detection";
import type { AppState } from "./types";

const STORAGE_KEY = "wrenchup_state_v1";

type StoreContextValue = {
  state: AppState;
  dispatch: (action: Action) => void;
};

const StoreContext = createContext<StoreContextValue | null>(null);

const PERSISTABLE_KEYS: (keyof AppState)[] = [
  "userName",
  "defaultLocation",
  "userCoords",
  "locationStatus",
  "vehicles",
  "selectedVehicleId",
  "activeJobId",
  "jobs",
  "role",
  "dashboardRoleOverride",
  "mechanicOnline",
  "mechanicJobs",
  "mechanicActiveJobId",
  "detectedCountry",
  "regionPreference",
  "paymentMethods",
  "defaultPaymentMethodId",
  "notificationsInbox",
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
          // Reset legacy forced-region state and return to auto-detect.
          parsed.regionPreference = "auto";
          if (!parsed.detectedCountry) {
            parsed.detectedCountry = getDeviceRegionHint();
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
