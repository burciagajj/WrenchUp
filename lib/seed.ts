import type { Mechanic, ServiceType, Vehicle } from "./types";

export const SERVICE_TYPES: ServiceType[] = [
  {
    code: "battery_jump",
    name: "Battery Jump",
    description: "Jump start a dead battery or test/replace it on the spot.",
    icon: "bolt.fill",
    basePrice: 49,
    estimatedMinutes: 25,
  },
  {
    code: "flat_tire",
    name: "Flat Tire",
    description: "Tire change, patch, or spare installation at your location.",
    icon: "car.side.fill",
    basePrice: 69,
    estimatedMinutes: 35,
  },
  {
    code: "lockout",
    name: "Lockout",
    description: "Unlock your vehicle when keys are locked inside.",
    icon: "key.fill",
    basePrice: 65,
    estimatedMinutes: 25,
  },
  {
    code: "car_wash",
    name: "Car Wash",
    description: "On-site exterior wash and quick interior cleanup.",
    icon: "drop.circle.fill",
    basePrice: 55,
    estimatedMinutes: 35,
  },
  {
    code: "oil_change",
    name: "Oil Change",
    description: "Full synthetic oil change and filter replacement.",
    icon: "drop.fill",
    basePrice: 89,
    estimatedMinutes: 40,
  },
  {
    code: "brake_service",
    name: "Brake Service",
    description: "Pads, rotors, fluid check, and brake inspection.",
    icon: "exclamationmark.triangle.fill",
    basePrice: 189,
    estimatedMinutes: 90,
  },
  {
    code: "diagnostic",
    name: "Diagnostic",
    description: "OBD-II scan and full system diagnostic with written report.",
    icon: "info.circle.fill",
    basePrice: 79,
    estimatedMinutes: 45,
  },
  {
    code: "engine_repair",
    name: "Engine Repair",
    description: "On-site fixes for common engine issues and minor repairs.",
    icon: "wrench.and.screwdriver.fill",
    basePrice: 149,
    estimatedMinutes: 90,
  },
  {
    code: "ac_service",
    name: "A/C Service",
    description: "Recharge, leak check, and A/C performance inspection.",
    icon: "snowflake",
    basePrice: 119,
    estimatedMinutes: 60,
  },
  {
    code: "general_checkup",
    name: "Check-Up",
    description: "Multi-point inspection covering fluids, belts, and brakes.",
    icon: "checkmark.circle.fill",
    basePrice: 59,
    estimatedMinutes: 40,
  },
  {
    code: "other",
    name: "Other",
    description: "Tell us what you need and we will route a custom booking request.",
    icon: "ellipsis.circle.fill",
    basePrice: 99,
    estimatedMinutes: 60,
  },
];

export function getServiceType(code: string): ServiceType | undefined {
  return SERVICE_TYPES.find((s) => s.code === code);
}

// Placeholder avatar URLs (DiceBear, freely accessible image API; deterministic by seed)
function avatar(seed: string): string {
  return `https://api.dicebear.com/9.x/avataaars/png?seed=${encodeURIComponent(seed)}&backgroundColor=fef3c7,fde68a,fed7aa,fecaca,e0f2fe`;
}

export const MECHANICS: Mechanic[] = [
  {
    id: "m_marcus",
    name: "Marcus Reed",
    photoUrl: avatar("Marcus Reed"),
    rating: 4.9,
    jobsCompleted: 1284,
    yearsExperience: 11,
    hourlyRate: 95,
    etaMinutes: 8,
    distanceMiles: 1.2,
    vehicle: "Ford Transit",
    bio: "ASE-certified master tech. Specializes in domestic V8s and diagnostics.",
    specialties: ["Diagnostic", "Brakes", "Domestic"],
    certifications: ["ASE Master", "L1 Advanced"],
    offsetMeters: { east: -650, north: 480 },
    reviews: [
      { id: "r1", author: "Jenna P.", rating: 5, comment: "Showed up early, fixed my brakes in 45 minutes.", date: "2026-04-22" },
      { id: "r2", author: "David K.", rating: 5, comment: "Honest pricing and explained everything.", date: "2026-04-10" },
    ],
  },
  {
    id: "m_sofia",
    name: "Sofia Alvarez",
    photoUrl: avatar("Sofia Alvarez"),
    rating: 4.8,
    jobsCompleted: 902,
    yearsExperience: 7,
    hourlyRate: 89,
    etaMinutes: 12,
    distanceMiles: 2.1,
    vehicle: "Chevy Express",
    bio: "Hybrid and EV specialist. Calm under pressure and great at explaining repairs.",
    specialties: ["EV", "Hybrid", "A/C"],
    certifications: ["ASE A6", "EV Level 2"],
    offsetMeters: { east: 1100, north: -800 },
    reviews: [
      { id: "r1", author: "Priya S.", rating: 5, comment: "Saved my Tesla road trip. Outstanding.", date: "2026-04-30" },
    ],
  },
  {
    id: "m_dwayne",
    name: "Dwayne Carter",
    photoUrl: avatar("Dwayne Carter"),
    rating: 4.7,
    jobsCompleted: 1567,
    yearsExperience: 15,
    hourlyRate: 85,
    etaMinutes: 18,
    distanceMiles: 3.6,
    vehicle: "Ram ProMaster",
    bio: "Veteran mechanic. Has seen every domestic engine you can think of.",
    specialties: ["Engine", "Suspension"],
    certifications: ["ASE Master"],
    offsetMeters: { east: -1900, north: -1700 },
    reviews: [
      { id: "r1", author: "Liam O.", rating: 5, comment: "Tackled a tough head gasket leak — pro.", date: "2026-03-28" },
    ],
  },
  {
    id: "m_aiko",
    name: "Aiko Tanaka",
    photoUrl: avatar("Aiko Tanaka"),
    rating: 5.0,
    jobsCompleted: 421,
    yearsExperience: 6,
    hourlyRate: 99,
    etaMinutes: 22,
    distanceMiles: 4.4,
    vehicle: "Toyota HiAce",
    bio: "Japanese & European import specialist. Meticulous attention to detail.",
    specialties: ["Imports", "Diagnostic"],
    certifications: ["ASE A1-A8", "Toyota Master"],
    offsetMeters: { east: 2400, north: 1900 },
    reviews: [
      { id: "r1", author: "Ana M.", rating: 5, comment: "She fixed an issue 3 shops missed.", date: "2026-05-01" },
    ],
  },
  {
    id: "m_jamal",
    name: "Jamal Brooks",
    photoUrl: avatar("Jamal Brooks"),
    rating: 4.6,
    jobsCompleted: 612,
    yearsExperience: 5,
    hourlyRate: 79,
    etaMinutes: 6,
    distanceMiles: 0.8,
    vehicle: "Mercedes Sprinter",
    bio: "Fast, friendly, and great for routine maintenance and tire changes.",
    specialties: ["Tires", "Oil", "Battery"],
    certifications: ["ASE A4"],
    offsetMeters: { east: 320, north: -260 },
    reviews: [
      { id: "r1", author: "Mike T.", rating: 5, comment: "Got to me in under 10 minutes!", date: "2026-04-18" },
    ],
  },
  {
    id: "m_elena",
    name: "Elena Petrova",
    photoUrl: avatar("Elena Petrova"),
    rating: 4.9,
    jobsCompleted: 1108,
    yearsExperience: 9,
    hourlyRate: 92,
    etaMinutes: 15,
    distanceMiles: 2.9,
    vehicle: "Ford Transit",
    bio: "European-trained tech. BMW, Audi, VW are her bread and butter.",
    specialties: ["European", "Diagnostic"],
    certifications: ["BMW STEP", "ASE A8"],
    offsetMeters: { east: -1400, north: 2100 },
    reviews: [
      { id: "r1", author: "Chris R.", rating: 5, comment: "Knew my BMW better than the dealership.", date: "2026-04-05" },
    ],
  },
];

export function getMechanic(id: string): Mechanic | undefined {
  return MECHANICS.find((m) => m.id === id);
}

export const DEFAULT_VEHICLES: Vehicle[] = [
  {
    id: "v_default",
    nickname: "Daily Driver",
    year: 2020,
    make: "Honda",
    model: "Civic",
    color: "Silver",
    plate: "7XBR442",
  },
];

export const DEFAULT_LOCATION = "1245 Mission St, San Francisco, CA";
export const DEFAULT_USER_NAME = "Alex";

// Used as a sensible fallback when location permission is denied / unavailable.
export const DEFAULT_COORDS = {
  latitude: 37.7762,
  longitude: -122.4154,
};
