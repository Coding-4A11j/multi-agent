import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { BaseWorker, type WorkerContext } from "./base.js";
import type { WorkerResult } from "@multi-agent/shared";

const execFileAsync = promisify(execFile);

interface CodeSearchParams {
  query: string;
  path?: string;
  filePattern?: string;
  maxResults?: number;
  caseSensitive?: boolean;
}

interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

export class CodeSearchWorker extends BaseWorker {
  readonly name = "CODE_SEARCH";

  async execute(parameters: Record<string, unknown>, ctx: WorkerContext): Promise<WorkerResult> {
    const p = parameters as unknown as CodeSearchParams;
    const searchPath = p.path ? path.resolve(ctx.workDir, p.path) : ctx.workDir;
    const maxResults = Math.min(p.maxResults ?? 50, 200);

    // Try ripgrep first, fall back to node-based search
    const rgAvailable = await this.isRgAvailable();
    if (rgAvailable) {
      return this.searchWithRg(p, searchPath, maxResults, ctx);
    }
    return this.searchWithNode(p, searchPath, maxResults);
  }

  private async searchWithRg(
    p: CodeSearchParams,
    searchPath: string,
    maxResults: number,
    ctx: WorkerContext,
  ): Promise<WorkerResult> {
    const args = [
      "--json",
      "-m",
      String(maxResults),
      ...(p.caseSensitive ? [] : ["-i"]),
      ...(p.filePattern ? ["-g", p.filePattern] : []),
      p.query,
      searchPath,
    ];

    try {
      const { stdout } = await execFileAsync("rg", args, {
        maxBuffer: 10 * 1024 * 1024,
        cwd: ctx.workDir,
      });

      const matches: SearchMatch[] = stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as { type: string; data: { path: { text: string }; line_number: number; lines: { text: string } } };
          } catch {
            return null;
          }
        })
        .filter((obj): obj is NonNullable<typeof obj> => obj !== null && obj.type === "match")
        .map((obj) => ({
          file: obj.data.path.text,
          line: obj.data.line_number,
          content: obj.data.lines.text.trim(),
        }));

      return this.ok(matches, `Found ${matches.length} matches for "${p.query}"`);
    } catch (err: unknown) {
      const e = err as { code?: number };
      if (e.code === 1) return this.ok([], `No matches found for "${p.query}"`);
      return this.fail(`ripgrep error: ${(err as Error).message}`);
    }
  }

  private sanitizeQuery(query: string): RegExp {
    // Strip Python/PCRE inline flags like (?i) not supported in JS
    const clean = query.replace(/^\(\?[a-z]+\)/g, "").trim() || query;
    try {
      return new RegExp(clean, "gi");
    } catch {
      // Fall back to literal search if the pattern is invalid
      return new RegExp(clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    }
  }

  private async searchWithNode(
    p: CodeSearchParams,
    searchPath: string,
    maxResults: number,
  ): Promise<WorkerResult> {
    const files = await this.walkDir(searchPath, p.filePattern);
    const matches: SearchMatch[] = [];
    const regex = p.caseSensitive
      ? new RegExp(p.query, "g")
      : this.sanitizeQuery(p.query);

    for (const file of files) {
      if (matches.length >= maxResults) break;
      try {
        const content = await fs.readFile(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matches.push({ file, line: i + 1, content: lines[i].trim() });
            if (matches.length >= maxResults) break;
          }
          regex.lastIndex = 0;
        }
      } catch {
        // skip unreadable files
      }
    }

    return this.ok(matches, `Found ${matches.length} matches for "${p.query}"`);
  }

  private async walkDir(dir: string, pattern?: string): Promise<string[]> {
    const files: string[] = [];
    const ext = pattern?.replace("**/*.", ".") ?? "";

    async function walk(current: string): Promise<void> {
      let entries;
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          await walk(full);
        } else if (entry.isFile() && (!ext || full.endsWith(ext))) {
          files.push(full);
        }
      }
    }

    await walk(dir);
    return files;
  }

  private async isRgAvailable(): Promise<boolean> {
    try {
      await execFileAsync("rg", ["--version"]);
      return true;
    } catch {
      return false;
    }
  }
}
