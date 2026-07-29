"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  FileText,
  Terminal,
  Globe,
  Search,
  CheckCircle2,
  ArrowRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { PlanStep, TaskStep, TaskStatus } from "@multi-agent/shared";

const WORKER_CONFIG = {
  file_io: { label: "File I/O", icon: FileText, color: "#f59e0b", ring: "ring-amber-500/30" },
  shell: { label: "Shell", icon: Terminal, color: "#8b5cf6", ring: "ring-violet-500/30" },
  playwright: { label: "Playwright", icon: Globe, color: "#06b6d4", ring: "ring-cyan-500/30" },
  code_search: { label: "Code Search", icon: Search, color: "#10b981", ring: "ring-emerald-500/30" },
  FILE_IO: { label: "File I/O", icon: FileText, color: "#f59e0b", ring: "ring-amber-500/30" },
  SHELL: { label: "Shell", icon: Terminal, color: "#8b5cf6", ring: "ring-violet-500/30" },
  PLAYWRIGHT: { label: "Playwright", icon: Globe, color: "#06b6d4", ring: "ring-cyan-500/30" },
  CODE_SEARCH: { label: "Code Search", icon: Search, color: "#10b981", ring: "ring-emerald-500/30" },
  PLANNER: { label: "Planner", icon: Brain, color: "#6366f1", ring: "ring-indigo-500/30" },
  CRITIC: { label: "Critic", icon: CheckCircle2, color: "#ec4899", ring: "ring-pink-500/30" },
} as const;

interface AgentPipelineProps {
  planSteps: PlanStep[];
  dbSteps: TaskStep[];
  activeStepId: string | null;
  stepStatuses: Map<string, TaskStep["status"]>;
  taskStatus: TaskStatus;
}

export function AgentPipeline({
  planSteps,
  dbSteps,
  activeStepId,
  stepStatuses,
  taskStatus,
}: AgentPipelineProps) {
  // Merge plan steps with DB steps for rendering
  const steps = dbSteps.length > 0 ? dbSteps : planSteps.map((ps, i) => ({
    id: ps.id,
    stepNumber: i + 1,
    workerType: ps.worker.toUpperCase() as TaskStep["workerType"],
    description: ps.description,
    status: "PENDING" as const,
    retryCount: 0,
    tokensUsed: 0,
    runId: "",
    input: ps.parameters,
    output: null,
    errorMsg: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  }));

  return (
    <div className="space-y-6">
      {/* Planner node */}
      <div className="flex items-start gap-4">
        <PipelineNode
          type="PLANNER"
          label="Planner"
          status={steps.length > 0 ? "COMPLETED" : taskStatus === "RUNNING" ? "RUNNING" : "PENDING"}
          description="Decomposes the goal into executable steps using GPT-4o tool calling"
          isActive={false}
          stepNumber={0}
        />
      </div>

      {/* Arrow */}
      {steps.length > 0 && (
        <div className="ml-10 flex items-center gap-1 text-slate-600">
          <div className="w-0.5 h-6 bg-gradient-to-b from-indigo-500/50 to-slate-700 mx-auto" />
        </div>
      )}

      {/* Worker + Critic pairs */}
      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {steps.map((step, idx) => {
            const isActive = step.id === activeStepId;
            const overrideStatus = stepStatuses.get(step.id);
            const status = overrideStatus ?? step.status;
            const workerKey = step.workerType as keyof typeof WORKER_CONFIG;
            const cfg = WORKER_CONFIG[workerKey] ?? WORKER_CONFIG.SHELL;

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="pl-10"
              >
                {/* Step pair: Worker → Critic */}
                <div className="flex items-stretch gap-3">
                  {/* Worker card */}
                  <div
                    className={cn(
                      "flex-1 rounded-xl p-4 border transition-all duration-200",
                      isActive
                        ? "bg-white/6 border-white/15 ring-2"
                        : "bg-white/3 border-white/7",
                      isActive && cfg.ring,
                    )}
                    style={isActive ? { boxShadow: `0 0 20px ${cfg.color}20` } : {}}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="p-2 rounded-lg shrink-0"
                        style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}
                      >
                        <cfg.icon className="w-4 h-4" style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium" style={{ color: cfg.color }}>
                            {cfg.label}
                          </span>
                          <StepStatusIcon status={status} isActive={isActive} />
                          {step.retryCount > 0 && (
                            <span className="text-xs text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                              retry ×{step.retryCount}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-2">{step.description}</p>
                        {step.tokensUsed > 0 && (
                          <p className="text-xs text-slate-600 mt-1.5">{step.tokensUsed.toLocaleString()} tokens</p>
                        )}
                      </div>
                    </div>

                    {/* Active flow animation */}
                    {isActive && (
                      <div className="mt-3 h-0.5 bg-white/5 rounded overflow-hidden">
                        <motion.div
                          className="h-full rounded"
                          style={{ background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }}
                          animate={{ x: ["-100%", "200%"] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        />
                      </div>
                    )}

                    {/* Error message */}
                    {status === "FAILED" && step.errorMsg && (
                      <div className="mt-2 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-xs text-red-400 line-clamp-2">{step.errorMsg}</p>
                      </div>
                    )}
                  </div>

                  {/* Arrow to critic */}
                  <div className="flex items-center text-slate-700">
                    <ArrowRight className="w-4 h-4" />
                  </div>

                  {/* Critic card */}
                  <div
                    className={cn(
                      "w-32 rounded-xl p-3 border flex flex-col items-center justify-center gap-1.5",
                      status === "COMPLETED"
                        ? "bg-pink-500/8 border-pink-500/20"
                        : status === "FAILED"
                        ? "bg-red-500/8 border-red-500/20"
                        : "bg-white/3 border-white/7",
                    )}
                  >
                    <div
                      className="p-1.5 rounded-lg"
                      style={{ background: "#ec489918", border: "1px solid #ec489930" }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-pink-400" />
                    </div>
                    <span className="text-xs text-pink-400 font-medium">Critic</span>
                    {status === "COMPLETED" && (
                      <span className="text-xs text-emerald-400">✓ Approved</span>
                    )}
                    {status === "FAILED" && (
                      <span className="text-xs text-red-400">✗ Rejected</span>
                    )}
                  </div>
                </div>

                {/* Connector to next step */}
                {idx < steps.length - 1 && (
                  <div className="ml-5 mt-1.5 w-0.5 h-4 bg-gradient-to-b from-white/10 to-white/5" />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PipelineNode({
  type,
  label,
  status,
  description,
  isActive,
  stepNumber,
}: {
  type: keyof typeof WORKER_CONFIG;
  label: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  description: string;
  isActive: boolean;
  stepNumber: number;
}) {
  const cfg = WORKER_CONFIG[type];
  return (
    <div
      className={cn(
        "flex-1 rounded-xl p-4 border",
        isActive ? "bg-white/6 border-white/15" : "bg-white/3 border-white/7",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className="p-2.5 rounded-xl"
          style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}
        >
          <cfg.icon className="w-5 h-5" style={{ color: cfg.color }} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: cfg.color }}>{label}</span>
            <StepStatusIcon status={status} isActive={isActive} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
    </div>
  );
}

function StepStatusIcon({ status, isActive }: { status: string; isActive: boolean }) {
  if (isActive || status === "RUNNING") {
    return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
  }
  if (status === "COMPLETED") {
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  }
  if (status === "FAILED") {
    return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
  }
  return null;
}
