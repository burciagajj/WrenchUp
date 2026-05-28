import {
  AppState,
  InAppNotification,
  Job,
  JobStatus,
  MechanicJob,
  MechanicJobStatus,
  PaymentMethod,
  Role,
  Vehicle,
} from "./types";
import { getDeviceRegionHint } from "./region-detection";
import { DEFAULT_LOCATION, DEFAULT_USER_NAME, DEFAULT_VEHICLES } from "./seed";

export const initialState: AppState = {
  hydrated: false,
  userDataStatus: "idle",
  userName: DEFAULT_USER_NAME,
  defaultLocation: DEFAULT_LOCATION,
  userCoords: null,
  locationStatus: "idle",
  vehicles: DEFAULT_VEHICLES,
  selectedVehicleId: DEFAULT_VEHICLES[0]?.id ?? null,
  photoUrl: null,
  activeJobId: null,
  jobs: [],
  role: "customer",
  dashboardRoleOverride: null,
  mechanicOnline: false,
  mechanicJobs: [],
  mechanicActiveJobId: null,
  detectedCountry: "MX",
  regionPreference: "MX",
  paymentMethods: [],
  defaultPaymentMethodId: null,
  paymentStatus: "idle",
  paymentError: null,
  notificationsInbox: [],
};

export type Action =
  | { type: "HYDRATE"; payload: Partial<AppState> }
  | { type: "SET_USER_NAME"; payload: string }
  | { type: "SET_DEFAULT_LOCATION"; payload: string }
  | { type: "SET_USER_COORDS"; payload: { coords: { latitude: number; longitude: number } | null; status: AppState["locationStatus"]; address?: string } }
  | { type: "ADD_VEHICLE"; payload: Vehicle }
  | { type: "UPDATE_VEHICLE"; payload: Vehicle }
  | { type: "DELETE_VEHICLE"; payload: string }
  | { type: "SELECT_VEHICLE"; payload: string }
  | { type: "CREATE_JOB"; payload: Job }
  | { type: "UPDATE_JOB_STATUS"; payload: { id: string; status: JobStatus } }
  | { type: "UPDATE_JOB_ASSIGNMENT"; payload: { id: string; mechanicName?: string; mechanicId?: string } }
  | { type: "UPDATE_JOB_BOOKING_META"; payload: { id: string; isBooked?: boolean; scheduledFor?: number | null } }
  | { type: "UPDATE_JOB_MECHANIC_COORDS"; payload: { id: string; coords: { latitude: number; longitude: number } | null } }
  | { type: "UPDATE_JOB_MECHANIC_DONE_AT"; payload: { id: string; at: number | null } }
  | { type: "COMPLETE_JOB"; payload: { id: string; rating?: number; tip?: number; ratingComment?: string } }
  | { type: "CLEAR_ACTIVE_JOB" }
  // Mechanic mode
  | { type: "SET_ROLE"; payload: Role }
  | { type: "SET_DASHBOARD_ROLE_OVERRIDE"; payload: Role | null }
  | { type: "SET_MECHANIC_ONLINE"; payload: boolean }
  | { type: "ADD_MECHANIC_JOB"; payload: MechanicJob }
  | { type: "UPDATE_MECHANIC_JOB_STATUS"; payload: { id: string; status: MechanicJobStatus } }
  | { type: "SET_DETECTED_COUNTRY"; payload: AppState["detectedCountry"] }
  | { type: "SET_REGION_PREFERENCE"; payload: AppState["regionPreference"] }
  | { type: "ADD_PAYMENT_METHOD"; payload: PaymentMethod }
  | { type: "DELETE_PAYMENT_METHOD"; payload: string }
  | { type: "SET_DEFAULT_PAYMENT_METHOD"; payload: string | null }
  | { type: "SET_PAYMENT_STATUS"; payload: { status: AppState["paymentStatus"]; error?: string } }
  | { type: "ADD_INBOX_NOTIFICATION"; payload: InAppNotification }
  | { type: "MARK_INBOX_READ"; payload?: { id?: string } }
  | { type: "CLEAR_INBOX" }
  | {
      type: "LOAD_USER_HISTORY";
      payload: {
        jobs: Job[];
        activeJobId: string | null;
        mechanicJobs: MechanicJob[];
        mechanicActiveJobId: string | null;
        paymentMethods: PaymentMethod[];
        defaultPaymentMethodId: string | null;
      };
    }
  // v1.6: User data isolation
  | {
      type: "LOAD_USER_DATA";
      payload: {
        userName: string;
        vehicles: Vehicle[];
        selectedVehicleId: string | null;
        photoUrl?: string | null;
      };
    }
  | { type: "CLEAR_USER_DATA" }
  // v1.8: Photo upload
  | { type: "SET_PHOTO_URL"; payload: string }
  | { type: "SET_USER_DATA_STATUS"; payload: AppState["userDataStatus"] }
  | {
      type: "MERGE_VEHICLE_APPROVALS";
      payload: Record<
        string,
        {
          insuranceDocUri?: string | null;
          registrationStickerUri?: string | null;
          approvalStatus?: "pending" | "approved" | "rejected";
        }
      >;
    };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...state,
        ...action.payload,
        mechanicJobs: Array.isArray(action.payload.mechanicJobs)
          ? action.payload.mechanicJobs.filter(
              (job, idx, arr) =>
                arr.findIndex(
                  (j) =>
                    j.id === job.id ||
                    (j.remoteRequestId &&
                      job.remoteRequestId &&
                      j.remoteRequestId === job.remoteRequestId),
                ) === idx,
            )
          : state.mechanicJobs,
        hydrated: true,
      };
    case "SET_USER_NAME":
      return { ...state, userName: action.payload };
    case "SET_DEFAULT_LOCATION":
      return { ...state, defaultLocation: action.payload };
    case "SET_USER_COORDS":
      return {
        ...state,
        userCoords: action.payload.coords,
        locationStatus: action.payload.status,
        defaultLocation: action.payload.address ?? state.defaultLocation,
      };
    case "ADD_VEHICLE": {
      const vehicles = [...state.vehicles, action.payload];
      const selectedVehicleId = state.selectedVehicleId ?? action.payload.id;
      return { ...state, vehicles, selectedVehicleId };
    }
    case "UPDATE_VEHICLE": {
      const vehicles = state.vehicles.map((v) => (v.id === action.payload.id ? action.payload : v));
      return { ...state, vehicles };
    }
    case "DELETE_VEHICLE": {
      const vehicles = state.vehicles.filter((v) => v.id !== action.payload);
      const selectedVehicleId =
        state.selectedVehicleId === action.payload
          ? vehicles[0]?.id ?? null
          : state.selectedVehicleId;
      return { ...state, vehicles, selectedVehicleId };
    }
    case "SELECT_VEHICLE":
      return { ...state, selectedVehicleId: action.payload };
    case "CREATE_JOB":
      return {
        ...state,
        jobs: [action.payload, ...state.jobs],
        activeJobId: action.payload.id,
      };
    case "UPDATE_JOB_STATUS": {
      const jobs = state.jobs.map((j) => {
        if (j.id !== action.payload.id) return j;
        const next: Job = { ...j, status: action.payload.status };
        if (action.payload.status === "accepted" && !j.acceptedAt) next.acceptedAt = Date.now();
        return next;
      });
      const activeJobId =
        action.payload.status === "completed" || action.payload.status === "cancelled"
          ? null
          : state.activeJobId;
      return { ...state, jobs, activeJobId };
    }
    case "UPDATE_JOB_ASSIGNMENT": {
      const jobs = state.jobs.map((j) =>
        j.id === action.payload.id
          ? {
              ...j,
              mechanicName: action.payload.mechanicName ?? j.mechanicName,
              mechanicId: action.payload.mechanicId ?? j.mechanicId,
            }
          : j,
      );
      return { ...state, jobs };
    }
    case "UPDATE_JOB_BOOKING_META": {
      const jobs = state.jobs.map((j) =>
        j.id === action.payload.id
          ? {
              ...j,
              isBooked: action.payload.isBooked ?? j.isBooked,
              scheduledFor:
                action.payload.scheduledFor !== undefined
                  ? action.payload.scheduledFor
                  : j.scheduledFor,
            }
          : j,
      );
      return { ...state, jobs };
    }
    case "UPDATE_JOB_MECHANIC_COORDS": {
      const jobs = state.jobs.map((j) =>
        j.id === action.payload.id ? { ...j, mechanicLiveCoords: action.payload.coords } : j,
      );
      return { ...state, jobs };
    }
    case "UPDATE_JOB_MECHANIC_DONE_AT": {
      const jobs = state.jobs.map((j) =>
        j.id === action.payload.id ? { ...j, mechanicMarkedDoneAt: action.payload.at ?? undefined } : j,
      );
      return { ...state, jobs };
    }
    case "COMPLETE_JOB": {
      const jobs = state.jobs.map((j) =>
        j.id === action.payload.id
          ? {
              ...j,
              status: "completed" as JobStatus,
              completedAt: Date.now(),
              rating: action.payload.rating,
              tip: action.payload.tip,
              ratingComment: action.payload.ratingComment,
            }
          : j,
      );
      return { ...state, jobs, activeJobId: null };
    }
    case "CLEAR_ACTIVE_JOB":
      return { ...state, activeJobId: null };

    // ── Mechanic mode ────────────────────────────────────────────
    case "SET_ROLE":
      return { ...state, role: action.payload };
    case "SET_DASHBOARD_ROLE_OVERRIDE":
      return { ...state, dashboardRoleOverride: action.payload };
    case "SET_MECHANIC_ONLINE":
      return { ...state, mechanicOnline: action.payload };
    case "SET_DETECTED_COUNTRY":
      return { ...state, detectedCountry: action.payload };
    case "SET_REGION_PREFERENCE":
      return { ...state, regionPreference: action.payload };
    case "ADD_MECHANIC_JOB":
      if (
        state.mechanicJobs.some(
          (j) =>
            j.id === action.payload.id ||
            (j.remoteRequestId &&
              action.payload.remoteRequestId &&
              j.remoteRequestId === action.payload.remoteRequestId),
        )
      ) {
        return state;
      }
      return {
        ...state,
        mechanicJobs: [action.payload, ...state.mechanicJobs],
      };
    case "UPDATE_MECHANIC_JOB_STATUS": {
      const mechanicJobs = state.mechanicJobs.map((j) => {
        if (j.id !== action.payload.id) return j;
        let nextStatus = action.payload.status;
        // Guard: booked jobs should not enter live-trip flow before scheduled time.
        const isFutureBooked =
          !!j.isBooked &&
          (typeof j.scheduledFor !== "number" || j.scheduledFor > Date.now());
        if (action.payload.status === "heading_there" && isFutureBooked) {
          nextStatus = "upcoming";
        }
        const next: MechanicJob = { ...j, status: nextStatus };
        if (nextStatus === "heading_there" && !j.acceptedAt) next.acceptedAt = Date.now();
        if (nextStatus === "completed" && !j.completedAt) next.completedAt = Date.now();
        return next;
      });
      let mechanicActiveJobId = state.mechanicActiveJobId;
      const updated = mechanicJobs.find((j) => j.id === action.payload.id);
      const effectiveStatus = updated?.status ?? action.payload.status;
      if (effectiveStatus === "heading_there") {
        mechanicActiveJobId = action.payload.id;
      } else if (
        (effectiveStatus === "completed" || effectiveStatus === "declined" || effectiveStatus === "cancelled" || effectiveStatus === "upcoming") &&
        state.mechanicActiveJobId === action.payload.id
      ) {
        mechanicActiveJobId = null;
      }
      return { ...state, mechanicJobs, mechanicActiveJobId };
    }

    // ── Payments ────────────────────────────────────────────
    case "ADD_PAYMENT_METHOD":
      return {
        ...state,
        paymentMethods: [...state.paymentMethods, action.payload],
        defaultPaymentMethodId: state.defaultPaymentMethodId || action.payload.id,
      };
    case "DELETE_PAYMENT_METHOD":
      return {
        ...state,
        paymentMethods: state.paymentMethods.filter((pm) => pm.id !== action.payload),
        defaultPaymentMethodId:
          state.defaultPaymentMethodId === action.payload ? null : state.defaultPaymentMethodId,
      };
    case "SET_DEFAULT_PAYMENT_METHOD":
      return { ...state, defaultPaymentMethodId: action.payload };
    case "SET_PAYMENT_STATUS":
      return {
        ...state,
        paymentStatus: action.payload.status,
        paymentError: action.payload.error || null,
      };
    case "ADD_INBOX_NOTIFICATION": {
      const next = [action.payload, ...state.notificationsInbox]
        .filter((n, idx, arr) => arr.findIndex((x) => x.id === n.id) === idx)
        .slice(0, 120);
      return { ...state, notificationsInbox: next };
    }
    case "MARK_INBOX_READ": {
      if (!action.payload?.id) {
        const now = Date.now();
        return {
          ...state,
          notificationsInbox: state.notificationsInbox.map((n) => (n.readAt ? n : { ...n, readAt: now })),
        };
      }
      return {
        ...state,
        notificationsInbox: state.notificationsInbox.map((n) =>
          n.id === action.payload?.id && !n.readAt ? { ...n, readAt: Date.now() } : n,
        ),
      };
    }
    case "CLEAR_INBOX":
      return { ...state, notificationsInbox: [] };
    case "LOAD_USER_HISTORY":
      {
        const mergedPaymentMethods =
          action.payload.paymentMethods.length > 0
            ? action.payload.paymentMethods
            : state.paymentMethods;
        const mergedDefaultPaymentMethodId =
          action.payload.defaultPaymentMethodId ??
          state.defaultPaymentMethodId ??
          mergedPaymentMethods[0]?.id ??
          null;
      return {
        ...state,
        jobs: action.payload.jobs,
        activeJobId: action.payload.activeJobId,
        mechanicJobs: action.payload.mechanicJobs,
        mechanicActiveJobId: action.payload.mechanicActiveJobId,
        paymentMethods: mergedPaymentMethods,
        defaultPaymentMethodId: mergedDefaultPaymentMethodId,
      };
      }

    // v1.6: User data isolation
    // Replace profile + vehicles + avatar from Supabase (after login, restore, or profile-complete)
    case "SET_USER_DATA_STATUS":
      return { ...state, userDataStatus: action.payload };
    case "LOAD_USER_DATA":
      return {
        ...state,
        userDataStatus: "ready",
        userName: action.payload.userName,
        vehicles: action.payload.vehicles,
        selectedVehicleId: action.payload.selectedVehicleId,
        // Explicit null clears avatar when profile has no avatar_url
        photoUrl:
          action.payload.photoUrl !== undefined
            ? action.payload.photoUrl
            : state.photoUrl,
      };
    case "CLEAR_USER_DATA":
      return {
        ...state,
        userDataStatus: "idle",
        role: "customer",
        dashboardRoleOverride: null,
        mechanicOnline: false,
        userName: DEFAULT_USER_NAME,
        vehicles: [],
        selectedVehicleId: null,
        photoUrl: null,
        jobs: [],
        activeJobId: null,
        mechanicJobs: [],
        mechanicActiveJobId: null,
        paymentMethods: [],
        defaultPaymentMethodId: null,
        notificationsInbox: [],
      };

    case "SET_PHOTO_URL":
      return { ...state, photoUrl: action.payload };
    case "MERGE_VEHICLE_APPROVALS":
      return {
        ...state,
        vehicles: state.vehicles.map((v) => {
          const patch = action.payload[v.id];
          return patch ? { ...v, ...patch } : v;
        }),
      };

    default:
      return state;
  }
}
