import { checkAvailability } from "../src/availability.js";
import { loadBusinessConfig } from "../src/config.js";

type AvailabilityRequest = {
  method?: string;
  query: Record<string, string | string[] | undefined>;
};

type AvailabilityResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): AvailabilityResponse;
  json(body: unknown): void;
};

const config = loadBusinessConfig();

export default async function handler(request: AvailabilityRequest, response: AvailabilityResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ status: "error", reason: "Method not allowed." });
    return;
  }

  const date = typeof request.query.date === "string" ? request.query.date.trim() : "";
  const result = await checkAvailability(config, date);
  response.status(result.status === "error" ? 503 : 200).json(result);
}
