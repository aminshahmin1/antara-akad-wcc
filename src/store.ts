import { DatabaseSync } from "node:sqlite";
import type {
  ConversationSession,
  Inquiry,
  InquiryCustomerType,
  InquiryFilters,
} from "./types.js";

export interface SessionStore {
  get(phone: string): ConversationSession | undefined;
  save(session: ConversationSession): void;
  hasProcessed(messageId: string): boolean;
  markProcessed(messageId: string): void;
  listInquiries(filters?: InquiryFilters): Inquiry[];
  updateInquiryCustomerType(phone: string, customerType: InquiryCustomerType): Inquiry | undefined;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, ConversationSession>();
  private readonly processed = new Set<string>();
  private readonly inquiries = new Map<string, Inquiry>();

  get(phone: string): ConversationSession | undefined {
    return this.sessions.get(phone);
  }

  save(session: ConversationSession): void {
    this.sessions.set(session.phone, session);
    const existing = this.inquiries.get(session.phone);
    this.inquiries.set(session.phone, {
      phone: session.phone,
      name: session.profile.name,
      eventType: session.profile.eventType,
      customerType: existing?.customerType ?? "Follow Up",
      eventDate: session.profile.eventDate,
      eventMonth: toEventMonth(session.profile.eventDate),
      venue: session.profile.venue,
      durationHours: session.profile.durationHours,
      updatedAt: session.updatedAt,
    });
  }

  hasProcessed(messageId: string): boolean {
    return this.processed.has(messageId);
  }

  markProcessed(messageId: string): void {
    this.processed.add(messageId);
  }

  listInquiries(filters: InquiryFilters = {}): Inquiry[] {
    return [...this.inquiries.values()]
      .filter((item) => !filters.eventType || item.eventType === filters.eventType)
      .filter((item) => !filters.customerType || item.customerType === filters.customerType)
      .filter((item) => !filters.eventMonth || item.eventMonth === filters.eventMonth)
      .sort(compareInquiries);
  }

  updateInquiryCustomerType(phone: string, customerType: InquiryCustomerType): Inquiry | undefined {
    const inquiry = this.inquiries.get(phone);
    if (!inquiry) return undefined;
    const updated = { ...inquiry, customerType, updatedAt: new Date().toISOString() };
    this.inquiries.set(phone, updated);
    return updated;
  }
}

export class SqliteSessionStore implements SessionStore {
  private readonly db: DatabaseSync;

  constructor(filename = "data/agent.db") {
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        phone TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS processed_messages (
        message_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS inquiries (
        phone TEXT PRIMARY KEY,
        name TEXT,
        event_type TEXT CHECK (event_type IN ('Sanding', 'Nikah', 'Nikah + Sanding') OR event_type IS NULL),
        customer_type TEXT NOT NULL DEFAULT 'Follow Up' CHECK (customer_type IN ('Depo Paid', 'Follow Up')),
        event_date TEXT,
        event_month TEXT,
        venue TEXT,
        duration_hours INTEGER,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inquiries_event_type ON inquiries(event_type);
      CREATE INDEX IF NOT EXISTS idx_inquiries_customer_type ON inquiries(customer_type);
      CREATE INDEX IF NOT EXISTS idx_inquiries_event_month ON inquiries(event_month);
    `);
  }

  get(phone: string): ConversationSession | undefined {
    const row = this.db.prepare("SELECT payload FROM sessions WHERE phone = ?").get(phone) as
      | { payload: string }
      | undefined;
    return row ? (JSON.parse(row.payload) as ConversationSession) : undefined;
  }

  save(session: ConversationSession): void {
    this.db
      .prepare(`
        INSERT INTO sessions (phone, payload, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
      `)
      .run(session.phone, JSON.stringify(session), session.updatedAt);
    this.db
      .prepare(`
        INSERT INTO inquiries (
          phone, name, event_type, customer_type, event_date, event_month, venue, duration_hours, updated_at
        ) VALUES (?, ?, ?, 'Follow Up', ?, ?, ?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET
          name = excluded.name,
          event_type = excluded.event_type,
          event_date = excluded.event_date,
          event_month = excluded.event_month,
          venue = excluded.venue,
          duration_hours = excluded.duration_hours,
          updated_at = excluded.updated_at
      `)
      .run(
        session.phone,
        session.profile.name ?? null,
        session.profile.eventType ?? null,
        session.profile.eventDate ?? null,
        toEventMonth(session.profile.eventDate) ?? null,
        session.profile.venue ?? null,
        session.profile.durationHours ?? null,
        session.updatedAt,
      );
  }

  hasProcessed(messageId: string): boolean {
    return Boolean(
      this.db.prepare("SELECT 1 AS found FROM processed_messages WHERE message_id = ?").get(messageId),
    );
  }

  markProcessed(messageId: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO processed_messages (message_id, processed_at) VALUES (?, ?)")
      .run(messageId, new Date().toISOString());
  }

  listInquiries(filters: InquiryFilters = {}): Inquiry[] {
    const clauses: string[] = [];
    const parameters: string[] = [];
    if (filters.eventType) {
      clauses.push("event_type = ?");
      parameters.push(filters.eventType);
    }
    if (filters.customerType) {
      clauses.push("customer_type = ?");
      parameters.push(filters.customerType);
    }
    if (filters.eventMonth) {
      clauses.push("event_month = ?");
      parameters.push(filters.eventMonth);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM inquiries ${where} ORDER BY event_date IS NULL, event_date, updated_at DESC`)
      .all(...parameters) as unknown as InquiryRow[];
    return rows.map(toInquiry);
  }

  updateInquiryCustomerType(phone: string, customerType: InquiryCustomerType): Inquiry | undefined {
    const updatedAt = new Date().toISOString();
    const result = this.db
      .prepare("UPDATE inquiries SET customer_type = ?, updated_at = ? WHERE phone = ?")
      .run(customerType, updatedAt, phone);
    if (result.changes === 0) return undefined;
    const row = this.db.prepare("SELECT * FROM inquiries WHERE phone = ?").get(phone) as unknown as InquiryRow;
    return toInquiry(row);
  }
}

interface InquiryRow {
  phone: string;
  name: string | null;
  event_type: Inquiry["eventType"] | null;
  customer_type: InquiryCustomerType;
  event_date: string | null;
  event_month: string | null;
  venue: string | null;
  duration_hours: number | null;
  updated_at: string;
}

function toEventMonth(eventDate?: string): string | undefined {
  return eventDate ? `${eventDate.slice(5, 7)}/${eventDate.slice(0, 4)}` : undefined;
}

function toInquiry(row: InquiryRow): Inquiry {
  return {
    phone: row.phone,
    name: row.name ?? undefined,
    eventType: row.event_type ?? undefined,
    customerType: row.customer_type,
    eventDate: row.event_date ?? undefined,
    eventMonth: row.event_month ?? undefined,
    venue: row.venue ?? undefined,
    durationHours: row.duration_hours ?? undefined,
    updatedAt: row.updated_at,
  };
}

function compareInquiries(a: Inquiry, b: Inquiry): number {
  if (a.eventDate && b.eventDate) return a.eventDate.localeCompare(b.eventDate);
  if (a.eventDate) return -1;
  if (b.eventDate) return 1;
  return b.updatedAt.localeCompare(a.updatedAt);
}
