"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, RefreshCw, X } from "lucide-react";
import { api, type TaskDetail } from "@/lib/api";
import { useSSE } from "@/lib/sse";
import { StatusBadge } from "@/components/StatusBadge";
import { StepList } from "@/components/StepList";
import { LogStream } from "@/components/LogStream";
import FilesBrowser from "@/components/FilesBrowser";
import type { AgentEvent, TaskLog, TaskStep, PlanStep } from "@multi-agent/shared";
import { formatDistanceToNow } from "date-fns";

interface Live {
  tokenUsed: number;
  tokenBudget: number;
  planSteps: PlanStep[];
  activeStepId: string | null;
  stepStatuses: Map<string, TaskStep["status"]>;
  logs: TaskLog[];
  attempt: number;
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rightTab, setRightTab] = useState<"logs" | "files">("logs");
  const liveRef = useRef<Live>({ tokenUsed: 0, tokenBudget: 100000, planSteps: [], activeStepId: null, stepStatuses: new Map(), logs: [], attempt: 0 });
  const [live, setLive] = useState<Live>({ ...liveRef.current });

  const patch = useCallback((fn: (p: Live) => Live) => {
    liveRef.current = fn(liveRef.current);
    setLive({ ...liveRef.current });
  }, []);

  const fetchTask = useCallback(async () => {
    try {
      const data = await api.getTask(id);
      setTask(data);
      const run = data.runs?.at(-1);
      if (run) patch((p) => ({ ...p, tokenUsed: run.tokensUsed, tokenBudget: data.tokenBudget, attempt: run.attempt, logs: data.logs ?? [] }));
    } catch { /* */ }
    finally { setLoading(false); }
  }, [id, patch]);

  useEffect(() => { void fetchTask(); }, [fetchTask]);

  const isTerminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(task?.status ?? "");

  useSSE(id, {
    enabled: !isTerminal,
    onEvent: (e: AgentEvent) => {
      if (e.type === "token.update")    patch((p) => ({ ...p, tokenUsed: e.used, tokenBudget: e.budget }));
      else if (e.type === "plan.created")    patch((p) => ({ ...p, planSteps: e.steps }));
      else if (e.type === "run.started")     patch((p) => ({ ...p, attempt: e.attempt }));
      else if (e.type === "step.started")    patch((p) => ({ ...p, activeStepId: e.stepId }));
      else if (e.type === "step.completed")  patch((p) => ({ ...p, activeStepId: null, stepStatuses: new Map(p.stepStatuses).set(e.stepId, "COMPLETED") }));
      else if (e.type === "step.failed")     patch((p) => ({ ...p, activeStepId: null, stepStatuses: new Map(p.stepStatuses).set(e.stepId, "FAILED") }));
      else if (e.type === "log")             patch((p) => ({ ...p, logs: [...p.logs, { id: `${Date.now()}-${Math.random()}`, taskId: id, level: e.level, message: e.message, metadata: e.metadata ?? null, createdAt: new Date().toISOString() }] }));
      else if (e.type === "task.completed")  { setTask((t) => t ? { ...t, status: e.status } : t); void fetchTask(); }
    },
  });

  if (loading) return <div style={{ padding: 48, color: "#333", fontSize: 13 }}>Loading…</div>;
  if (!task)   return <div style={{ padding: 48, color: "#333", fontSize: 13 }}>Task not found.</div>;

  const latestRun = task.runs?.at(-1);
  const steps = latestRun?.steps ?? [];
  const tokenPct = live.tokenBudget > 0 ? Math.min((live.tokenUsed / live.tokenBudget) * 100, 100) : 0;
  const barColor = tokenPct > 85 ? "#ef4444" : tokenPct > 60 ? "#f59e0b" : "#6366f1";

  return (
    <div style={{ minHeight: "100vh", background: "#080808" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid #161616", background: "#080808", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", height: 52, display: "flex", alignItems: "center", gap: 12 }}>
          <button className="btn btn-secondary" style={{ padding: "4px 7px" }} onClick={() => router.push("/")}>
            <ArrowLeft size={13} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "#d8d8d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 500 }}>
                {task.goal}
              </span>
              <StatusBadge status={task.status} />
              {live.attempt > 0 && <span style={{ fontSize: 11, color: "#2e2e2e" }}>attempt {live.attempt}</span>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 1, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#2d2d2d" }}>{formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}</span>
              <span style={{ color: "#1a1a1a" }}>·</span>
              <span style={{ fontSize: 10, color: "#2d2d2d", fontFamily: "ui-monospace,monospace" }}>{task.plannerModel.split("/").pop()?.replace(/:free$/, "")}</span>
              <span style={{ color: "#1a1a1a" }}>·</span>
              <span style={{ fontSize: 10, color: "#2d2d2d", fontFamily: "ui-monospace,monospace" }}>{task.criticModel.split("/").pop()?.replace(/:free$/, "")}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button className="btn btn-secondary" style={{ padding: "4px 7px" }} onClick={() => void fetchTask()} title="Refresh">
              <RefreshCw size={12} />
            </button>
            {task.status === "RUNNING" && (
              <button
                className="btn btn-secondary"
                style={{ color: "#c0392b", borderColor: "#2a1212" }}
                onClick={() => void api.cancelTask(id).then(() => setTask((t) => t ? { ...t, status: "CANCELLED" } : t))}
              >
                <X size={12} /> Cancel
              </button>
            )}
          </div>
        </div>

        {/* Token bar */}
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 1px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 8 }}>
            <div style={{ flex: 1, height: 2, background: "#111", borderRadius: 1 }}>
              <div style={{ height: "100%", width: `${tokenPct}%`, background: barColor, borderRadius: 1, transition: "width 0.5s ease" }} />
            </div>
            <span style={{ fontSize: 10, color: "#2a2a2a", flexShrink: 0 }}>
              {live.tokenUsed.toLocaleString()} / {live.tokenBudget.toLocaleString()} tokens
            </span>
          </div>
        </div>
      </header>

      {/* Body */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px 48px", display: "grid", gridTemplateColumns: "340px 1fr", gap: 14, alignItems: "start" }}>
        <StepList
          planSteps={live.planSteps}
          dbSteps={steps}
          activeStepId={live.activeStepId}
          stepStatuses={live.stepStatuses}
          taskStatus={task.status}
        />

        {/* Right panel with tabs */}
        <div style={{ border: "1px solid #1a1a1a", borderRadius: 8, background: "#0d0d0d", overflow: "hidden" }}>
          {/* Tab bar */}
          <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a" }}>
            {(["logs", "files"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightTab(tab)}
                style={{
                  padding: "9px 16px",
                  fontSize: 12,
                  fontWeight: rightTab === tab ? 600 : 400,
                  color: rightTab === tab ? "#c8c8c8" : "#444",
                  background: "none",
                  border: "none",
                  borderBottom: rightTab === tab ? "2px solid #6366f1" : "2px solid transparent",
                  cursor: "pointer",
                  textTransform: "capitalize",
                  letterSpacing: "0.02em",
                  marginBottom: -1,
                }}
              >
                {tab === "logs" ? "Logs" : "Files"}
              </button>
            ))}
          </div>

          {/* Panel content */}
          {rightTab === "logs" ? (
            <LogStream logs={live.logs} taskStatus={task.status} />
          ) : (
            <div style={{ height: 480 }}>
              <FilesBrowser taskId={id} taskStatus={task.status} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
