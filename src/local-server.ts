import "dotenv/config";
import fs from "node:fs";
import express, { type Request } from "express";
import { OpenAiKnowledgeAnswerer } from "./ai.js";
import { WeddingContentAgent } from "./agent.js";
import { checkAvailability } from "./availability.js";
import { loadBusinessConfig } from "./config.js";
import { registerDashboardRoutes } from "./dashboard.js";
import { SqliteSessionStore } from "./store.js";
import { extractTextMessages, isValidMetaSignature, sendWhatsAppText } from "./whatsapp.js";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

fs.mkdirSync("data", { recursive: true });
const config = loadBusinessConfig();
const store = new SqliteSessionStore();
const answerer = process.env.OPENAI_API_KEY
  ? new OpenAiKnowledgeAnswerer(config)
  : undefined;
const agent = new WeddingContentAgent(config, store, answerer);

export const app = express();
app.use(
  express.json({
    limit: "1mb",
    verify: (request: Request, _response, buffer) => {
      request.rawBody = Buffer.from(buffer);
    },
  }),
);

app.get("/health", (_request, response) => {
  response.json({ ok: true, business: config.businessName, aiEnabled: Boolean(answerer) });
});

registerDashboardRoutes(app);
app.use(express.static("public", { extensions: ["html"], maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));

app.get("/api/availability", async (request, response) => {
  const date = typeof request.query.date === "string" ? request.query.date.trim() : "";
  if (process.env.NODE_ENV !== "production" && request.query.simulate === "error") {
    response.status(503).json({ status: "error", date, source: "manual", reason: "Simulated calendar failure." });
    return;
  }

  const result = await checkAvailability(config, date);
  response.status(result.status === "error" ? 503 : 200).json(result);
});

app.get("/webhook", (request, response) => {
  const mode = request.query["hub.mode"];
  const token = request.query["hub.verify_token"];
  const challenge = request.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && typeof challenge === "string") {
    response.status(200).send(challenge);
    return;
  }
  response.sendStatus(403);
});

app.post("/webhook", async (request, response) => {
  if (
    !isValidMetaSignature(
      request.rawBody ?? Buffer.alloc(0),
      request.header("x-hub-signature-256"),
      process.env.META_APP_SECRET,
    )
  ) {
    response.sendStatus(401);
    return;
  }

  // Acknowledge Meta immediately; processing continues in this request lifecycle.
  response.sendStatus(200);
  for (const message of extractTextMessages(request.body)) {
    if (store.hasProcessed(message.id)) continue;
    try {
      const reply = await agent.handleMessage(message.from, message.text);
      await sendWhatsAppText(message.from, reply.text);
      store.markProcessed(message.id);
      if (reply.handoff) {
        console.info(`Human handoff requested by ${message.from}`);
      }
    } catch (error) {
      console.error(`Failed to process WhatsApp message ${message.id}`, error);
    }
  }
});

if (process.env.NODE_ENV !== "production" || process.env.ENABLE_SIMULATOR === "true") {
  app.post("/api/simulate", async (request, response) => {
    const phone = typeof request.body?.phone === "string" ? request.body.phone.trim() : "";
    const message = typeof request.body?.message === "string" ? request.body.message.trim() : "";
    if (!phone || !message) {
      response.status(400).json({ error: "phone and message are required" });
      return;
    }
    response.json(await agent.handleMessage(phone, message));
  });
}

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`WhatsApp wedding agent listening on http://localhost:${port}`);
  });
}

export default app;
