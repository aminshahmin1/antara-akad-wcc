import { describe, expect, it } from "vitest";
import { WeddingContentAgent } from "../src/agent.js";
import { loadBusinessConfig } from "../src/config.js";
import { InMemorySessionStore } from "../src/store.js";

function makeAgent() {
  return new WeddingContentAgent(loadBusinessConfig(), new InMemorySessionStore());
}

describe("WeddingContentAgent", () => {
  it("collects customer details and creates a deterministic quote", async () => {
    const agent = makeAgent();
    const phone = "60123456789";

    expect((await agent.handleMessage(phone, "Hi")).text).toContain("May I have your name");
    expect((await agent.handleMessage(phone, "Aina")).text).toContain("Which event");
    expect((await agent.handleMessage(phone, "Wedding reception")).text).toContain("event date");
    expect((await agent.handleMessage(phone, "20/12/2026")).text).toContain("venue");
    expect((await agent.handleMessage(phone, "The Majestic Hotel, Kuala Lumpur")).text).toContain("How many hours");

    const quote = await agent.handleMessage(phone, "8 hours");
    expect(quote.text).toContain("Estimated total: RM480");
    expect(quote.quote).toEqual({ packageName: "Sanding Only", total: 480 });
  });

  it("answers a grounded FAQ while keeping the intake active", async () => {
    const agent = makeAgent();
    const phone = "60111111111";
    await agent.handleMessage(phone, "Hello");

    const reply = await agent.handleMessage(phone, "What does a content creator do?");
    expect(reply.text).toContain("behind-the-scenes");
    expect(reply.text).toContain("May I have your name");
  });

  it("hands the conversation to a person when requested", async () => {
    const agent = makeAgent();
    const phone = "60222222222";
    await agent.handleMessage(phone, "Hello");

    const reply = await agent.handleMessage(phone, "Can I speak to a human?");
    expect(reply.handoff).toBe(true);
  });
});
