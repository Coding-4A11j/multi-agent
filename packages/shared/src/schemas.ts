import { z } from "zod";

export const CreateTaskSchema = z.object({
  goal: z.string().min(10, "Goal must be at least 10 characters").max(2000),
  tokenBudget: z.number().int().min(10000).max(500000).default(100000),
  maxRunRetries: z.number().int().min(0).max(5).default(2),
  maxStepRetries: z.number().int().min(0).max(3).default(2),
  workDir: z.string().optional().default("/tmp/multi-agent-workspace"),
  plannerModel: z.string().default("openrouter/free"),
  criticModel: z.string().default("openrouter/free"),
});

export type CreateTaskInput = z.input<typeof CreateTaskSchema>;
