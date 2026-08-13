import { OpenAI } from "openai";
import type { BusinessConfig } from "./types.js";

export interface KnowledgeAnswerer {
  answer(message: string): Promise<string | undefined>;
}

export class OpenAiKnowledgeAnswerer implements KnowledgeAnswerer {
  private readonly client: OpenAI;

  constructor(
    private readonly config: BusinessConfig,
    apiKey = process.env.OPENAI_API_KEY,
    private readonly model = process.env.OPENAI_MODEL ?? "gpt-5.5",
  ) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required to enable AI answers.");
    this.client = new OpenAI({ apiKey });
  }

  async answer(message: string): Promise<string | undefined> {
    const knowledge = this.config.faqs
      .map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`)
      .join("\n\n");

    const response = await this.client.responses.create({
      model: this.model,
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      instructions: [
        `You are the WhatsApp assistant for ${this.config.businessName}, a wedding content creator in Malaysia.`,
        "Answer warmly and concisely using only the supplied business knowledge.",
        "Never invent prices, availability, policies, deliverables, or timelines.",
        "If the knowledge does not fully answer the question, output exactly HANDOFF.",
        "Do not claim that a booking or date is confirmed.",
      ].join(" "),
      input: `Business knowledge:\n${knowledge}\n\nCustomer question:\n${message}`,
    });

    const answer = response.output_text.trim();
    return !answer || answer === "HANDOFF" ? undefined : answer;
  }
}
