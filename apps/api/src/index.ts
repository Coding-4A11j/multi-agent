import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { tasksRoutes } from "./routes/tasks.js";
import { connectDB, disconnectDB } from "./db/client.js";
import { closeBrowser } from "./agents/workers/playwright.worker.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
        : undefined,
  },
  trustProxy: true,
});

async function bootstrap(): Promise<void> {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });

  await app.register(sensible);

  await app.register(rateLimit, {
    max: 500,
    timeWindow: "1 minute",
    skipOnError: true,
  });

  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    reply.status(error.statusCode ?? 500).send({
      error: error.message,
      statusCode: error.statusCode ?? 500,
    });
  });

  app.get("/health", async () => ({ ok: true, timestamp: new Date().toISOString() }));

  await app.register(tasksRoutes);

  await connectDB();
  await app.listen({ port: PORT, host: HOST });

  app.log.info(`API running at http://${HOST}:${PORT}`);
}

async function shutdown(): Promise<void> {
  app.log.info("Shutting down...");
  await app.close();
  await closeBrowser();
  await disconnectDB();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

bootstrap().catch((err: unknown) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
