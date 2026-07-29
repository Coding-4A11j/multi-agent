import type { TaskStatus, StepStatus } from "@multi-agent/shared";

type AnyStatus = TaskStatus | StepStatus | "CANCELLED";

const CFG: Record<AnyStatus, { dot: string; label: string; color: string }> = {
  PENDING:   { dot: "#252525", label: "Pending",   color: "#3a3a3a" },
  RUNNING:   { dot: "#3b82f6", label: "Running",   color: "#3b82f6" },
  COMPLETED: { dot: "#22c55e", label: "Completed", color: "#22c55e" },
  FAILED:    { dot: "#ef4444", label: "Failed",    color: "#ef4444" },
  CANCELLED: { dot: "#252525", label: "Cancelled", color: "#3a3a3a" },
  SKIPPED:   { dot: "#252525", label: "Skipped",   color: "#3a3a3a" },
};

export function StatusBadge({ status }: { status: AnyStatus }) {
  const c = CFG[status] ?? CFG.PENDING;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, color: c.color }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot, flexShrink: 0, display: "inline-block" }} />
      {c.label}
    </span>
  );
}
