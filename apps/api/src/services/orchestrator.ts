import { prisma } from "../db/client.js";
import { eventBus } from "./event-bus.js";
import { TokenBudget, TokenBudgetExhaustedError } from "./token-budget.js";
import { runPlanner } from "../agents/planner.js";
import { runCritic } from "../agents/critic.js";
import { FileWorker } from "../agents/workers/file.worker.js";
import { ShellWorker } from "../agents/workers/shell.worker.js";
import { PlaywrightWorker } from "../agents/workers/playwright.worker.js";
import { CodeSearchWorker } from "../agents/workers/code-search.worker.js";
import type { PlanStep, WorkerResult } from "@multi-agent/shared";
import type { WorkerContext } from "../agents/workers/base.js";
import fs from "fs/promises";

const WORKERS = {
  file_io: new FileWorker(),
  shell: new ShellWorker(),
  playwright: new PlaywrightWorker(),
  code_search: new CodeSearchWorker(),
} as const;

function emit(taskId: string, data: Parameters<typeof eventBus.emitTaskEvent>[1]): void {
  eventBus.emitTaskEvent(taskId, data);
}

export async function runTask(taskId: string): Promise<void> {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

  await prisma.task.update({ where: { id: taskId }, data: { status: "RUNNING" } });
  emit(taskId, { type: "task.started", taskId, goal: task.goal });

  await fs.mkdir(task.workDir, { recursive: true });

  let lastError: string | undefined;
  let finalStatus: "COMPLETED" | "FAILED" = "FAILED";

  for (let attempt = 1; attempt <= task.maxRunRetries + 1; attempt++) {
    const run = await prisma.taskRun.create({
      data: { taskId, attempt, status: "RUNNING", errorCtx: lastError },
    });

    const budget = new TokenBudget(task.tokenBudget, (used, total) => {
      emit(taskId, { type: "token.update", used, budget: total });
    });

    emit(taskId, { type: "run.started", runId: run.id, attempt });
    await log(taskId, "INFO", `Starting attempt ${attempt}/${task.maxRunRetries + 1}`);

    try {
      // --- Planning phase ---
      await log(taskId, "INFO", `Planner is decomposing the goal using ${task.plannerModel}...`);
      const plan = await runPlanner(task.goal, budget, task.plannerModel, lastError);

      emit(taskId, { type: "plan.created", steps: plan.steps, reasoning: plan.reasoning });
      await log(taskId, "INFO", `Plan created with ${plan.steps.length} steps: ${plan.reasoning}`);

      // --- Execution phase ---
      const completedSteps: Map<string, WorkerResult> = new Map();
      const stepSummaries: string[] = [];

      for (let si = 0; si < plan.steps.length; si++) {
        const planStep = plan.steps[si];
        if (!planStep) continue;

        // Wait for dependencies
        await waitForDeps(planStep, completedSteps, plan.steps);

        const dbStep = await prisma.taskStep.create({
          data: {
            runId: run.id,
            stepNumber: si + 1,
            workerType: workerTypeEnum(planStep.worker),
            description: planStep.description,
            input: planStep.parameters as object,
            status: "RUNNING",
          },
        });

        emit(taskId, {
          type: "step.started",
          stepId: dbStep.id,
          stepNumber: si + 1,
          workerType: workerTypeEnum(planStep.worker),
          description: planStep.description,
        });
        await log(taskId, "INFO", `[Step ${si + 1}] ${planStep.worker}: ${planStep.description}`);

        const prevResults = [...completedSteps.values()];
        const ctx: WorkerContext = {
          workDir: task.workDir,
          taskId,
          stepNumber: si + 1,
          previousStepSummaries: stepSummaries.slice(),
          previousResults: prevResults,
        };

        // Resolve $PREV_OUTPUT placeholders with actual previous step data
        const resolvedParams = resolveParams(planStep.parameters, prevResults);

        let stepResult!: WorkerResult;
        let criticApproved = false;
        let stepError = "";

        for (let retry = 0; retry <= task.maxStepRetries; retry++) {
          if (retry > 0) {
            await log(taskId, "WARN", `[Step ${si + 1}] Retrying (attempt ${retry + 1}): ${stepError}`);
            emit(taskId, { type: "step.retrying", stepId: dbStep.id, attempt: retry + 1, error: stepError });
            await prisma.taskStep.update({
              where: { id: dbStep.id },
              data: { retryCount: retry },
            });
          }

          const worker = WORKERS[planStep.worker];
          stepResult = await worker.execute(
            { ...resolvedParams, _criticSuggestion: stepError || undefined },
            ctx,
          );

          // Critic validation
          const criticResult = await runCritic(planStep.description, planStep.parameters, stepResult, budget, task.criticModel);
          emit(taskId, { type: "critic.result", stepId: dbStep.id, result: criticResult });

          if (criticResult.approved) {
            criticApproved = true;
            break;
          }

          stepError = criticResult.suggestions ?? criticResult.reasoning;
          await log(taskId, "WARN", `[Step ${si + 1}] Critic rejected: ${criticResult.reasoning}`);
        }

        if (!criticApproved) {
          await prisma.taskStep.update({
            where: { id: dbStep.id },
            data: { status: "FAILED", errorMsg: stepError, output: stepResult as object },
          });
          emit(taskId, { type: "step.failed", stepId: dbStep.id, error: stepError });
          throw new Error(`Step ${si + 1} failed after all retries: ${stepError}`);
        }

        const tokensForStep = budget.totalUsed;
        await prisma.taskStep.update({
          where: { id: dbStep.id },
          data: {
            status: "COMPLETED",
            output: stepResult as object,
            tokensUsed: tokensForStep,
            completedAt: new Date(),
          },
        });

        emit(taskId, { type: "step.completed", stepId: dbStep.id, output: stepResult });
        await log(taskId, "INFO", `[Step ${si + 1}] Completed: ${stepResult.summary}`);

        completedSteps.set(planStep.id, stepResult);
        stepSummaries.push(`Step ${si + 1} (${planStep.worker}): ${stepResult.summary}`);
      }

      // All steps passed
      await prisma.taskRun.update({
        where: { id: run.id },
        data: { status: "COMPLETED", tokensUsed: budget.totalUsed, completedAt: new Date() },
      });

      emit(taskId, { type: "run.completed", status: "COMPLETED", tokensUsed: budget.totalUsed });
      await log(taskId, "INFO", `Run ${attempt} completed successfully`);
      finalStatus = "COMPLETED";
      break;
    } catch (err) {
      const errMsg = (err as Error).message;
      lastError = errMsg;

      await prisma.taskRun.update({
        where: { id: run.id },
        data: { status: "FAILED", tokensUsed: budget.totalUsed, completedAt: new Date() },
      });

      emit(taskId, { type: "run.completed", status: "FAILED", tokensUsed: budget.totalUsed });

      if (err instanceof TokenBudgetExhaustedError) {
        await log(taskId, "ERROR", `Token budget exhausted: ${errMsg}`);
        break; // No point retrying if budget is gone
      }

      await log(taskId, "ERROR", `Run ${attempt} failed: ${errMsg}`);
      if (attempt <= task.maxRunRetries) {
        await log(taskId, "INFO", `Will retry (${attempt}/${task.maxRunRetries})...`);
      }
    }
  }

  await prisma.task.update({
    where: { id: taskId },
    data: { status: finalStatus },
  });

  emit(taskId, { type: "task.completed", status: finalStatus });
  await log(taskId, finalStatus === "COMPLETED" ? "INFO" : "ERROR", `Task ${finalStatus}`);
}

async function log(
  taskId: string,
  level: "DEBUG" | "INFO" | "WARN" | "ERROR",
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await prisma.taskLog.create({ data: { taskId, level, message, metadata: metadata as object | undefined } });
  eventBus.emitTaskEvent(taskId, { type: "log", level, message, metadata });
}

function workerTypeEnum(w: string): "FILE_IO" | "SHELL" | "PLAYWRIGHT" | "CODE_SEARCH" {
  const map: Record<string, "FILE_IO" | "SHELL" | "PLAYWRIGHT" | "CODE_SEARCH"> = {
    file_io: "FILE_IO",
    shell: "SHELL",
    playwright: "PLAYWRIGHT",
    code_search: "CODE_SEARCH",
  };
  return map[w] ?? "SHELL";
}

function serializeResult(r: WorkerResult): string {
  if (typeof r.data === "string") return r.data;
  if (r.data === null || r.data === undefined) return r.summary;
  return JSON.stringify(r.data, null, 2);
}

function resolveParams(
  params: Record<string, unknown>,
  prevResults: WorkerResult[],
): Record<string, unknown> {
  if (prevResults.length === 0) return params;
  const lastOutput = serializeResult(prevResults[prevResults.length - 1]!);

  const resolve = (v: unknown): unknown => {
    if (typeof v !== "string") return v;
    // Replace any of these placeholders with the last step's output
    if (
      v === "$PREV_OUTPUT" ||
      v === "{{prev_output}}" ||
      v === "{{output}}" ||
      v === "$OUTPUT" ||
      v.trim() === ""
    ) {
      return lastOutput;
    }
    // Inline substitution for wrapped placeholders
    return v
      .replace(/\$PREV_OUTPUT/g, lastOutput)
      .replace(/\{\{prev_output\}\}/g, lastOutput)
      .replace(/\{\{output\}\}/g, lastOutput);
  };

  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, resolve(v)]),
  );
}

async function waitForDeps(
  step: PlanStep,
  completed: Map<string, WorkerResult>,
  _allSteps: PlanStep[],
): Promise<void> {
  for (const depId of step.dependsOn) {
    if (!completed.has(depId)) {
      // In a serial pipeline, dependencies should already be done.
      // If not, it's a planner bug — skip gracefully.
      console.warn(`Dependency ${depId} not yet completed for step ${step.id}`);
    }
  }
}
