// Domain types for WrenchUp

export type ServiceCode =
  | "battery_jump"
  | "flat_tire"
  | "oil_change"
  | "brake_service"
  | "diagnostic"
  | "engine_repair"
  | "ac_service"
  | "general_checkup";

export type ServiceType = {
  code: ServiceCode;
  name: string;
  description: string;
  icon: string; // SF Symbol name
  basePrice: number; // USD flat
  estimatedMinutes: number;
};

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type Vehicle = {
  id: string;
  nickname: string;
  year: number;
  make: string;
  model: string;
  color: string;
  plate: string;
};

export type MechanicReview = {
  id: string;
  author: string;
  rating: number; // 1-5
  comment: string;
  date: string; // ISO
};

export type Mechanic = {
  id: string;
  name: string;
  photoUrl: string;
  rating: number; // 0-5
  jobsCompleted: number;
  yearsExperience: number;
  hourlyRate: number;
  etaMinutes: number;
  distanceMiles: number;
  vehicle: string;
  bio: string;
  specialties: string[];
  certifications: string[];
  reviews: MechanicReview[];
  // Relative offset (meters east/north) from user location used to compute live coordinates.
  offsetMeters: { east: number; north: number };
};

export type JobStatus =
  | "searching"
  | "accepted"
  | "enroute"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export type Job = {
  id: string;
  mechanicId: string;
  vehicleId: string;
  service: ServiceCode;
  location: string;
  status: JobStatus;
  createdAt: number; // epoch ms
  acceptedAt?: number;
  completedAt?: number;
  fare: {
    base: number;
    service: number;
    distance: number;
    total: number;
  };
  tip?: number;
  rating?: number;
  ratingComment?: string;
  pickup?: LatLng;     // captured at booking time from user's current location
  mechanicStart?: LatLng; // mechanic's start coords at booking time
  paymentMethodId?: string; // Stripe payment method ID
};

export type Role = "customer" | "mechanic";

export type RegionCode = "US" | "MX";
export type LocaleCode = "en" | "es-MX";
/** Region preference: "auto" derives from location/country code; otherwise locked. */
export type RegionPreference = "auto" | RegionCode;

export type PaymentMethod = {
  id: string;
  type: "card";
  card: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  billingDetails: {
    name?: string;
    email?: string;
  };
};

export type MechanicJobStatus =
  | "pending"      // incoming request, awaiting accept
  | "heading_there" // accepted, driving to customer
  | "arrived"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled";

export type MechanicJob = {
  id: string;
  customerName: string;
  vehicle: string;          // "2020 Honda Civic"
  service: ServiceCode;
  location: string;
  distanceMiles: number;
  payout: number;           // dollars
  status: MechanicJobStatus;
  receivedAt: number;       // epoch ms
  acceptedAt?: number;
  completedAt?: number;
  pickup?: LatLng;          // customer location
  mechanicStart?: LatLng;   // mechanic start location
};

export type AppState = {
  hydrated: boolean;
  userName: string;
  defaultLocation: string;
  userCoords: LatLng | null;
  locationStatus: "idle" | "requesting" | "granted" | "denied";
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  photoUrl: string | null;
  activeJobId: string | null;
  jobs: Job[];
  // Mechanic mode
  role: Role;
  mechanicOnline: boolean;
  mechanicJobs: MechanicJob[];
  mechanicActiveJobId: string | null;
  /** Country code derived from reverse geocoding the user's coords ("US" or "MX"). */
  detectedCountry: RegionCode | null;
  /** Manual override; "auto" follows detectedCountry. */
  regionPreference: RegionPreference;
  
  // Payments
  paymentMethods: PaymentMethod[];
  defaultPaymentMethodId: string | null;
  paymentStatus: "idle" | "processing" | "success" | "error";
  paymentError: string | null;
};
