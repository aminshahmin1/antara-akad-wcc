import {
  DASHBOARD_SESSION_COOKIE,
  generateInvoicePdf,
  parseInvoiceInput,
  safeInvoiceFilename,
  verifyDashboardSession,
} from "../../src/dashboard.js";

type DashboardInvoiceRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type DashboardInvoiceResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): DashboardInvoiceResponse;
  json(body: unknown): void;
  send(body: Buffer | string): void;
};

export default async function handler(request: DashboardInvoiceRequest, response: DashboardInvoiceResponse) {
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  if (!sameOrigin(request)) {
    response.status(403).json({ error: "Request origin is not allowed." });
    return;
  }

  if (!verifyDashboardSession(readCookie(request.headers.cookie, DASHBOARD_SESSION_COOKIE))) {
    response.status(401).json({ error: "Dashboard login required." });
    return;
  }

  const parsedBody = parseJsonBody(request.body);
  if (!parsedBody.ok) {
    response.status(400).json({ error: "Please send valid invoice details." });
    return;
  }

  const parsed = parseInvoiceInput(parsedBody.value);
  if (!parsed.success) {
    response.status(400).json({
      error: "Please check the invoice details.",
      fields: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const pdf = generateInvoicePdf(parsed.data);
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", `inline; filename="${safeInvoiceFilename(parsed.data.invoiceNumber)}.pdf"`);
  response.send(pdf);
}

function parseJsonBody(body: unknown): { ok: true; value: unknown } | { ok: false } {
  if (typeof body === "string") {
    try {
      return { ok: true, value: JSON.parse(body) };
    } catch {
      return { ok: false };
    }
  }

  if (Buffer.isBuffer(body)) {
    try {
      return { ok: true, value: JSON.parse(body.toString("utf8")) };
    } catch {
      return { ok: false };
    }
  }

  return { ok: true, value: body ?? {} };
}

function sameOrigin(request: DashboardInvoiceRequest) {
  const origin = firstHeader(request.headers.origin);
  if (!origin) return true;

  try {
    return new URL(origin).host === firstHeader(request.headers.host);
  } catch {
    return false;
  }
}

function readCookie(header: string | string[] | undefined, name: string) {
  const value = firstHeader(header);
  if (!value) return undefined;

  const cookies = value.split(";").map((item) => item.trim());
  const match = cookies.find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function firstHeader(header: string | string[] | undefined) {
  return Array.isArray(header) ? header[0] : header;
}
