import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkAvailability } from "../src/availability.js";
import { loadBusinessConfig } from "../src/config.js";

const config = loadBusinessConfig();

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ status: "error", reason: "Method not allowed." });
    return;
  }

  const date = typeof request.query.date === "string" ? request.query.date.trim() : "";
  const result = await checkAvailability(config, date);
  response.status(result.status === "error" ? 503 : 200).json(result);
}
