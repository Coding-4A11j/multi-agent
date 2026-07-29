import fs from "fs/promises";
import path from "path";
import { BaseWorker, type WorkerContext } from "./base.js";
import type { WorkerResult } from "@multi-agent/shared";

interface FileParams {
  operation: "read" | "write" | "append" | "delete" | "list" | "exists" | "copy";
  path: string;
  content?: string;
  source?: string;
}

export class FileWorker extends BaseWorker {
  readonly name = "FILE_IO";

  async execute(parameters: Record<string, unknown>, ctx: WorkerContext): Promise<WorkerResult> {
    const p = parameters as unknown as FileParams;
    const target = this.resolvePath(p.path, ctx.workDir);

    try {
      switch (p.operation) {
        case "read": {
          const content = await fs.readFile(target, "utf-8");
          return this.ok(content, `Read ${content.length} bytes from ${p.path}`);
        }

        case "write": {
          await fs.mkdir(path.dirname(target), { recursive: true });
          const content = p.content ?? "";
          // If content looks like an absolute file path that exists, copy the file instead
          if (content.startsWith("/") || /^[A-Za-z]:\\/.test(content)) {
            const srcPath = content.trim();
            const srcExists = await fs.access(srcPath).then(() => true).catch(() => false);
            if (srcExists) {
              await fs.copyFile(srcPath, target);
              const stat = await fs.stat(target);
              return this.ok(null, `Copied ${srcPath} → ${p.path} (${stat.size} bytes)`);
            }
          }
          await fs.writeFile(target, content, "utf-8");
          return this.ok(null, `Wrote ${content.length} bytes to ${p.path}`);
        }

        case "copy": {
          const src = p.source ? this.resolvePath(p.source, ctx.workDir) : null;
          if (!src) return this.fail("source path required for copy operation");
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.copyFile(src, target);
          const stat = await fs.stat(target);
          return this.ok(null, `Copied ${p.source} → ${p.path} (${stat.size} bytes)`);
        }

        case "append": {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.appendFile(target, p.content ?? "", "utf-8");
          return this.ok(null, `Appended ${(p.content ?? "").length} bytes to ${p.path}`);
        }

        case "delete": {
          await fs.rm(target, { recursive: true, force: true });
          return this.ok(null, `Deleted ${p.path}`);
        }

        case "list": {
          const entries = await fs.readdir(target, { withFileTypes: true });
          const items = entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
          return this.ok(items, `Listed ${items.length} entries in ${p.path}`);
        }

        case "exists": {
          const exists = await fs
            .access(target)
            .then(() => true)
            .catch(() => false);
          return this.ok(exists, `${p.path} ${exists ? "exists" : "does not exist"}`);
        }

        default:
          return this.fail(`Unknown file operation: ${String(p.operation)}`);
      }
    } catch (err) {
      return this.fail(`File operation failed: ${(err as Error).message}`);
    }
  }

  private resolvePath(filePath: string, workDir: string): string {
    if (path.isAbsolute(filePath)) {
      // Restrict to work dir only for safety
      const resolved = path.resolve(filePath);
      const work = path.resolve(workDir);
      if (!resolved.startsWith(work)) {
        throw new Error(`Path "${filePath}" is outside the workspace`);
      }
      return resolved;
    }
    return path.resolve(workDir, filePath);
  }
}
