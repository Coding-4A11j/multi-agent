"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight, Trash2 } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { TaskDetail } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

const RUNNING_DOT = (
  <span style={{
    display: "inline-block", width: 6, height: 6, borderRadius: "50%",
    background: "#3b82f6", flexShrink: 0,
    boxShadow: "0 0 0 0 #3b82f640",
    animation: "pulse-dot 1.6s ease-out infinite",
  }} />
);

export function TaskRow({ task, last, onDelete }: { task: TaskDetail; last?: boolean; onDelete?: () => void }) {
  const router = useRouter();
  const [hovered, setHovered] = useState(false);
  const latestRun = task.runs?.at(-1);
  const steps = latestRun?.steps ?? [];
  const done  = steps.filter((s) => s.status === "COMPLETED").length;
  const total = steps.length;

  return (
    <motion.div
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => router.push(`/tasks/${task.id}`)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px",
          cursor: "pointer",
          borderBottom: last ? "none" : "1px solid #141414",
          background: hovered ? "#111" : "transparent",
          transition: "background 0.1s",
        }}
      >
        {/* Status indicator */}
        <div style={{ flexShrink: 0 }}>
          {task.status === "RUNNING" ? RUNNING_DOT : (
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: task.status === "COMPLETED" ? "#22c55e" : task.status === "FAILED" ? "#ef4444" : "#252525",
            }} />
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#d8d8d8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 3 }}>
            {task.goal}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: "#3a3a3a" }}>
              {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
            </span>
            {total > 0 && (
              <>
                <span style={{ color: "#1e1e1e" }}>·</span>
                <span style={{ fontSize: 11, color: "#3a3a3a" }}>{done}/{total} steps</span>
                <StepBar done={done} total={total} status={task.status} />
              </>
            )}
            <span style={{ color: "#1e1e1e" }}>·</span>
            <span style={{ fontSize: 10, color: "#2d2d2d", fontFamily: "ui-monospace,monospace" }}>
              {task.plannerModel.split("/").pop()?.replace(/:free$/, "")}
            </span>
          </div>
        </div>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <StatusBadge status={task.status} />
          {hovered && onDelete && task.status !== "RUNNING" && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete task"
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "3px 4px", borderRadius: 4, lineHeight: 0,
                color: "#444",
                transition: "color 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#444"; }}
            >
              <Trash2 size={13} />
            </button>
          )}
          <ChevronRight size={12} color="#282828" />
        </div>
    </motion.div>
  );
}

function StepBar({ done, total, status }: { done: number; total: number; status: string }) {
  const pct = total > 0 ? (done / total) * 100 : 0;
  const color = status === "FAILED" ? "#ef4444" : status === "COMPLETED" ? "#22c55e" : "#6366f1";
  return (
    <div style={{ width: 40, height: 2, background: "#1a1a1a", borderRadius: 1, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 1, transition: "width 0.4s" }} />
    </div>
  );
}
