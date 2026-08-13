export type ConversationStage =
  | "new"
  | "awaiting_name"
  | "awaiting_event_type"
  | "awaiting_date"
  | "awaiting_venue"
  | "awaiting_hours"
  | "quoted"
  | "human_handoff";

export interface CustomerProfile {
  name?: string;
  packageId?: string;
  eventType?: InquiryEventType;
  eventDate?: string;
  venue?: string;
  durationHours?: number;
}

export interface ConversationSession {
  phone: string;
  stage: ConversationStage;
  profile: CustomerProfile;
  updatedAt: string;
}

export interface ServicePackage {
  id: string;
  name: string;
  inquiryEventType: InquiryEventType;
  keywords: string[];
  includedHours: number;
  basePrice: number;
  extraHourPrice: number;
  description: string;
}

export type InquiryEventType = "Sanding" | "Nikah" | "Nikah + Sanding";
export type InquiryCustomerType = "Depo Paid" | "Follow Up";

export interface Inquiry {
  phone: string;
  name?: string;
  eventType?: InquiryEventType;
  customerType: InquiryCustomerType;
  eventDate?: string;
  eventMonth?: string;
  venue?: string;
  durationHours?: number;
  updatedAt: string;
}

export interface InquiryFilters {
  eventType?: InquiryEventType;
  customerType?: InquiryCustomerType;
  eventMonth?: string;
}

export interface FaqEntry {
  question: string;
  keywords: string[];
  answer: string;
}

export interface BusinessConfig {
  businessName: string;
  ownerName: string;
  currency: "MYR";
  timezone: string;
  serviceArea: string;
  greeting: string;
  handoffMessage: string;
  quoteDisclaimer: string;
  availability?: {
    blockedDates?: string[];
    blockingStatuses?: string[];
  };
  packages: ServicePackage[];
  faqs: FaqEntry[];
}

export interface AgentReply {
  text: string;
  handoff?: boolean;
  quote?: {
    packageName: string;
    total: number;
  };
}
