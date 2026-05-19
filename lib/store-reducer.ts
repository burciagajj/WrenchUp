import {
  AppState,
  Job,
  JobStatus,
  MechanicJob,
  MechanicJobStatus,
  PaymentMethod,
  Role,
  Vehicle,
} from "./types";
import { DEFAULT_LOCATION, DEFAULT_USER_NAME, DEFAULT_VEHICLES } from "./seed";

export const initialState: AppState = {
  hydrated: false,
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
  mechanicOnline: false,
  mechanicJobs: [],
  mechanicActiveJobId: null,
  detectedCountry: null,
  regionPreference: "auto",
  paymentMethods: [],
  defaultPaymentMethodId: null,
  paymentStatus: "idle",
  paymentError: null,
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
  | { type: "COMPLETE_JOB"; payload: { id: string; rating?: number; tip?: number; ratingComment?: string } }
  | { type: "CLEAR_ACTIVE_JOB" }
  // Mechanic mode
  | { type: "SET_ROLE"; payload: Role }
  | { type: "SET_MECHANIC_ONLINE"; payload: boolean }
  | { type: "ADD_MECHANIC_JOB"; payload: MechanicJob }
  | { type: "UPDATE_MECHANIC_JOB_STATUS"; payload: { id: string; status: MechanicJobStatus } }
  | { type: "SET_DETECTED_COUNTRY"; payload: AppState["detectedCountry"] }
  | { type: "SET_REGION_PREFERENCE"; payload: AppState["regionPreference"] }
  | { type: "ADD_PAYMENT_METHOD"; payload: PaymentMethod }
  | { type: "DELETE_PAYMENT_METHOD"; payload: string }
  | { type: "SET_DEFAULT_PAYMENT_METHOD"; payload: string | null }
  | { type: "SET_PAYMENT_STATUS"; payload: { status: AppState["paymentStatus"]; error?: string } }
  // v1.6: User data isolation
  | { type: "LOAD_USER_DATA"; payload: { userName: string; vehicles: Vehicle[]; selectedVehicleId: string | null } }
  | { type: "CLEAR_USER_DATA" }
  // v1.8: Photo upload
  | { type: "SET_PHOTO_URL"; payload: string };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, ...action.payload, hydrated: true };
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
    case "SET_MECHANIC_ONLINE":
      return { ...state, mechanicOnline: action.payload };
    case "SET_DETECTED_COUNTRY":
      return { ...state, detectedCountry: action.payload };
    case "SET_REGION_PREFERENCE":
      return { ...state, regionPreference: action.payload };
    case "ADD_MECHANIC_JOB":
      return {
        ...state,
        mechanicJobs: [action.payload, ...state.mechanicJobs],
      };
    case "UPDATE_MECHANIC_JOB_STATUS": {
      const mechanicJobs = state.mechanicJobs.map((j) => {
        if (j.id !== action.payload.id) return j;
        const next: MechanicJob = { ...j, status: action.payload.status };
        if (action.payload.status === "heading_there" && !j.acceptedAt) next.acceptedAt = Date.now();
        if (action.payload.status === "completed" && !j.completedAt) next.completedAt = Date.now();
        return next;
      });
      let mechanicActiveJobId = state.mechanicActiveJobId;
      const status = action.payload.status;
      if (status === "heading_there") {
        mechanicActiveJobId = action.payload.id;
      } else if (
        (status === "completed" || status === "declined" || status === "cancelled") &&
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

    // v1.6: User data isolation
    case "LOAD_USER_DATA":
      return {
        ...state,
        userName: action.payload.userName,
        vehicles: action.payload.vehicles,
        selectedVehicleId: action.payload.selectedVehicleId,
      };
    case "CLEAR_USER_DATA":
      return {
        ...state,
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
      };

    case "SET_PHOTO_URL":
      return { ...state, photoUrl: action.payload };

    default:
      return state;
  }
}
