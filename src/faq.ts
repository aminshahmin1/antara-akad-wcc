import type { BusinessConfig, FaqEntry } from "./types.js";

const STOP_WORDS = new Set(["a", "an", "and", "are", "can", "do", "for", "how", "i", "is", "it", "of", "the", "to", "we", "what", "when", "you"]);

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

export function findFaq(config: BusinessConfig, message: string): FaqEntry | undefined {
  const normalized = message.toLowerCase();
  const messageTokens = tokens(message);

  const ranked = config.faqs
    .map((faq) => {
      const phraseHit = faq.keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
      const faqTokens = tokens(`${faq.question} ${faq.keywords.join(" ")}`);
      const overlap = [...messageTokens].filter((token) => faqTokens.has(token)).length;
      return { faq, score: (phraseHit ? 10 : 0) + overlap };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0] && ranked[0].score >= 2 ? ranked[0].faq : undefined;
}
