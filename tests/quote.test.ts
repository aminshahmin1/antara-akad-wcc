import { describe, expect, it } from "vitest";
import { loadBusinessConfig } from "../src/config.js";
import { calculateQuote } from "../src/quote.js";

describe("calculateQuote", () => {
  const config = loadBusinessConfig();

  it("uses the base price inside included hours", () => {
    const quote = calculateQuote(config, { packageId: "nikah", durationHours: 3 });
    expect(quote.total).toBe(180);
    expect(quote.extraHours).toBe(0);
  });

  it("adds the configured extra-hour rate", () => {
    const quote = calculateQuote(config, { packageId: "nikah", durationHours: 5 });
    expect(quote.total).toBe(300);
    expect(quote.extraHours).toBe(2);
  });
});
