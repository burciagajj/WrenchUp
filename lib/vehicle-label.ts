import type { Vehicle } from "@/lib/types";

function transmissionLabel(value: Vehicle["transmissionType"]): string {
  if (!value) return "";
  if (value === "cvt") return "CVT";
  if (value === "dct") return "DCT";
  if (value === "automatic") return "Automatic";
  if (value === "manual") return "Manual";
  return "Other";
}

export function buildVehicleLabel(vehicle: Vehicle): string {
  const head = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}`.trim();
  const parts: string[] = [head];
  if (vehicle.engineSize) parts.push(vehicle.engineSize);
  if (vehicle.transmissionType) parts.push(transmissionLabel(vehicle.transmissionType));
  if (vehicle.drivetrain) parts.push(vehicle.drivetrain);
  if (vehicle.plate) parts.push(vehicle.plate.toUpperCase());
  return parts.join(" • ");
}

