import type { LatLng, MechanicJob, ServiceCode } from "./types";
import { SERVICE_TYPES, DEFAULT_COORDS } from "./seed";
import { offsetMeters } from "./geo";

const SAMPLE_CUSTOMERS = [
  "Jamie L.",
  "Priya S.",
  "Marcus T.",
  "Aiko Y.",
  "Diego R.",
  "Sophie K.",
  "Noah P.",
  "Liam O.",
  "Emma C.",
  "Olivia M.",
];

const SAMPLE_VEHICLES = [
  "2018 Toyota Camry",
  "2021 Tesla Model 3",
  "2015 Ford F-150",
  "2020 Honda Civic",
  "2019 Subaru Outback",
  "2022 Hyundai Sonata",
  "2017 BMW 3 Series",
  "2016 Chevy Equinox",
  "2023 Kia Telluride",
];

const SAMPLE_LOCATIONS = [
  "850 Howard St, San Francisco, CA",
  "1200 Folsom St, San Francisco, CA",
  "601 Mission St, San Francisco, CA",
  "350 Bush St, San Francisco, CA",
  "100 California St, San Francisco, CA",
  "2480 Mission St, San Francisco, CA",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateMechanicJob(mechanicCoords?: LatLng | null): MechanicJob {
  const service = pick(SERVICE_TYPES);
  const distance = +(0.4 + Math.random() * 4.5).toFixed(1);
  // Payout = service base + small dispatch share
  const payout = +(service.basePrice * 0.78 + distance * 1.2).toFixed(2);

  // Generate a customer pickup at a random bearing within ~distance miles of the mechanic.
  const center = mechanicCoords ?? DEFAULT_COORDS;
  const bearing = Math.random() * Math.PI * 2;
  const meters = distance * 1609.344;
  const east = Math.cos(bearing) * meters;
  const north = Math.sin(bearing) * meters;
  const pickup = offsetMeters(center, east, north);

  return {
    id: `mj_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    customerName: pick(SAMPLE_CUSTOMERS),
    vehicle: pick(SAMPLE_VEHICLES),
    service: service.code as ServiceCode,
    location: pick(SAMPLE_LOCATIONS),
    distanceMiles: distance,
    payout,
    status: "pending",
    receivedAt: Date.now(),
    pickup,
    mechanicStart: center,
  };
}
