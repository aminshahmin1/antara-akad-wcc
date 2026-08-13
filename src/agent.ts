import type { KnowledgeAnswerer } from "./ai.js";
import { findFaq } from "./faq.js";
import { calculateQuote, formatRinggit } from "./quote.js";
import type { SessionStore } from "./store.js";
import type { AgentReply, BusinessConfig, ConversationSession, ConversationStage } from "./types.js";

const HUMAN_WORDS = ["human", "owner", "person", "call me", "talk to someone", "speak to someone"];

function containsAny(message: string, values: string[]): boolean {
  const normalized = message.toLowerCase();
  return values.some((value) => normalized.includes(value));
}

function findPackage(config: BusinessConfig, message: string) {
  const normalized = message.toLowerCase();
  return config.packages.find((item) =>
    item.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())),
  );
}

function parseDate(message: string): string | undefined {
  const value = message.trim();
  const iso = value.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  const local = value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
  const parts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : local
      ? [Number(local[3]), Number(local[2]), Number(local[1])]
      : undefined;
  if (!parts) return undefined;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
    return undefined;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseHours(message: string): number | undefined {
  const match = message.match(/\b(\d{1,2})(?:\.\d+)?\s*(?:hours?|hrs?|h)?\b/i);
  const hours = match ? Number(match[1]) : Number.NaN;
  return Number.isInteger(hours) && hours >= 1 && hours <= 24 ? hours : undefined;
}

function promptForStage(stage: ConversationStage, config: BusinessConfig): string {
  switch (stage) {
    case "awaiting_name":
      return "May I have your name?";
    case "awaiting_event_type":
      return `Which event are you planning?\n${config.packages.map((item) => `• ${item.name}`).join("\n")}`;
    case "awaiting_date":
      return "What is the event date? Please use DD/MM/YYYY.";
    case "awaiting_venue":
      return "What is the venue and city?";
    case "awaiting_hours":
      return "How many hours of content coverage would you like?";
    default:
      return "How can I help?";
  }
}

function quoteReply(config: BusinessConfig, session: ConversationSession): AgentReply {
  const quote = calculateQuote(config, session.profile);
  const details = [
    `Estimated quotation for ${session.profile.name}`,
    "",
    `Package: ${quote.servicePackage.name}`,
    `Event date: ${session.profile.eventDate}`,
    `Venue: ${session.profile.venue}`,
    `Coverage: ${session.profile.durationHours} hours`,
    `Package rate: ${formatRinggit(quote.servicePackage.basePrice)}`,
  ];
  if (quote.extraHours > 0) {
    details.push(
      `Additional coverage: ${quote.extraHours} hour(s) × ${formatRinggit(quote.servicePackage.extraHourPrice)}`,
    );
  }
  details.push("", `Estimated total: ${formatRinggit(quote.total)}`, "", config.quoteDisclaimer);
  details.push("", "Reply *human* if you’d like the owner to confirm availability and next steps.");
  return {
    text: details.join("\n"),
    quote: { packageName: quote.servicePackage.name, total: quote.total },
  };
}

export class WeddingContentAgent {
  constructor(
    private readonly config: BusinessConfig,
    private readonly store: SessionStore,
    private readonly answerer?: KnowledgeAnswerer,
  ) {}

  async handleMessage(phone: string, rawMessage: string): Promise<AgentReply> {
    const message = rawMessage.trim();
    let session = this.store.get(phone);

    if (!session || /^restart$/i.test(message)) {
      session = {
        phone,
        stage: "awaiting_name",
        profile: {},
        updatedAt: new Date().toISOString(),
      };
      this.store.save(session);
      return { text: `${this.config.greeting}\n\n${promptForStage(session.stage, this.config)}` };
    }

    if (containsAny(message, HUMAN_WORDS)) {
      session.stage = "human_handoff";
      session.updatedAt = new Date().toISOString();
      this.store.save(session);
      return { text: this.config.handoffMessage, handoff: true };
    }

    if (session.stage === "human_handoff") {
      return { text: this.config.handoffMessage, handoff: true };
    }

    const faq = findFaq(this.config, message);
    if (faq) {
      return { text: `${faq.answer}\n\n${promptForStage(session.stage, this.config)}` };
    }

    switch (session.stage) {
      case "awaiting_name": {
        if (message.length < 2 || message.length > 60 || /\d/.test(message)) {
          return { text: "I didn’t quite catch the name. May I have your name?" };
        }
        session.profile.name = message;
        session.stage = "awaiting_event_type";
        break;
      }
      case "awaiting_event_type": {
        const servicePackage = findPackage(this.config, message);
        if (!servicePackage) return { text: promptForStage(session.stage, this.config) };
        session.profile.packageId = servicePackage.id;
        session.profile.eventType = servicePackage.inquiryEventType;
        session.stage = "awaiting_date";
        break;
      }
      case "awaiting_date": {
        const eventDate = parseDate(message);
        if (!eventDate) return { text: "Please send the event date as DD/MM/YYYY (for example, 20/12/2026)." };
        session.profile.eventDate = eventDate;
        session.stage = "awaiting_venue";
        break;
      }
      case "awaiting_venue":
        if (message.length < 3 || message.length > 160) return { text: "Please send the venue name and city." };
        session.profile.venue = message;
        session.stage = "awaiting_hours";
        break;
      case "awaiting_hours": {
        const hours = parseHours(message);
        if (!hours) return { text: "Please send a whole number from 1 to 24 for the coverage hours." };
        session.profile.durationHours = hours;
        session.stage = "quoted";
        session.updatedAt = new Date().toISOString();
        this.store.save(session);
        return quoteReply(this.config, session);
      }
      case "quoted":
        if (/\b(quote|quotation|price|package)\b/i.test(message)) return quoteReply(this.config, session);
        if (this.answerer) {
          try {
            const answer = await this.answerer.answer(message);
            if (answer) return { text: answer };
          } catch (error) {
            console.error("AI answer failed; handing off safely.", error);
          }
        }
        session.stage = "human_handoff";
        session.updatedAt = new Date().toISOString();
        this.store.save(session);
        return { text: this.config.handoffMessage, handoff: true };
    }

    session.updatedAt = new Date().toISOString();
    this.store.save(session);
    return { text: promptForStage(session.stage, this.config) };
  }
}
