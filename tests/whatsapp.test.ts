import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractTextMessages, isValidMetaSignature } from "../src/whatsapp.js";

describe("WhatsApp webhook utilities", () => {
  it("extracts text messages and ignores unsupported types", () => {
    const messages = extractTextMessages({
      entry: [{ changes: [{ value: { messages: [
        { id: "wamid.1", from: "60123", type: "text", text: { body: "Hello" } },
        { id: "wamid.2", from: "60123", type: "image" },
      ] } }] }],
    });
    expect(messages).toEqual([{ id: "wamid.1", from: "60123", text: "Hello" }]);
  });

  it("validates Meta's request signature", () => {
    const body = Buffer.from('{"hello":"world"}');
    const secret = "test-secret";
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(isValidMetaSignature(body, signature, secret)).toBe(true);
    expect(isValidMetaSignature(body, "sha256=bad", secret)).toBe(false);
  });
});
