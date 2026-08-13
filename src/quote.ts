import type { BusinessConfig, CustomerProfile, ServicePackage } from "./types.js";

export interface QuoteResult {
  servicePackage: ServicePackage;
  total: number;
  extraHours: number;
}

export function calculateQuote(config: BusinessConfig, profile: CustomerProfile): QuoteResult {
  const servicePackage = config.packages.find((item) => item.id === profile.packageId);
  if (!servicePackage) throw new Error("A valid package is required before calculating a quote.");
  if (!profile.durationHours) throw new Error("Event duration is required before calculating a quote.");

  const extraHours = Math.max(0, profile.durationHours - servicePackage.includedHours);
  return {
    servicePackage,
    extraHours,
    total: servicePackage.basePrice + extraHours * servicePackage.extraHourPrice,
  };
}

export function formatRinggit(amount: number): string {
  const formatted = new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  return `RM${formatted}`;
}
