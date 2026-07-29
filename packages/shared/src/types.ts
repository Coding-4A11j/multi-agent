export type TaskStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type RunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type StepStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
export type WorkerType = "FILE_IO" | "SHELL" | "PLAYWRIGHT" | "CODE_SEARCH" | "PLANNER" | "CRITIC";
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface Task {
  id: string;
  goal: string;
  status: TaskStatus;
  tokenBudget: number;
  maxRunRetries: number;
  maxStepRetries: number;
  workDir: string;
  plannerModel: string;
  criticModel: string;
  createdAt: string;
  updatedAt: string;
  runs?: TaskRun[];
  logs?: TaskLog[];
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
  top_provider?: { max_completion_tokens?: number };
  supported_parameters?: string[];
}

export interface TaskRun {
  id: string;
  taskId: string;
  attempt: number;
  status: RunStatus;
  tokensUsed: number;
  tokenBudget: number;
  createdAt: string;
  completedAt: string | null;
  steps?: TaskStep[];
}

export interface TaskStep {
  id: string;
  runId: string;
  stepNumber: number;
  workerType: WorkerType;
  description: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: StepStatus;
  tokensUsed: number;
  errorMsg: string | null;
  retryCount: number;
  createdAt: string;
  completedAt: string | null;
}

export interface TaskLog {
  id: string;
  taskId: string;
  level: LogLevel;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PlanStep {
  id: string;
  worker: "file_io" | "shell" | "playwright" | "code_search";
  description: string;
  dependsOn: string[];
  parameters: Record<string, unknown>;
}

export interface Plan {
  steps: PlanStep[];
  reasoning: string;
}

export interface WorkerResult {
  success: boolean;
  data: unknown;
  summary: string;
  error?: string;
}

export interface CriticResult {
  approved: boolean;
  reasoning: string;
  suggestions?: string;
}

// SSE event types
export type AgentEvent =
  | { type: "task.started"; taskId: string; goal: string }
  | { type: "run.started"; runId: string; attempt: number }
  | { type: "plan.created"; steps: PlanStep[]; reasoning: string }
  | { type: "step.started"; stepId: string; stepNumber: number; workerType: WorkerType; description: string }
  | { type: "step.completed"; stepId: string; output: WorkerResult }
  | { type: "step.retrying"; stepId: string; attempt: number; error: string }
  | { type: "step.failed"; stepId: string; error: string }
  | { type: "critic.result"; stepId: string; result: CriticResult }
  | { type: "token.update"; used: number; budget: number }
  | { type: "log"; level: LogLevel; message: string; metadata?: Record<string, unknown> }
  | { type: "run.completed"; status: RunStatus; tokensUsed: number }
  | { type: "task.completed"; status: TaskStatus }
  | { type: "error"; message: string };
