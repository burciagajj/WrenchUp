import type { RegionCode } from "@/lib/types";

export function formatEditableMoney(value: number, region: RegionCode): string {
  const fixed = value.toFixed(2);
  return region === "MX" ? fixed.replace(".", ",") : fixed;
}

export function normalizeEditableMoneyInput(value: string): string {
  const cleaned = value.replace(/[^\d.,]/g, "").replace(/,/g, ".");
  const [whole = "", ...fractionParts] = cleaned.split(".");
  if (fractionParts.length === 0) return whole;
  return `${whole}.${fractionParts.join("").slice(0, 2)}`;
}

export function parseEditableMoneyInput(value: string): number {
  const normalized = normalizeEditableMoneyInput(value);
  if (!normalized) return NaN;
  return Number(normalized);
}
