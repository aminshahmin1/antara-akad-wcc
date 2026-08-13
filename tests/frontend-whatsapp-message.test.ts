import fs from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function buildFrontendMessage(overrides = ""): string {
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
${overrides}
globalThis.whatsAppMessage = buildWhatsAppMessage(false);
globalThis.whatsAppUrl = "https://wa.me/" + BUSINESS_CONFIG.whatsapp + "?text=" + encodeURIComponent(globalThis.whatsAppMessage);
`,
    context,
  );

  return context.whatsAppMessage as string;
}

describe("frontend WhatsApp message template", () => {
  it("uses the requested bullet template and remains URL-encodable", () => {
    const message = buildFrontendMessage();
    const decoded = decodeURIComponent(
      `https://wa.me/60145959752?text=${encodeURIComponent(message)}`.split("text=")[1]!,
    );

    expect(decoded).toBe(message);
    expect(message).toBe(
      [
        "Hi awak! ",
        "",
        "Terima kasih sebab berminat dengan service WCC by Antara Akad.",
        "Untuk pakej dan details service, awak boleh refer pada link di bawah:",
        "- [https://canva.link/b0bny2khpxyc7xx](https://canva.link/b0bny2khpxyc7xx)",
        "  ",
        "Ini details event saya:",
        "- Name: Sarah",
        "- Phone number: +60123456789",
        "- Event type: Sanding",
        "- Event date: 13 December 2026",
        "- Start event time: 10:30 am",
        "- End event time: 2:30 pm",
        "- Makeup location: Makeup Studio",
        "- Outdoor photoshoot location: N/A",
        "- Event location: Dewan Melati, Shah Alam",
        "",
        "Pakej yang saya pilih:",
        "- Sanding Only",
        "- RM240",
        "Add-ons:",
        "- Customized Template - RM10, 1-Min Highlight Reel - RM50, Extra Hour × 2 - RM120",
        "Estimated Total:",
        "- RM420 + Transportation Fee",
      ].join("\n"),
    );
  });

  it("keeps the exact Nikah no-add-ons template requested by the business", () => {
    const message = buildFrontendMessage(`
state.data = {
  ...state.data,
  eventType: "Nikah",
  eventLocation: "asda",
  eventDate: "2026-08-14",
  startTime: "11:09",
  endTime: "23:09",
  makeup: "NO",
  makeupLocation: "",
  outdoor: "NO",
  outdoorLocation: "",
  name: "Sarah",
  phone: "+601136296459",
};
state.selectedPackageId = "nikah";
state.addons = {
  template: false,
  highlight: false,
  extraHours: 0,
  transportAck: true,
};
`);

    expect(message).toBe(
      [
        "Hi awak! ",
        "",
        "Terima kasih sebab berminat dengan service WCC by Antara Akad.",
        "Untuk pakej dan details service, awak boleh refer pada link di bawah:",
        "- [https://canva.link/b0bny2khpxyc7xx](https://canva.link/b0bny2khpxyc7xx)",
        "  ",
        "Ini details event saya:",
        "- Name: Sarah",
        "- Phone number: +601136296459",
        "- Event type: Nikah",
        "- Event date: 14 August 2026",
        "- Start event time: 11:09 am",
        "- End event time: 11:09 pm",
        "- Makeup location: N/A",
        "- Outdoor photoshoot location: N/A",
        "- Event location: asda",
        "",
        "Pakej yang saya pilih:",
        "- Nikah Only",
        "- RM180",
        "Add-ons:",
        "- N/A",
        "Estimated Total:",
        "- RM180 + Transportation Fee",
      ].join("\n"),
    );
  });
});
