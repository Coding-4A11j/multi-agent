import type { WorkerResult } from "@multi-agent/shared";

export abstract class BaseWorker {
  abstract readonly name: string;

  abstract execute(
    parameters: Record<string, unknown>,
    context: WorkerContext,
  ): Promise<WorkerResult>;

  protected ok(data: unknown, summary: string): WorkerResult {
    return { success: true, data, summary };
  }

  protected fail(error: string, data?: unknown): WorkerResult {
    return { success: false, data: data ?? null, summary: error, error };
  }
}

export interface WorkerContext {
  workDir: string;
  taskId: string;
  stepNumber: number;
  previousStepSummaries: string[];
  previousResults: WorkerResult[];
}
