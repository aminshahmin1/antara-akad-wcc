import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createDashboardSession,
  generateInvoicePdf,
  hashDashboardPassword,
  verifyDashboardCredentials,
  verifyDashboardSession,
} from "../src/dashboard.js";

describe("dashboard security helpers", () => {
  it("verifies the configured operator password by salted hash", () => {
    const salt = crypto.randomBytes(16).toString("base64url");
    const env = {
      DASHBOARD_USERNAME: "operator",
      DASHBOARD_PASSWORD_SALT: salt,
      DASHBOARD_PASSWORD_HASH: hashDashboardPassword("correct-password", salt),
      DASHBOARD_SESSION_SECRET: "session-secret",
    };

    expect(verifyDashboardCredentials("operator", "correct-password", env)).toBe(true);
    expect(verifyDashboardCredentials("operator", "wrong-password", env)).toBe(false);
    expect(verifyDashboardCredentials("other", "correct-password", env)).toBe(false);
  });

  it("signs dashboard sessions and rejects tampered tokens", () => {
    const env = {
      DASHBOARD_USERNAME: "operator",
      DASHBOARD_SESSION_SECRET: "session-secret",
    };
    const token = createDashboardSession("operator", 1000, env);

    expect(verifyDashboardSession(token, 2000, env)).toBe(true);
    expect(verifyDashboardSession(`${token}x`, 2000, env)).toBe(false);
    expect(verifyDashboardSession(token, Date.now() + 60 * 60 * 24 * 1000, env)).toBe(false);
  });
});

describe("invoice PDF generator", () => {
  it("creates a PDF document containing the invoice marker", () => {
    const pdf = generateInvoicePdf({
      invoiceNumber: "AA-2026-001",
      issueDate: "2026-08-14",
      dueDate: "2026-08-16",
      clientName: "Sarah",
      phone: "+60123456789",
      eventType: "Nikah",
      eventDate: "14 August 2026",
      eventTime: "10:00 am - 1:00 pm",
      eventLocation: "Cyberjaya",
      packageName: "Nikah Only",
      packagePrice: 180,
      addonsDescription: "Customized Template",
      addonsAmount: 10,
      depositPaid: 95,
      transportationNote: "Subject to location",
      notes: "Availability is subject to final confirmation.",
    });

    expect(pdf.subarray(0, 8).toString("utf8")).toBe("%PDF-1.4");
    expect(pdf.toString("utf8")).toContain("INVOICE");
    expect(pdf.toString("utf8")).toContain("AA-2026-001");
  });
});
