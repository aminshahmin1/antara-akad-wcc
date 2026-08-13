import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import defaultBusinessConfig from "../config/business.json" with { type: "json" };
import type { BusinessConfig } from "./types.js";

const packageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  inquiryEventType: z.enum(["Sanding", "Nikah", "Nikah + Sanding"]),
  keywords: z.array(z.string().min(1)).min(1),
  includedHours: z.number().int().positive(),
  basePrice: z.number().nonnegative(),
  extraHourPrice: z.number().nonnegative(),
  description: z.string().min(1),
});

const configSchema = z.object({
  businessName: z.string().min(1),
  ownerName: z.string().min(1),
  currency: z.literal("MYR"),
  timezone: z.string().min(1),
  serviceArea: z.string().min(1),
  greeting: z.string().min(1),
  handoffMessage: z.string().min(1),
  quoteDisclaimer: z.string().min(1),
  availability: z
    .object({
      blockedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
      blockingStatuses: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  packages: z.array(packageSchema).min(1),
  faqs: z.array(
    z.object({
      question: z.string().min(1),
      keywords: z.array(z.string().min(1)).min(1),
      answer: z.string().min(1),
    }),
  ),
});

export function loadBusinessConfig(configPath = process.env.BUSINESS_CONFIG_PATH ?? "config/business.json"): BusinessConfig {
  const absolutePath = path.resolve(configPath);
  if (!fs.existsSync(absolutePath) && configPath === "config/business.json") {
    return configSchema.parse(defaultBusinessConfig);
  }
  const raw = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown;
  return configSchema.parse(raw);
}
