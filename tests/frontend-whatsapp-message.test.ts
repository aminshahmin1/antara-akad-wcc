import fs from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function buildFrontendMessage(): string {
  const source = fs.readFileSync("public/app.js", "utf8").split("\ndocument.addEventListener")[0]!;
  const context = {
    Intl,
    sessionStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  };

  vm.runInNewContext(
    `${source}
state = {
  stepId: "summary",
  data: {
    eventType: "Sanding",
    eventLocation: "Dewan Melati, Shah Alam",
    eventDate: "2026-12-13",
    startTime: "10:30",
    endTime: "14:30",
    makeup: "YES",
    makeupLocation: "Makeup Studio",
    outdoor: "NO",
    outdoorLocation: "",
    name: "Sarah",
    phone: "+60123456789",
  },
  selectedPackageId: "sanding",
  addons: {
    template: true,
    highlight: true,
    extraHours: 2,
    transportAck: true,
  },
  availability: { status: "available", date: "2026-12-13", source: "calendly" },
};
globalThis.whatsAppMessage = buildWhatsAppMessage(false);
globalThis.whatsAppUrl = "https://wa.me/" + BUSINESS_CONFIG.whatsapp + "?text=" + encodeURIComponent(globalThis.whatsAppMessage);
`,
    context,
  );

  return context.whatsAppMessage as string;
}

describe("frontend WhatsApp message template", () => {
  it("uses the requested emoji template and remains URL-encodable", () => {
    const message = buildFrontendMessage();
    const decoded = decodeURIComponent(
      `https://wa.me/60145959752?text=${encodeURIComponent(message)}`.split("text=")[1]!,
    );

    expect(decoded).toBe(message);
    expect(message).toContain("Hi awak! 🤍");
    expect(message).toContain("🔗 https://canva.link/b0bny2khpxyc7xx");
    expect(message).toContain("👰🏻‍♀️ Name: Sarah");
    expect(message).toContain("📱 Phone number: +60123456789");
    expect(message).toContain("💍 Event type: Sanding");
    expect(message).toContain("🗓️ Event date: 13 December 2026");
    expect(message).toContain("🕣 Start event time: 10:30 am");
    expect(message).toContain("🕜 End event time: 2:30 pm");
    expect(message).toContain("📍 Makeup location: Makeup Studio");
    expect(message).toContain("📍 Outdoor photoshoot location: N/A");
    expect(message).toContain("📍 Event location: Dewan Melati, Shah Alam");
    expect(message).toContain("Pakej yang saya pilih:\n\n🤍 Sanding Only\nRM240");
    expect(message).toContain("Add-ons:\nCustomized Template - RM10\n1-Min Highlight Reel - RM50\nExtra Hour × 2 - RM120");
    expect(message).toContain("Estimated Total:\nRM420");
  });
});
