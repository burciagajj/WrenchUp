// Domain types for WrenchUp

export type ServiceCode =
  | "battery_jump"
  | "flat_tire"
  | "lockout"
  | "car_wash"
  | "quick_check_up"
  | "oil_change"
  | "brake_service"
  | "diagnostic"
  | "engine_repair"
  | "ac_service"
  | "general_checkup"
  | "fuel_delivery"
  | "other";

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
  trim?: string;
  engineSize?: string;
  transmissionType?: "automatic" | "manual" | "cvt" | "dct" | "other";
  drivetrain?: "AWD" | "FWD" | "RWD" | "4WD";
  color: string;
  plate: string;
  insuranceDocUri?: string | null;
  registrationStickerUri?: string | null;
  approvalStatus?: "pending" | "approved" | "rejected";
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
  mechanicName?: string;
  mechanicPhotoUrl?: string | null;
  remoteRequestId?: string;
  isBooked?: boolean;
  scheduledFor?: number | null;
  mechanicOfferSentAt?: number | null;
  offerExpiresAt?: number | null;
  customerQuoteAcceptedAt?: number | null;
  mechanicAcceptedAt?: number | null;
  stripePaymentIntentId?: string | null;
  vehicleId: string;
  service: ServiceCode;
  location: string;
  customerNote?: string | null;
  status: JobStatus;
  createdAt: number; // epoch ms
  acceptedAt?: number;
  completedAt?: number;
  fare: {
    service: number;
    bookingFee: number;
    total: number;
  };
  tip?: number;
  rating?: number; // customer's rating of the mechanic, given by this customer
  ratingComment?: string;
  customerRating?: number; // mechanic's rating of this customer, received by this customer
  customerRatingComment?: string;
  pickup?: LatLng;     // captured at booking time from user's current location
  mechanicStart?: LatLng; // mechanic's start coords at booking time
  mechanicLiveCoords?: LatLng | null;
  /** Epoch ms when mechanicLiveCoords was actually captured on the mechanic's device — null/undefined means unknown (treat as stale). */
  mechanicLocationUpdatedAt?: number | null;
  mechanicMarkedDoneAt?: number;
  paymentMethodId?: string; // Stripe payment method ID
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
  cancelReason?: string | null;
  cancelledAt?: number | null;
  cancelledByRole?: "customer" | "mechanic" | null;
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

export type InAppNotification = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  readAt?: number;
  roleScope: "customer" | "mechanic" | "all";
  route?: string;
  actionType?: "customer_service_offer";
  requestId?: string;
};

export type MechanicJobStatus =
  | "pending"      // incoming request, awaiting accept
  | "upcoming"     // accepted booked job, waiting for scheduled time
  | "heading_there" // accepted, driving to customer
  | "arrived"
  | "in_progress"
  | "completed"
  | "declined"
  | "cancelled";

export type MechanicJob = {
  id: string;
  remoteRequestId?: string;
  isBooked?: boolean;
  customerName: string;
  customerPhotoUrl?: string | null;
  vehicle: string;          // "2020 Honda Civic"
  service: ServiceCode;
  location: string;
  distanceMiles: number;
  payout: number;           // dollars, mechanic's share of the service price (excludes tip)
  tip?: number;             // dollars, customer tip added at completion — kept separate from payout
  rating?: number; // customer's rating of this mechanic, received by this mechanic
  ratingComment?: string;
  customerRating?: number; // mechanic's rating of the customer, given by this mechanic
  customerRatingComment?: string;
  status: MechanicJobStatus;
  receivedAt: number;       // epoch ms
  acceptedAt?: number;
  completedAt?: number;
  mechanicMarkedDoneAt?: number;
  pickup?: LatLng;          // customer location
  mechanicStart?: LatLng;   // mechanic start location
  scheduledFor?: number | null;
  customerNote?: string;
  customerHasParts?: boolean | null;
  issuePhotoUrl?: string | null;
  mechanicOfferSentAt?: number | null;
  offerExpiresAt?: number | null;
  customerQuoteAcceptedAt?: number | null;
  mechanicAcceptedAt?: number | null;
  stripePaymentIntentId?: string | null;
  cancelReason?: string | null;
  cancelledAt?: number | null;
  cancelledByRole?: "customer" | "mechanic" | null;
  /** Epoch ms when the mechanic reported being unable to find the customer while "arrived". */
  noShowReportedAt?: number | null;
};

export type UserDataStatus = "idle" | "loading" | "ready";

export type AppState = {
  hydrated: boolean;
  /** Supabase profile + vehicles sync state for the signed-in user. */
  userDataStatus: UserDataStatus;
  userName: string;
  phoneNumber: string | null;
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
  dashboardRoleOverride: Role | null;
  mechanicOnline: boolean;
  /**
   * Epoch ms of the last successful presence heartbeat/foreground resync
   * while online. Used purely on cold start (see StoreProvider hydration in
   * lib/store.tsx) to detect "the app was killed while online and never got
   * to flip mechanicOnline back to false" — if this is stale by more than
   * PRESENCE_STALE_AFTER_MS when the persisted state rehydrates, the toggle
   * is reset to offline instead of silently trusting a days-old "online".
   */
  mechanicOnlineHeartbeatAt: number | null;
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
  notificationsInbox: InAppNotification[];

  /** Transient but persisted notices for customer cancellations (shown as dismissible banners on home until dismissed) */
  recentCancellations: Array<{
    jobId: string;
    service?: string;
    location?: string;
    isBooked?: boolean;
    at: number;
  }>;
};
