// Service-specific mechanic "capabilities" — an extra, optional unlock a
// mechanic must complete (upload a photo, get it admin-approved) before they
// can be routed jobs for a given service type. Distinct from the general
// license/insurance verification bundle in requirements.tsx: a mechanic can
// already be a fully approved mechanic and still be missing a capability.
//
// Add a new gated service by adding one entry here — the requirements screen,
// upload flow, and dispatch-eligibility filter (see lib/live-dispatch.ts and
// mechanic_service_eligible_ids in supabase/migrations) all key off this list,
// no other code needs to change.

import type { ServiceCode } from "./types";

export type ServiceCapabilityRequirement = {
  /** Matches SERVICE_TYPES[].code (lib/seed.ts) — the service this gates. */
  serviceCode: ServiceCode;
  /** Row key in mechanic_service_capabilities.capability_code. */
  capabilityCode: string;
  label: { en: string; es: string };
  helperText: { en: string; es: string };
};

export const SERVICE_CAPABILITY_REQUIREMENTS: ServiceCapabilityRequirement[] = [
  {
    serviceCode: "fuel_delivery",
    capabilityCode: "fuel_delivery",
    label: {
      en: "Fuel container photo",
      es: "Foto del contenedor de gasolina",
    },
    helperText: {
      en: "Upload a photo of an approved, sealed gasoline container (a DOT/UL-listed jug) to unlock Fuel Delivery jobs. Required to legally transport gasoline. An admin reviews it once before it unlocks.",
      es: "Sube una foto de un contenedor de gasolina aprobado y sellado (bidón certificado DOT/UL) para desbloquear los trabajos de Entrega de gasolina. Es obligatorio para transportar gasolina legalmente. Un administrador la revisa una vez antes de desbloquearla.",
    },
  },
];

export function getCapabilityRequirementForService(
  serviceCode: string,
): ServiceCapabilityRequirement | null {
  return SERVICE_CAPABILITY_REQUIREMENTS.find((r) => r.serviceCode === serviceCode) ?? null;
}

export function getCapabilityRequirement(capabilityCode: string): ServiceCapabilityRequirement | null {
  return SERVICE_CAPABILITY_REQUIREMENTS.find((r) => r.capabilityCode === capabilityCode) ?? null;
}
