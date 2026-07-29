"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FileText, Terminal, Globe, Search, Brain, CheckCircle2, Check, AlertCircle, Clock } from "lucide-react";
import type { PlanStep, TaskStep, TaskStatus } from "@multi-agent/shared";

const WORKER_META = {
  file_io:     { label: "File I/O",     Icon: FileText,  color: "#f59e0b" },
  shell:       { label: "Shell",        Icon: Terminal,  color: "#a78bfa" },
  playwright:  { label: "Playwright",   Icon: Globe,     color: "#22d3ee" },
  code_search: { label: "Code Search",  Icon: Search,    color: "#34d399" },
  FILE_IO:     { label: "File I/O",     Icon: FileText,  color: "#f59e0b" },
  SHELL:       { label: "Shell",        Icon: Terminal,  color: "#a78bfa" },
  PLAYWRIGHT:  { label: "Playwright",   Icon: Globe,     color: "#22d3ee" },
  CODE_SEARCH: { label: "Code Search",  Icon: Search,    color: "#34d399" },
  PLANNER:     { label: "Planner",      Icon: Brain,     color: "#6366f1" },
  CRITIC:      { label: "Critic",       Icon: CheckCircle2, color: "#ec4899" },
} as const;

interface Props {
  planSteps: PlanStep[];
  dbSteps: TaskStep[];
  activeStepId: string | null;
  stepStatuses: Map<string, TaskStep["status"]>;
  taskStatus: TaskStatus;
}

export function StepList({ planSteps, dbSteps, activeStepId, stepStatuses, taskStatus }: Props) {
  const steps = dbSteps.length > 0
    ? dbSteps
    : planSteps.map((p, i) => ({
        id: p.id, stepNumber: i + 1,
        workerType: p.worker.toUpperCase() as TaskStep["workerType"],
        description: p.description, status: "PENDING" as const,
        retryCount: 0, tokensUsed: 0, runId: "",
        input: p.parameters, output: null, errorMsg: null,
        createdAt: new Date().toISOString(), completedAt: null,
      }));

  if (steps.length === 0) {
    return (
      <div className="card" style={{ padding: "32px 16px", textAlign: "center", color: "#2e2e2e", fontSize: 12 }}>
        {taskStatus === "RUNNING" ? "Planner generating steps…" : "No steps recorded"}
      </div>
    );
  }

  const done  = steps.filter((s) => (stepStatuses.get(s.id) ?? s.status) === "COMPLETED").length;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "10px 14px 10px", borderBottom: "1px solid #141414", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="label">Pipeline</span>
        <span style={{ fontSize: 11, color: "#333" }}>{done}/{steps.length}</span>
      </div>

      {/* Timeline */}
      <div style={{ padding: "6px 0 2px" }}>
        <AnimatePresence initial={false}>
          {steps.map((step, i) => {
            const wKey = step.workerType as keyof typeof WORKER_META;
            const w = WORKER_META[wKey] ?? WORKER_META.SHELL;
            const isActive = step.id === activeStepId;
            const status = stepStatuses.get(step.id) ?? step.status;
            const isLast = i === steps.length - 1;

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ display: "flex", gap: 0 }}
              >
                {/* Left: connector column */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 46, flexShrink: 0 }}>
                  {/* Circle */}
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: isActive ? `${w.color}18` : status === "COMPLETED" ? "#0d1a0d" : status === "FAILED" ? "#1a0808" : "#111",
                    border: `1px solid ${isActive ? w.color + "50" : status === "COMPLETED" ? "#22c55e30" : status === "FAILED" ? "#ef444430" : "#1e1e1e"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginTop: 12, flexShrink: 0,
                    transition: "all 0.2s",
                  }}>
                    <StepCircleIcon status={status} isActive={isActive} w={w} />
                  </div>
                  {/* Connector line */}
                  {!isLast && (
                    <div style={{ width: 1, flex: 1, marginTop: 4, marginBottom: 0, background: "#161616", position: "relative", overflow: "hidden", minHeight: 16 }}>
                      {isActive && (
                        <motion.div
                          style={{ position: "absolute", top: 0, left: 0, right: 0, height: "30%", background: `linear-gradient(to bottom, ${w.color}70, transparent)` }}
                          animate={{ top: ["-30%", "130%"] }}
                          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Right: content */}
                <div style={{ flex: 1, minWidth: 0, padding: "12px 14px 14px 0" }}>
                  {/* Worker label row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <w.Icon size={11} color={w.color} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: w.color }}>{w.label}</span>
                    {step.retryCount > 0 && (
                      <span style={{ fontSize: 10, color: "#f59e0b", background: "#f59e0b10", border: "1px solid #f59e0b20", padding: "0px 5px", borderRadius: 4 }}>
                        ×{step.retryCount}
                      </span>
                    )}
                  </div>
                  {/* Description */}
                  <div style={{ fontSize: 12, color: "#555", lineHeight: 1.45 }}>{step.description}</div>
                  {/* Error */}
                  {status === "FAILED" && step.errorMsg && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "#c0392b", fontFamily: "ui-monospace,monospace", lineHeight: 1.4, background: "#1a0808", border: "1px solid #2a1010", borderRadius: 5, padding: "5px 8px" }}>
                      {step.errorMsg.slice(0, 200)}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StepCircleIcon({ status, isActive, w }: { status: string; isActive: boolean; w: { Icon: React.ElementType; color: string } }) {
  if (status === "COMPLETED") return <Check size={11} color="#22c55e" strokeWidth={2.5} />;
  if (status === "FAILED")    return <AlertCircle size={11} color="#ef4444" />;
  if (isActive || status === "RUNNING") return (
    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
      style={{ width: 10, height: 10, borderRadius: "50%", border: `1.5px solid ${w.color}`, borderTopColor: "transparent" }}
    />
  );
  return <Clock size={10} color="#2a2a2a" />;
}
