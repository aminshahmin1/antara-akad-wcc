import express, { type Request } from "express";
import path from "node:path";
import { checkAvailability } from "./src/availability.js";
import { loadBusinessConfig } from "./src/config.js";

const config = loadBusinessConfig();
const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static("public", { extensions: ["html"], maxAge: "1h" }));

app.get("/", (_request, response) => {
  response.sendFile(path.resolve("public/index.html"));
});

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    business: config.businessName,
    calendlyEnabled: Boolean(process.env.CALENDLY_ACCESS_TOKEN ?? process.env.CALENDLY_API_TOKEN),
  });
});

app.get("/api/availability", async (request: Request, response) => {
  const date = typeof request.query.date === "string" ? request.query.date.trim() : "";
  const result = await checkAvailability(config, date);
  response.status(result.status === "error" ? 503 : 200).json(result);
});

export default app;
