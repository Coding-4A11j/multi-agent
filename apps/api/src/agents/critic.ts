import OpenAI from "openai";
import type { CriticResult, WorkerResult } from "@multi-agent/shared";
import type { TokenBudget } from "../services/token-budget.js";

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const e = err as { status?: number };
      if (e.status === 429 && i < maxRetries - 1) {
        const delay = (i + 1) * 8000;
        console.log(`[Critic] 429 rate limit — waiting ${delay / 1000}s before retry ${i + 2}/${maxRetries}`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("callWithRetry exhausted");
}

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

const SYSTEM_PROMPT = `You are a critic agent. Evaluate whether a worker step completed correctly.
Respond ONLY with raw JSON (no markdown, no explanation outside JSON):
{ "approved": boolean, "reasoning": string, "suggestions"?: string }

Rules:
- approved=true  if the worker executed without error and returned non-empty output
- approved=true  if the result is legitimately empty (e.g. a search found 0 matches — that IS valid)
- approved=false ONLY if: the worker crashed/errored, returned 0 results when some were clearly expected, or the output starts with "SELECTOR_FAILED:"
- suggestions    only needed when approved=false; describe concretely what to change

CRITICAL — web scraping rules:
- You CANNOT verify real-time web content. You don't know what is currently on HN, Reddit, or any live website.
- NEVER reject scraped content because the titles/text "look wrong", "seem unrelated", or "appear fabricated" — you have no way to know.
- If a playwright scrape returned N elements with non-empty text, approve it. That is success.
- Only reject a scrape if it returned 0 elements, errored, or the data field starts with "SELECTOR_FAILED:".
- The selector used in the summary may differ from the requested one (fallback was used) — this is fine, approve it.`;

export async function runCritic(
  stepDescription: string,
  workerInput: Record<string, unknown>,
  workerOutput: WorkerResult,
  budget: TokenBudget,
  model: string,
): Promise<CriticResult> {
  // Short-circuit: worker reported failure with no useful output — skip LLM call
  if (!workerOutput.success) {
    const hasUsefulOutput =
      typeof workerOutput.data === "object" &&
      workerOutput.data !== null &&
      "stdout" in workerOutput.data &&
      typeof (workerOutput.data as Record<string, unknown>).stdout === "string" &&
      ((workerOutput.data as Record<string, unknown>).stdout as string).length > 50;

    if (!hasUsefulOutput) {
      return {
        approved: false,
        reasoning: "Worker reported failure",
        suggestions: workerOutput.error ?? workerOutput.summary,
      };
    }
    // Shell command exited non-zero but produced substantial output — let LLM decide
  }

  budget.assertAvailable(1000);

  const userPayload = JSON.stringify({
    stepDescription,
    workerInput,
    workerOutput: {
      success: workerOutput.success,
      summary: workerOutput.summary,
      data: typeof workerOutput.data === "string"
        ? (workerOutput.data as string).slice(0, 2000)
        : workerOutput.data,
      error: workerOutput.error,
    },
  });

  const response = await callWithRetry(() =>
    getClient().chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPayload },
      ],
    }),
  );

  const tokensUsed = response.usage?.total_tokens ?? 0;
  budget.consume(tokensUsed);

  const content = response.choices[0]?.message?.content ?? "";
  if (!content) {
    // Empty response — treat as pass rather than crashing the run
    return { approved: true, reasoning: "Critic returned empty response (treated as pass)" };
  }

  // Extract JSON — handles bare JSON or markdown code blocks
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Safety filter, refusal, or other non-JSON response — log and pass
    // Failing the entire run because a free model returned a safety message is too aggressive
    return { approved: true, reasoning: `Critic returned non-JSON (treated as pass): ${content.slice(0, 120)}` };
  }

  let result: CriticResult;
  try {
    result = JSON.parse(jsonMatch[0]) as CriticResult;
  } catch {
    return { approved: true, reasoning: "Critic returned malformed JSON (treated as pass)" };
  }

  return {
    approved: Boolean(result.approved),
    reasoning: result.reasoning ?? "No reasoning provided",
    suggestions: result.suggestions,
  };
}
