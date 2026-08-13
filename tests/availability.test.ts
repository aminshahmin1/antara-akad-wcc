import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAvailability } from "../src/availability.js";
import { loadBusinessConfig } from "../src/config.js";

describe("checkAvailability", () => {
  const config = loadBusinessConfig();

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("marks configured blocked dates unavailable for the whole day", async () => {
    await expect(checkAvailability(config, "2026-12-12")).resolves.toMatchObject({
      status: "unavailable",
      date: "2026-12-12",
      source: "manual",
    });
  });

  it("allows dates without a blocking event in manual mode", async () => {
    await expect(checkAvailability(config, "2026-12-13")).resolves.toMatchObject({
      status: "available",
      date: "2026-12-13",
      source: "manual",
    });
  });

  it("fails closed for malformed dates", async () => {
    await expect(checkAvailability(config, "not-a-date")).resolves.toMatchObject({
      status: "error",
      reason: "Invalid date.",
    });
  });

  it("uses Calendly busy times when a personal access token is configured", async () => {
    vi.stubEnv("CALENDLY_ACCESS_TOKEN", "calendly-token");
    vi.stubEnv("CALENDLY_USER_URI", "https://api.calendly.com/users/test-user");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ collection: [{ start_time: "2026-12-13T10:00:00+08:00" }] }),
      })) as unknown as typeof fetch,
    );

    await expect(checkAvailability(config, "2026-12-13")).resolves.toMatchObject({
      status: "unavailable",
      source: "calendly",
    });
  });

  it("marks the date available when Calendly returns no busy times", async () => {
    vi.stubEnv("CALENDLY_ACCESS_TOKEN", "calendly-token");
    vi.stubEnv("CALENDLY_USER_URI", "https://api.calendly.com/users/test-user");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ collection: [] }),
      })) as unknown as typeof fetch,
    );

    await expect(checkAvailability(config, "2026-12-13")).resolves.toMatchObject({
      status: "available",
      source: "calendly",
    });
  });

  it("accepts CALENDLY_API_TOKEN as the Vercel secret name", async () => {
    vi.stubEnv("CALENDLY_API_TOKEN", "calendly-token");
    vi.stubEnv("CALENDLY_USER_URI", "https://api.calendly.com/users/test-user");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ collection: [] }),
      })) as unknown as typeof fetch,
    );

    await expect(checkAvailability(config, "2026-12-13")).resolves.toMatchObject({
      status: "available",
      source: "calendly",
    });
  });

  it("fails closed when Calendly cannot confirm the date", async () => {
    vi.stubEnv("CALENDLY_ACCESS_TOKEN", "calendly-token");
    vi.stubEnv("CALENDLY_USER_URI", "https://api.calendly.com/users/test-user");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
      })) as unknown as typeof fetch,
    );

    await expect(checkAvailability(config, "2026-12-13")).resolves.toMatchObject({
      status: "error",
      source: "calendly",
      reason: "Calendly check failed.",
    });
  });
});
