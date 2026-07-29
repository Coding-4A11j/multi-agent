import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import fs from "fs/promises";
import path from "path";
import { BaseWorker, type WorkerContext } from "./base.js";
import type { WorkerResult } from "@multi-agent/shared";

const execFileAsync = promisify(execFile);

const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/(?!\S)/,
  /mkfs/,
  /dd\s+if=/,
  /:\(\)\s*\{/,
  /chmod\s+777\s+\//,
  />\s*\/dev\/sd/,
  /shutdown|reboot|halt/,
];

interface ShellParams {
  command: string;
  cwd?: string;
  timeout_ms?: number;
}

const isWindows = os.platform() === "win32";

// Detect bash heredoc: node - <<'DELIM'\n...\nDELIM
const HEREDOC_RE = /node\s+-\s+<<['"]?(\w+)['"]?\n([\s\S]*?)\n\1\s*$/m;

async function resolveCommand(command: string, workDir: string): Promise<{ shell: string; args: string[] }> {
  if (!isWindows) {
    return { shell: "sh", args: ["-c", command] };
  }

  // On Windows: if the command contains a bash heredoc, extract the script
  // and write it to a temp .js file, then run node on it
  const heredocMatch = HEREDOC_RE.exec(command);
  if (heredocMatch) {
    const scriptBody = heredocMatch[2]!;
    const tmpFile = path.join(workDir, `_tmp_script_${Date.now()}.js`);
    await fs.writeFile(tmpFile, scriptBody, "utf-8");
    return { shell: "node", args: [tmpFile] };
  }

  // Multi-line commands: write to a .bat file
  if (command.includes("\n")) {
    const tmpFile = path.join(workDir, `_tmp_cmd_${Date.now()}.bat`);
    await fs.writeFile(tmpFile, `@echo off\r\n${command}`, "utf-8");
    return { shell: "cmd.exe", args: ["/c", tmpFile] };
  }

  return { shell: "cmd.exe", args: ["/c", command] };
}

export class ShellWorker extends BaseWorker {
  readonly name = "SHELL";

  async execute(parameters: Record<string, unknown>, ctx: WorkerContext): Promise<WorkerResult> {
    const p = parameters as unknown as ShellParams;

    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(p.command)) {
        return this.fail(`Command blocked by safety filter: ${p.command}`);
      }
    }

    const cwd = p.cwd ?? ctx.workDir;
    const timeout = Math.min(p.timeout_ms ?? 60000, 180000);

    try {
      const { shell, args } = await resolveCommand(p.command, cwd);

      const { stdout, stderr } = await execFileAsync(shell, args, {
        cwd,
        timeout,
        maxBuffer: 5 * 1024 * 1024,
        env: {
          ...process.env,
          MULTI_AGENT_WORK_DIR: ctx.workDir,
          TASK_ID: ctx.taskId,
        },
      });

      const output = [stdout, stderr].filter(Boolean).join("\n").trim();
      return this.ok(
        { stdout: stdout.trim(), stderr: stderr.trim() },
        `Command succeeded. Output: ${output.slice(0, 500)}`,
      );
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; message?: string; code?: number | string };
      const stdout = (e.stdout ?? "").trim();
      const stderr = (e.stderr ?? "").trim();
      const errMsg = [stderr, e.message].filter(Boolean).join("\n").trim();

      // If the command produced substantial stdout, treat as partial success so
      // the critic can decide rather than auto-rejecting
      if (stdout.length > 50) {
        return {
          success: false,
          data: { stdout, stderr },
          summary: `Command failed (exit ${e.code ?? "?"}) but produced output: ${stdout.slice(0, 300)}`,
          error: errMsg.slice(0, 500),
        };
      }

      return this.fail(`Command failed (exit ${e.code ?? "?"}): ${errMsg.slice(0, 1000)}`);
    }
  }
}
