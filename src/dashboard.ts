import crypto from "node:crypto";
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { z } from "zod";

const SESSION_COOKIE = "antara_dashboard_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const HASH_ITERATIONS = 120_000;
const HASH_BYTES = 32;

type EnvLike = NodeJS.ProcessEnv;

const invoiceSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(40),
  issueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  clientName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40),
  eventType: z.string().trim().min(1).max(80),
  eventDate: z.string().trim().min(1).max(80),
  eventTime: z.string().trim().max(80).optional().default(""),
  eventLocation: z.string().trim().min(1).max(240),
  packageName: z.string().trim().min(1).max(120),
  packagePrice: z.coerce.number().min(0).max(999_999),
  addonsDescription: z.string().trim().max(500).optional().default(""),
  addonsAmount: z.coerce.number().min(0).max(999_999).default(0),
  depositPaid: z.coerce.number().min(0).max(999_999).default(0),
  transportationNote: z.string().trim().max(240).optional().default("Subject to location"),
  notes: z.string().trim().max(600).optional().default(""),
});

type InvoiceInput = z.infer<typeof invoiceSchema>;

export function registerDashboardRoutes(app: Express) {
  app.use(["/dashboard", "/api/dashboard"], noIndex);

  app.get("/dashboard", (request, response) => {
    if (!isDashboardConfigured()) {
      response.status(503).send(renderLoginPage("Dashboard is not configured yet."));
      return;
    }

    if (!isAuthenticated(request)) {
      response.status(401).send(renderLoginPage());
      return;
    }

    response.send(renderDashboardPage());
  });

  app.post("/dashboard/login", express.urlencoded({ extended: false, limit: "20kb" }), (request, response) => {
    if (!sameOrigin(request)) {
      response.sendStatus(403);
      return;
    }

    const username = typeof request.body?.username === "string" ? request.body.username : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";

    if (!verifyDashboardCredentials(username, password)) {
      response.status(401).send(renderLoginPage("Username or password is incorrect."));
      return;
    }

    response.cookie(SESSION_COOKIE, createDashboardSession(username), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_SECONDS * 1000,
      path: "/",
    });
    response.redirect(303, "/dashboard");
  });

  app.post("/dashboard/logout", requireDashboardAuth, (_request, response) => {
    response.clearCookie(SESSION_COOKIE, { path: "/" });
    response.redirect(303, "/dashboard");
  });

  app.post("/api/dashboard/invoice", requireDashboardAuth, (request, response) => {
    if (!sameOrigin(request)) {
      response.sendStatus(403);
      return;
    }

    const parsed = invoiceSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Please check the invoice details.",
        fields: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const pdf = generateInvoicePdf(parsed.data);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="${safeFilename(parsed.data.invoiceNumber)}.pdf"`);
    response.setHeader("Cache-Control", "no-store");
    response.send(pdf);
  });
}

export function hashDashboardPassword(password: string, saltBase64Url: string) {
  const salt = Buffer.from(saltBase64Url, "base64url");
  return crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_BYTES, "sha256").toString("base64url");
}

export function verifyDashboardCredentials(username: string, password: string, env: EnvLike = process.env) {
  const expectedUsername = env.DASHBOARD_USERNAME;
  const expectedHash = env.DASHBOARD_PASSWORD_HASH;
  const salt = env.DASHBOARD_PASSWORD_SALT;
  if (!expectedUsername || !expectedHash || !salt || !password) return false;
  if (!safeEqual(username, expectedUsername)) return false;
  return safeEqual(hashDashboardPassword(password, salt), expectedHash);
}

export function createDashboardSession(username: string, now = Date.now(), env: EnvLike = process.env) {
  const secret = env.DASHBOARD_SESSION_SECRET;
  if (!secret) throw new Error("DASHBOARD_SESSION_SECRET is required.");
  const payload = Buffer.from(JSON.stringify({ sub: username, exp: now + SESSION_MAX_AGE_SECONDS * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyDashboardSession(token: string | undefined, now = Date.now(), env: EnvLike = process.env) {
  if (!token || !env.DASHBOARD_SESSION_SECRET || !env.DASHBOARD_USERNAME) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expectedSignature = crypto.createHmac("sha256", env.DASHBOARD_SESSION_SECRET).update(payload).digest("base64url");
  if (!safeEqual(signature, expectedSignature)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: string; exp?: number };
    return session.sub === env.DASHBOARD_USERNAME && typeof session.exp === "number" && session.exp > now;
  } catch {
    return false;
  }
}

export function generateInvoicePdf(input: InvoiceInput) {
  const total = input.packagePrice + input.addonsAmount;
  const balance = Math.max(0, total - input.depositPaid);
  const ops: string[] = [];
  const add = (value: string) => ops.push(value);
  const text = (value: string, x: number, y: number, size = 10, font = "F1") => {
    add(`BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => add(`${x1} ${y1} m ${x2} ${y2} l S`);
  const rect = (x: number, y: number, width: number, height: number, fill = false) => {
    add(`${x} ${y} ${width} ${height} re ${fill ? "f" : "S"}`);
  };
  const money = (value: number) => `RM${new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(value)}`;

  add("0 0 0 rg");
  rect(0, 760, 595, 82, true);
  add("1 1 1 rg");
  text("AA", 42, 808, 14, "F2");
  text("ANTARA AKAD", 74, 814, 14, "F2");
  text("Wedding Content Creator", 74, 797, 10, "F1");
  text("INVOICE", 404, 794, 34, "F2");
  add("0 0 0 rg");

  text("Invoice No.", 42, 724, 9, "F2");
  text(input.invoiceNumber, 42, 708, 12, "F1");
  text("Issue Date", 178, 724, 9, "F2");
  text(formatDisplayDate(input.issueDate), 178, 708, 12, "F1");
  text("Due Date", 314, 724, 9, "F2");
  text(input.dueDate ? formatDisplayDate(input.dueDate) : "Upon confirmation", 314, 708, 12, "F1");
  line(42, 690, 553, 690);

  text("BILL TO", 42, 660, 10, "F2");
  text(input.clientName, 42, 642, 18, "F2");
  text(input.phone, 42, 624, 10, "F1");

  text("EVENT DETAILS", 314, 660, 10, "F2");
  let rightY = 642;
  rightY = wrappedText(`${input.eventType} - ${input.eventDate}`, 314, rightY, 210, 11, "F2", text);
  rightY = wrappedText(input.eventTime || "Time to be confirmed", 314, rightY - 3, 210, 10, "F1", text);
  wrappedText(input.eventLocation, 314, rightY - 3, 210, 10, "F1", text);

  rect(42, 492, 511, 88);
  add("0 0 0 rg");
  rect(42, 548, 511, 32, true);
  add("1 1 1 rg");
  text("DESCRIPTION", 58, 560, 10, "F2");
  text("AMOUNT", 486, 560, 10, "F2");
  add("0 0 0 rg");
  text(input.packageName, 58, 526, 12, "F2");
  text(money(input.packagePrice), 486, 526, 12, "F2");
  text(input.addonsDescription || "Add-ons / extras", 58, 504, 10, "F1");
  text(money(input.addonsAmount), 486, 504, 10, "F1");

  const totalY = 452;
  text("SUBTOTAL", 364, totalY, 10, "F2");
  text(money(total), 486, totalY, 12, "F2");
  text("DEPOSIT PAID", 364, totalY - 24, 10, "F2");
  text(money(input.depositPaid), 486, totalY - 24, 12, "F2");
  line(364, totalY - 38, 553, totalY - 38);
  text("BALANCE DUE", 364, totalY - 62, 12, "F2");
  text(money(balance), 486, totalY - 62, 16, "F2");

  text("TRANSPORTATION", 42, 396, 10, "F2");
  wrappedText(`${input.transportationNote || "Subject to location"} (not included unless stated).`, 42, 378, 250, 10, "F1", text);

  text("NOTES", 42, 332, 10, "F2");
  wrappedText(input.notes || "Availability and reservation are subject to final confirmation by Antara Akad.", 42, 314, 470, 10, "F1", text);

  line(42, 118, 553, 118);
  text("Thank you for choosing Antara Akad.", 42, 92, 12, "F2");
  text("This invoice is generated for request review and payment tracking.", 42, 76, 9, "F1");

  return buildPdf(ops.join("\n"));
}

function requireDashboardAuth(request: Request, response: Response, next: NextFunction) {
  if (!isAuthenticated(request)) {
    response.status(401).json({ error: "Dashboard login required." });
    return;
  }
  next();
}

function isDashboardConfigured(env: EnvLike = process.env) {
  return Boolean(env.DASHBOARD_USERNAME && env.DASHBOARD_PASSWORD_HASH && env.DASHBOARD_PASSWORD_SALT && env.DASHBOARD_SESSION_SECRET);
}

function isAuthenticated(request: Request) {
  return verifyDashboardSession(readCookie(request, SESSION_COOKIE));
}

function readCookie(request: Request, name: string) {
  const header = request.header("cookie");
  if (!header) return undefined;
  const cookies = header.split(";").map((item) => item.trim());
  const match = cookies.find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function sameOrigin(request: Request) {
  const origin = request.header("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.header("host");
  } catch {
    return false;
  }
}

function noIndex(_request: Request, response: Response, next: NextFunction) {
  response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.setHeader("Cache-Control", "no-store");
  next();
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "antara-akad-invoice";
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("en-MY", { day: "2-digit", month: "long", year: "numeric" }).format(
    new Date(`${value}T00:00:00+08:00`),
  );
}

function wrappedText(
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: string,
  text: (value: string, x: number, y: number, size?: number, font?: string) => void,
) {
  const maxChars = Math.max(12, Math.floor(maxWidth / (size * 0.52)));
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  for (const item of lines.slice(0, 6)) {
    text(item, x, y, size, font);
    y -= size + 5;
  }
  return y;
}

function pdfEscape(value: string) {
  return value.replace(/[\\()]/g, "\\$&").replace(/\r?\n/g, " ");
}

function buildPdf(content: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function renderLoginPage(error = "") {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <title>Antara Akad Operator</title>
    ${dashboardStyle()}
  </head>
  <body>
    <main class="operator-stage">
      <section class="operator-shell login-shell">
        <div class="brand-row"><span class="aa-mark">AA</span><div><strong>ANTARA AKAD</strong><small>Operator Access</small></div></div>
        <p class="eyebrow">Private dashboard</p>
        <h1>OPERATOR<br />LOGIN</h1>
        <form class="operator-form" method="post" action="/dashboard/login">
          <label>Username<input name="username" autocomplete="username" required /></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
          ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
          <button type="submit">LOGIN</button>
        </form>
      </section>
    </main>
  </body>
</html>`;
}

function renderDashboardPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <title>Antara Akad | Invoice Generator</title>
    ${dashboardStyle()}
  </head>
  <body>
    <main class="operator-stage">
      <section class="operator-shell dashboard-shell">
        <header class="dashboard-header">
          <div class="brand-row"><span class="aa-mark">AA</span><div><strong>ANTARA AKAD</strong><small>Invoice Generator</small></div></div>
          <form method="post" action="/dashboard/logout"><button class="ghost" type="submit">LOGOUT</button></form>
        </header>
        <div class="dashboard-grid">
          <form class="operator-form invoice-form" id="invoice-form">
            <p class="eyebrow">Create PDF invoice</p>
            <h1>INVOICE<br />BUILDER</h1>
            <div class="field-pair">
              <label>Invoice No.<input name="invoiceNumber" value="AA-${new Date().getFullYear()}-001" required /></label>
              <label>Issue Date<input name="issueDate" type="date" required /></label>
            </div>
            <label>Due Date<input name="dueDate" type="date" /></label>
            <div class="field-pair">
              <label>Client Name<input name="clientName" required /></label>
              <label>Phone<input name="phone" inputmode="tel" required /></label>
            </div>
            <div class="field-pair">
              <label>Event Type<input name="eventType" placeholder="Nikah / Sanding" required /></label>
              <label>Event Date<input name="eventDate" placeholder="14 August 2026" required /></label>
            </div>
            <label>Event Time<input name="eventTime" placeholder="10:00 am - 1:00 pm" /></label>
            <label>Event Location<textarea name="eventLocation" required></textarea></label>
            <div class="field-pair">
              <label>Package<input name="packageName" placeholder="Nikah Only" required /></label>
              <label>Package Price (RM)<input name="packagePrice" type="number" min="0" step="1" value="180" required /></label>
            </div>
            <label>Add-ons Description<textarea name="addonsDescription" placeholder="Customized Template, Highlight Reel"></textarea></label>
            <div class="field-pair">
              <label>Add-ons Amount (RM)<input name="addonsAmount" type="number" min="0" step="1" value="0" /></label>
              <label>Deposit Paid (RM)<input name="depositPaid" type="number" min="0" step="1" value="0" /></label>
            </div>
            <label>Transportation Note<input name="transportationNote" value="Subject to location" /></label>
            <label>Notes<textarea name="notes">Availability and reservation are subject to final confirmation by Antara Akad.</textarea></label>
            <div class="total-strip"><span>Estimated Balance</span><strong id="balance-preview">RM0</strong></div>
            <button type="submit">CREATE PDF INVOICE</button>
            <p class="status" id="invoice-status" role="status"></p>
          </form>
          <section class="preview-panel">
            <p class="eyebrow">Preview before download</p>
            <div class="preview-frame"><iframe id="invoice-preview" title="Invoice PDF preview"></iframe></div>
            <button class="ghost" id="download-invoice" type="button" disabled>DOWNLOAD PDF</button>
          </section>
        </div>
      </section>
    </main>
    <script>
      const form = document.getElementById("invoice-form");
      const statusEl = document.getElementById("invoice-status");
      const preview = document.getElementById("invoice-preview");
      const download = document.getElementById("download-invoice");
      const balancePreview = document.getElementById("balance-preview");
      let currentPdfUrl = "";
      let currentFilename = "antara-akad-invoice.pdf";

      form.elements.issueDate.valueAsDate = new Date();
      updateBalance();

      form.addEventListener("input", updateBalance);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        statusEl.textContent = "Creating invoice...";
        download.disabled = true;
        const body = Object.fromEntries(new FormData(form).entries());
        for (const key of ["packagePrice", "addonsAmount", "depositPaid"]) {
          body[key] = Number(body[key] || 0);
        }
        const response = await fetch("/api/dashboard/invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          statusEl.textContent = "Please check all required fields.";
          return;
        }
        const blob = await response.blob();
        if (currentPdfUrl) URL.revokeObjectURL(currentPdfUrl);
        currentPdfUrl = URL.createObjectURL(blob);
        currentFilename = (body.invoiceNumber || "antara-akad-invoice").replace(/[^a-z0-9-]+/gi, "-") + ".pdf";
        preview.src = currentPdfUrl;
        download.disabled = false;
        statusEl.textContent = "Invoice ready to review and download.";
      });

      download.addEventListener("click", () => {
        if (!currentPdfUrl) return;
        const link = document.createElement("a");
        link.href = currentPdfUrl;
        link.download = currentFilename;
        link.click();
      });

      function updateBalance() {
        const packagePrice = Number(form.elements.packagePrice.value || 0);
        const addonsAmount = Number(form.elements.addonsAmount.value || 0);
        const depositPaid = Number(form.elements.depositPaid.value || 0);
        const balance = Math.max(0, packagePrice + addonsAmount - depositPaid);
        balancePreview.textContent = "RM" + new Intl.NumberFormat("en-MY", { maximumFractionDigits: 0 }).format(balance);
      }
    </script>
  </body>
</html>`;
}

function dashboardStyle() {
  return `<style>
    :root{--outer:#140f0b;--paper:#fff;--black:#000;--cream:#eadbc3;--line:rgba(0,0,0,.16);--champagne:#c4a770;--ink:#3a342f;--serif:Didot,"Bodoni 72","Times New Roman",serif;--sans-bold:"Arial Black","Helvetica Neue",Arial,sans-serif;--sans:"Helvetica Neue",Arial,sans-serif}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--outer);font-family:var(--sans);color:var(--black)}button,input,textarea{font:inherit}button{cursor:pointer}
    .operator-stage{min-height:100vh;display:grid;place-items:center;padding:18px;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:22px 22px}
    .operator-shell{width:min(100%,980px);background:var(--paper);box-shadow:0 24px 60px rgba(0,0,0,.28);border-radius:28px;padding:22px}.login-shell{max-width:430px}
    .brand-row{display:flex;align-items:center;gap:10px;margin-bottom:28px}.aa-mark{display:grid;place-items:center;width:36px;height:36px;border:1px solid currentColor;border-radius:50%;font-family:var(--serif);font-weight:700}.brand-row strong,.eyebrow,label,.total-strip span,button{font-family:var(--sans-bold);font-size:12px}.brand-row small{display:block;color:var(--ink);margin-top:3px}.eyebrow{margin:0 0 10px;color:var(--champagne);text-transform:uppercase}
    h1{margin:0 0 22px;font-family:var(--serif);font-size:clamp(48px,10vw,76px);line-height:.78;text-transform:uppercase}.dashboard-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.dashboard-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.9fr);gap:20px}.operator-form{display:grid;gap:12px}.field-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    label{display:grid;gap:7px}input,textarea{width:100%;min-height:46px;border:1px solid var(--line);border-radius:16px;padding:12px 14px;background:#fff}textarea{min-height:84px;resize:vertical}input:focus,textarea:focus{outline:2px solid var(--champagne);outline-offset:2px}
    button{min-height:48px;border:0;border-radius:999px;background:var(--black);color:var(--paper);padding:0 18px}.ghost{background:transparent;color:var(--black);border:1px solid var(--line)}.error,.status{margin:0;color:#b72e2a;font-size:13px}.status{color:var(--ink)}
    .total-strip{display:flex;justify-content:space-between;align-items:center;border-radius:20px;background:#f6f1ea;padding:16px}.total-strip strong{font-family:var(--sans-bold);font-size:24px}.preview-panel{display:grid;gap:12px;align-content:start}.preview-frame{height:640px;border:1px solid var(--line);border-radius:24px;overflow:hidden;background:#f6f1ea}.preview-frame iframe{width:100%;height:100%;border:0}
    @media (max-width:760px){.operator-stage{place-items:start center;padding:0}.operator-shell{min-height:100vh;border-radius:0}.dashboard-grid,.field-pair{grid-template-columns:1fr}.preview-frame{height:520px}}
  </style>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char] ?? char);
}
