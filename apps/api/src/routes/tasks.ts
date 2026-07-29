import type { FastifyInstance } from "fastify";
import fs from "fs/promises";
import path from "path";
import { prisma } from "../db/client.js";
import { eventBus } from "../services/event-bus.js";
import { runTask } from "../services/orchestrator.js";
import { CreateTaskSchema } from "@multi-agent/shared";
import type { AgentEvent, OpenRouterModel } from "@multi-agent/shared";

const DEFAULT_WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/tmp/multi-agent-workspace";

interface FileEntry {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
}

const IGNORED_DIRS = new Set(["node_modules", ".git", ".cache", "__pycache__", ".npm", "dist", ".next"]);
const IGNORED_FILES = /^(_tmp_|\.)/;

async function listDir(dir: string, rootDir: string): Promise<FileEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    if (!entry.isDirectory() && IGNORED_FILES.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(rootDir, full).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      const sub = await listDir(full, rootDir);
      results.push(...sub);
    } else {
      const stat = await fs.stat(full);
      results.push({ name: entry.name, relativePath: rel, size: stat.size, modifiedAt: stat.mtime.toISOString(), isDirectory: false });
    }
  }
  return results;
}

export async function tasksRoutes(app: FastifyInstance): Promise<void> {
  // GET /models — proxy OpenRouter model list (cached 5 min)
  let modelsCache: { data: OpenRouterModel[]; at: number } | null = null;

  app.get("/models", async (_req, reply) => {
    const now = Date.now();
    if (modelsCache && now - modelsCache.at < 5 * 60 * 1000) {
      return reply.send(modelsCache.data);
    }

    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
          "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
          "X-Title": "Multi-Agent System",
        },
      });

      if (!res.ok) {
        return reply.status(res.status).send({ error: "Failed to fetch models from OpenRouter" });
      }

      const json = (await res.json()) as { data: OpenRouterModel[] };
      modelsCache = { data: json.data, at: now };
      return reply.send(json.data);
    } catch (err) {
      app.log.error(err, "Failed to fetch OpenRouter models");
      return reply.status(502).send({ error: "Could not reach OpenRouter" });
    }
  });

  // POST /tasks — create and immediately start a task
  app.post("/tasks", async (req, reply) => {
    const parsed = CreateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { goal, tokenBudget, maxRunRetries, maxStepRetries, plannerModel, criticModel } =
      parsed.data;

    // Each task gets its own isolated workspace so users can see their own files
    const task = await prisma.task.create({
      data: { goal, tokenBudget, maxRunRetries, maxStepRetries, plannerModel, criticModel, workDir: "__pending__" },
    });
    const taskWorkDir = path.join(DEFAULT_WORKSPACE_ROOT, task.id);
    await prisma.task.update({ where: { id: task.id }, data: { workDir: taskWorkDir } });

    // Fire-and-forget orchestration (non-blocking)
    setImmediate(() => {
      runTask(task.id).catch((err: unknown) => {
        console.error(`Task ${task.id} orchestrator crashed:`, err);
      });
    });

    return reply.status(201).send(task);
  });

  // GET /tasks — list all tasks
  app.get("/tasks", async (_req, reply) => {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        runs: {
          orderBy: { attempt: "desc" },
          take: 1,
          include: { steps: { orderBy: { stepNumber: "asc" } } },
        },
      },
    });
    return reply.send(tasks);
  });

  // GET /tasks/:id — task detail
  app.get<{ Params: { id: string } }>("/tasks/:id", async (req, reply) => {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        runs: {
          orderBy: { attempt: "asc" },
          include: { steps: { orderBy: { stepNumber: "asc" } } },
        },
        logs: { orderBy: { createdAt: "asc" }, take: 500 },
      },
    });
    if (!task) return reply.status(404).send({ error: "Task not found" });
    return reply.send(task);
  });

  // PATCH /tasks/:id/cancel — cancel a running task without deleting it
  app.patch<{ Params: { id: string } }>("/tasks/:id/cancel", async (req, reply) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return reply.status(404).send({ error: "Task not found" });

    await prisma.task.update({ where: { id: req.params.id }, data: { status: "CANCELLED" } });
    eventBus.emitTaskEvent(req.params.id, { type: "task.completed", status: "CANCELLED" });
    return reply.send({ ok: true });
  });

  // DELETE /tasks/:id — permanently delete a task and all its data
  app.delete<{ Params: { id: string } }>("/tasks/:id", async (req, reply) => {
    const { id } = req.params;
    console.log(`[DELETE] /tasks/${id} hit — starting delete`);
    try {
      // Explicitly delete children first to work regardless of whether DB has CASCADE
      await prisma.taskLog.deleteMany({ where: { taskId: id } });
      const runs = await prisma.taskRun.findMany({ where: { taskId: id }, select: { id: true } });
      const runIds = runs.map((r: { id: string }) => r.id);
      if (runIds.length) await prisma.taskStep.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.taskRun.deleteMany({ where: { taskId: id } });
      await prisma.task.delete({ where: { id } });
      console.log(`[DELETE] /tasks/${id} — done`);
      return reply.send({ ok: true });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      console.error(`[DELETE] /tasks/${id} FAILED:`, err);
      if (e.code === "P2025") return reply.status(404).send({ error: "Task not found" });
      return reply.status(500).send({ error: e.message ?? "Delete failed" });
    }
  });

  // GET /tasks/:id/stream — SSE real-time event stream
  app.get<{ Params: { id: string } }>("/tasks/:id/stream", async (req, reply) => {
    const { id } = req.params;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return reply.status(404).send({ error: "Task not found" });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const sendEvent = (event: AgentEvent): void => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      if (reply.raw.destroyed) { clearInterval(heartbeat); return; }
      reply.raw.write(": heartbeat\n\n");
    }, 15000);

    const unsubscribe = eventBus.onTaskEvent(id, sendEvent);

    if (["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) {
      sendEvent({ type: "task.completed", status: task.status as "COMPLETED" | "FAILED" | "CANCELLED" });
    }

    req.raw.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
    await new Promise<void>((resolve) => { req.raw.on("close", resolve); });
  });

  // GET /tasks/:id/files — list workspace files
  app.get<{ Params: { id: string } }>("/tasks/:id/files", async (req, reply) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return reply.status(404).send({ error: "Task not found" });

    const workDir = task.workDir;
    try {
      const files = await listDir(workDir, workDir);
      return reply.send(files);
    } catch {
      return reply.send([]);
    }
  });

  // GET /tasks/:id/files/* — download or preview a workspace file
  app.get<{ Params: { id: string; "*": string } }>("/tasks/:id/files/*", async (req, reply) => {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return reply.status(404).send({ error: "Task not found" });

    const rel = req.params["*"];
    const resolved = path.resolve(task.workDir, rel);

    // Security: must stay inside workDir
    if (!resolved.startsWith(path.resolve(task.workDir))) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    try {
      const stat = await fs.stat(resolved);
      if (!stat.isFile()) return reply.status(400).send({ error: "Not a file" });

      const ext = path.extname(resolved).toLowerCase();
      const textTypes = new Set([".json", ".txt", ".md", ".csv", ".log", ".html", ".xml", ".yaml", ".yml", ".js", ".ts", ".py"]);
      const contentType = textTypes.has(ext) ? "text/plain; charset=utf-8" : "application/octet-stream";

      const content = await fs.readFile(resolved);
      reply.header("Content-Type", contentType);
      reply.header("Content-Disposition", `inline; filename="${path.basename(resolved)}"`);
      return reply.send(content);
    } catch {
      return reply.status(404).send({ error: "File not found" });
    }
  });

  // GET /tasks/:id/logs — fetch logs (REST fallback)
  app.get<{ Params: { id: string }; Querystring: { limit?: string; offset?: string } }>(
    "/tasks/:id/logs",
    async (req, reply) => {
      const limit = parseInt(req.query.limit ?? "200", 10);
      const offset = parseInt(req.query.offset ?? "0", 10);
      const logs = await prisma.taskLog.findMany({
        where: { taskId: req.params.id },
        orderBy: { createdAt: "asc" },
        take: Math.min(limit, 1000),
        skip: offset,
      });
      return reply.send(logs);
    },
  );
}
