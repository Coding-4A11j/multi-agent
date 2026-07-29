"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Cpu, Activity, CheckCircle2, XCircle } from "lucide-react";
import { TaskForm } from "@/components/TaskForm";
import { TaskRow } from "@/components/TaskRow";
import { api, type TaskDetail } from "@/lib/api";

export default function HomePage() {
  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const deletedIds = useRef(new Set<string>());

  const fetchTasks = useCallback(async () => {
    try {
      const data = await api.listTasks();
      setTasks(data.filter((t) => !deletedIds.current.has(t.id)));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void fetchTasks();
    const t = setInterval(() => void fetchTasks(), 4000);
    return () => clearInterval(t);
  }, [fetchTasks]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.deleteTask(id);
      deletedIds.current.add(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Delete failed: ${msg}`);
    }
  }, []);

  const running   = tasks.filter((t) => t.status === "RUNNING").length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const failed    = tasks.filter((t) => t.status === "FAILED").length;

  return (
    <div style={{ minHeight: "100vh", background: "#080808" }}>
      {/* Nav */}
      <header style={{ borderBottom: "1px solid #161616", background: "#080808", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 20px", height: 50, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "#6366f115", border: "1px solid #6366f125", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Cpu size={13} color="#6366f1" />
            </div>
            <span style={{ fontWeight: 600, color: "#e8e8e8", fontSize: 13, letterSpacing: "-0.02em" }}>Multi-Agent</span>
            <span style={{ color: "#252525", margin: "0 2px", fontSize: 16 }}>·</span>
            <span style={{ color: "#3a3a3a", fontSize: 12 }}>Planner → Workers → Critic</span>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={12} strokeWidth={2.5} />
            New Task
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 780, margin: "0 auto", padding: "24px 20px 60px" }}>
        {/* Stats */}
        {!loading && tasks.length > 0 && (
          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            <Stat icon={<Activity size={11} />} label="Running"   value={running}   color="#3b82f6" />
            <Stat icon={<CheckCircle2 size={11} />} label="Completed" value={completed} color="#22c55e" />
            <Stat icon={<XCircle size={11} />}  label="Failed"    value={failed}    color="#ef4444" />
            <div style={{ marginLeft: "auto", fontSize: 11, color: "#333", alignSelf: "center" }}>
              {tasks.length} total
            </div>
          </div>
        )}

        {/* Task list */}
        {loading ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#333", fontSize: 13 }}>Loading…</div>
        ) : tasks.length === 0 ? (
          <EmptyState onNew={() => setShowForm(true)} />
        ) : (
          <div className="card" style={{ overflow: "hidden" }}>
            <AnimatePresence initial={false}>
              {tasks.map((task, i) => (
                <TaskRow key={task.id} task={task} last={i === tasks.length - 1} onDelete={() => void handleDelete(task.id)} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <AnimatePresence>
        {showForm && (
          <TaskForm
            onClose={() => setShowForm(false)}
            onCreated={(t) => { setTasks((p) => [t, ...p]); setShowForm(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: value > 0 ? color : "#2a2a2a" }}>{icon}</span>
      <span style={{ fontSize: 18, fontWeight: 600, color: value > 0 ? color : "#2a2a2a", letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, color: "#3a3a3a" }}>{label}</span>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "80px 0 60px" }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: "#111", border: "1px solid #1c1c1c", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
        <Cpu size={20} color="#2a2a2a" />
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#555", marginBottom: 6 }}>No tasks yet</div>
      <div style={{ fontSize: 12, color: "#2e2e2e", marginBottom: 24, maxWidth: 280, margin: "0 auto 24px" }}>
        Create a task and watch the agents plan, execute, and validate in real time
      </div>
      <button className="btn btn-primary" onClick={onNew}>
        <Plus size={12} strokeWidth={2.5} /> Create first task
      </button>
    </div>
  );
}
