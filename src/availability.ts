import crypto from "node:crypto";
import type { BusinessConfig } from "./types.js";

export type AvailabilityStatus = "available" | "unavailable" | "error";

export interface AvailabilityResponse {
  status: AvailabilityStatus;
  date: string;
  source: "manual" | "google-calendar" | "calendly";
  reason?: string;
}

interface CalendarEvent {
  status?: string;
  transparency?: string;
}

interface CalendlyBusyTimesResponse {
  collection?: unknown[];
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function todayInMalaysia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateWindow(date: string) {
  return {
    timeMin: `${date}T00:00:00+08:00`,
    timeMax: `${date}T23:59:59+08:00`,
  };
}

function calendlyDateWindow(date: string) {
  return {
    startTime: `${date}T00:00:00+08:00`,
    endTime: `${date}T23:59:59+08:00`,
  };
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function getGoogleCredentials(): { calendarId: string; clientEmail: string; privateKey: string } | undefined {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const rawServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!calendarId || !rawServiceAccount) return undefined;

  const parsed = JSON.parse(rawServiceAccount) as { client_email?: unknown; private_key?: unknown };
  if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key.");
  }

  return {
    calendarId,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

async function getCalendlyUserUri(accessToken: string): Promise<string> {
  if (process.env.CALENDLY_USER_URI) return process.env.CALENDLY_USER_URI;

  const response = await fetch("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Calendly user lookup failed (${response.status}).`);

  const payload = (await response.json()) as { resource?: { uri?: unknown } };
  if (typeof payload.resource?.uri !== "string") throw new Error("Calendly user lookup did not include a user URI.");
  return payload.resource.uri;
}

async function hasCalendlyBusyTime(date: string): Promise<boolean | undefined> {
  const accessToken = process.env.CALENDLY_ACCESS_TOKEN ?? process.env.CALENDLY_API_TOKEN;
  if (!accessToken) return undefined;

  const user = await getCalendlyUserUri(accessToken);
  const { startTime, endTime } = calendlyDateWindow(date);
  const params = new URLSearchParams({
    user,
    start_time: startTime,
    end_time: endTime,
  });

  const response = await fetch(`https://api.calendly.com/user_busy_times?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Calendly busy-times check failed (${response.status}).`);

  const payload = (await response.json()) as CalendlyBusyTimesResponse;
  return Array.isArray(payload.collection) && payload.collection.length > 0;
}

async function getGoogleAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/calendar.events.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  );
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(privateKey, "base64url");
  const assertion = `${header}.${claim}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) throw new Error(`Google OAuth failed (${response.status}).`);
  const payload = (await response.json()) as { access_token?: unknown };
  if (typeof payload.access_token !== "string") throw new Error("Google OAuth response did not include an access token.");
  return payload.access_token;
}

async function fetchGoogleEvents(date: string): Promise<CalendarEvent[]> {
  const credentials = getGoogleCredentials();
  if (!credentials) return [];

  const token = await getGoogleAccessToken(credentials.clientEmail, credentials.privateKey);
  const { timeMin, timeMax } = dateWindow(date);
  const params = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    timeMin,
    timeMax,
    timeZone: "Asia/Kuala_Lumpur",
  });
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(credentials.calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) throw new Error(`Google Calendar events fetch failed (${response.status}).`);
  const payload = (await response.json()) as { items?: CalendarEvent[] };
  return Array.isArray(payload.items) ? payload.items : [];
}

function configuredBlockedDates(config: BusinessConfig): Set<string> {
  const fromConfig = config.availability?.blockedDates ?? [];
  const fromEnv = (process.env.ANTARA_AKAD_BLOCKED_DATES ?? "")
    .split(",")
    .map((date) => date.trim())
    .filter(Boolean);
  return new Set([...fromConfig, ...fromEnv].filter(isIsoDate));
}

function isBlockingEvent(event: CalendarEvent, blockingStatuses: Set<string>): boolean {
  if (event.transparency === "transparent") return false;
  return blockingStatuses.has(event.status ?? "confirmed");
}

export async function checkAvailability(config: BusinessConfig, date: string): Promise<AvailabilityResponse> {
  if (!isIsoDate(date)) return { status: "error", date, source: "manual", reason: "Invalid date." };
  if (date < todayInMalaysia()) return { status: "unavailable", date, source: "manual", reason: "Past dates are unavailable." };
  if (configuredBlockedDates(config).has(date)) return { status: "unavailable", date, source: "manual" };

  try {
    const calendlyHasBusyTime = await hasCalendlyBusyTime(date);
    if (typeof calendlyHasBusyTime === "boolean") {
      return {
        status: calendlyHasBusyTime ? "unavailable" : "available",
        date,
        source: "calendly",
      };
    }
  } catch (error) {
    console.error("Calendly availability check failed.", error);
    return { status: "error", date, source: "calendly", reason: "Calendly check failed." };
  }

  const googleCredentials = getGoogleCredentials();
  if (googleCredentials) {
    try {
      const blockingStatuses = new Set(config.availability?.blockingStatuses ?? ["confirmed"]);
      const events = await fetchGoogleEvents(date);
      return {
        status: events.some((event) => isBlockingEvent(event, blockingStatuses)) ? "unavailable" : "available",
        date,
        source: "google-calendar",
      };
    } catch (error) {
      console.error("Availability check failed.", error);
      return { status: "error", date, source: "google-calendar", reason: "Calendar check failed." };
    }
  }

  return {
    status: "available",
    date,
    source: "manual",
  };
}
