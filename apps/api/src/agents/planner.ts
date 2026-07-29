import OpenAI from "openai";
import type { Plan, PlanStep } from "@multi-agent/shared";
import type { TokenBudget } from "../services/token-budget.js";

function getClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
      "X-Title": "Multi-Agent System",
    },
  });
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      if (e.status === 429 && i < maxRetries - 1) {
        const delay = (i + 1) * 8000;
        console.log(`[Planner] 429 rate limit — waiting ${delay / 1000}s before retry ${i + 2}/${maxRetries}`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("callWithRetry exhausted");
}

const PLANNER_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_plan",
      description: "Create a structured execution plan with discrete worker steps",
      parameters: {
        type: "object",
        required: ["steps", "reasoning"],
        properties: {
          reasoning: {
            type: "string",
            description: "Brief explanation of the overall approach",
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "worker", "description", "parameters"],
              properties: {
                id: { type: "string", description: "Unique step identifier (e.g. step_1)" },
                worker: {
                  type: "string",
                  enum: ["file_io", "shell", "playwright", "code_search"],
                },
                description: { type: "string" },
                dependsOn: {
                  type: "array",
                  items: { type: "string" },
                  default: [],
                  description: "IDs of steps that must complete before this one",
                },
                parameters: {
                  type: "object",
                  description: "Worker-specific parameters",
                },
              },
            },
          },
        },
      },
    },
  },
];

const WORKER_PARAMETER_HINTS = `
Worker parameter schemas:
- file_io: { operation: "read"|"write"|"append"|"delete"|"list"|"exists"|"copy", path: string, content?: string, source?: string }
  - "copy": copies source file to path (both within workspace)
  - "write": if content is an absolute file path that exists on disk, the file is binary-copied instead of writing the string
- shell: { command: string, cwd?: string, timeout_ms?: number }
  IMPORTANT: The shell runs on Windows (cmd.exe). Do NOT use bash heredoc syntax (<<EOF). Do NOT use bash-only syntax (&&, ||, $(), pipes may work but test carefully).
  For multi-line Node.js scripts: use file_io to write the script to a .js file first, then shell to run "node script.js".
  Prefer simple one-liner commands. For complex logic, write a .js file with file_io and execute it with node.
  CRITICAL: Node.js scripts run in the task workspace — they do NOT have access to playwright or any npm package unless installed there first. Use only built-in Node.js modules (fs, path, https, http) in shell scripts.
- playwright: { url: string, action: "scrape"|"screenshot"|"links"|"click"|"fill"|"navigate", selector?: string, attribute?: string, value?: string, waitFor?: string, filename?: string }
  CRITICAL: Each playwright step opens a FRESH browser — no state is shared between steps. The "url" parameter is REQUIRED for every playwright step.
  Actions:
    - "screenshot": takes a full-page screenshot saved directly to workspace. Use "filename" param (e.g. filename="site.png"). NO separate file_io step needed.
    - "scrape": returns visible text of matched elements as newline-separated strings. Add attribute="href" to extract href values instead of text.
      Add structured=true to get a JSON array of {title, url} objects per element — use this whenever you need BOTH the text AND the link (e.g. "scrape top stories" means title+url).
      Selector tips: Hacker News story links → selector="a.titlelink", structured=true. Returns [{title: "...", url: "https://..."}] ready to slice and write.
    - "links": returns all unique hrefs (including external URLs) as a JSON array. Best for extracting all links from a page.
    - "navigate": returns {url, title} of the loaded page.
  WRONG: { action: "navigate", url: "..." } then { action: "screenshot" }  ← screenshot has no url, will fail
  RIGHT: { action: "screenshot", url: "https://example.com", filename: "example.png" }
- $PREV_OUTPUT RULES — CRITICAL:
  NEVER embed $PREV_OUTPUT directly inside a Node.js script as a variable value — it is raw text, not valid JavaScript.
  CORRECT pattern for passing scraped data to a script:
    Step A: playwright scrape → output is titles text
    Step B: file_io write → path="titles.txt", content="$PREV_OUTPUT"  ← saves raw text to file
    Step C: file_io write → path="process.js", content="const fs=require('fs'); const lines=fs.readFileSync('titles.txt','utf8').split('\\n').filter(Boolean); ..."
    Step D: shell → command="node process.js"
  The script READS data from a file — it never receives $PREV_OUTPUT inline.
- code_search: { query: string, path?: string, filePattern?: string, maxResults?: number, caseSensitive?: boolean }
  IMPORTANT for code_search: query is a JavaScript RegExp pattern string. Do NOT use Python-style inline flags like (?i).
  Use caseSensitive=false instead of (?i). Example: query="authenticate", caseSensitive=false
`;

export async function runPlanner(
  goal: string,
  budget: TokenBudget,
  model: string,
  errorContext?: string,
): Promise<Plan> {
  budget.assertAvailable(2000);

  const systemPrompt = `You are an expert AI planner. Break down the given goal into a minimal set of discrete, executable steps using the available workers. Each step should be atomic and testable. Prefer sequential steps unless parallelism is explicitly needed.

${WORKER_PARAMETER_HINTS}

Rules:
- Use file_io to read/write files in the workspace
- Use shell for OS commands, running scripts, package installs
- Use playwright for web scraping, screenshots, or browser automation
- Use code_search to find patterns or symbols in a codebase
- Keep steps focused and ordered by dependency
- Output a plan with 2-10 steps
- When a step needs data produced by a previous step (e.g. file_io writing scraped content), set that parameter value to exactly "$PREV_OUTPUT" — the system will substitute the actual output at runtime`;

  const userContent = errorContext
    ? `Goal: ${goal}\n\nPrevious attempt failed with:\n${errorContext}\n\nCreate a revised plan addressing the failure.`
    : `Goal: ${goal}`;

  const response = await callWithRetry(() =>
    getClient().chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 4096,
      tools: PLANNER_TOOLS,
      tool_choice: { type: "function", function: { name: "create_plan" } },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  );

  const tokensUsed = response.usage?.total_tokens ?? 0;
  budget.consume(tokensUsed);

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];

  // Combine tool call arguments and content into one string to parse from
  const rawStr =
    toolCall?.function?.arguments ??
    response.choices[0]?.message?.content ??
    "";

  const raw = extractPlan(rawStr);
  if (!raw) throw new Error(`Planner returned unparseable response: ${rawStr.slice(0, 300)}`);
  return normalizePlan(raw);
}

function extractPlan(str: string): Plan | null {
  // Walk the string finding every { } pair, try each one as JSON
  for (let i = 0; i < str.length; i++) {
    if (str[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < str.length; j++) {
      const c = str[j];
      if (esc) { esc = false; continue; }
      if (c === "\\" && inStr) { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      if (c === "}") {
        depth--;
        if (depth === 0) {
          const candidate = str.slice(i, j + 1);
          try {
            const parsed = JSON.parse(candidate) as Plan;
            if (Array.isArray(parsed.steps)) return parsed;
          } catch { /* try next */ }
          break;
        }
      }
    }
  }
  return null;
}

function normalizePlan(raw: Plan): Plan {
  const steps: PlanStep[] = (raw.steps ?? []).map((s) => ({
    id: s.id,
    worker: s.worker,
    description: s.description,
    dependsOn: s.dependsOn ?? [],
    parameters: s.parameters,
  }));
  return { steps, reasoning: raw.reasoning ?? "" };
}
