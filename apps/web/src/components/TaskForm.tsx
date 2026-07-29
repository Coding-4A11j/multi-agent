"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { X, ChevronDown, ChevronUp, Brain, CheckCheck } from "lucide-react";
import { api, type TaskDetail } from "@/lib/api";
import { ModelPicker } from "./ModelPicker";
import type { OpenRouterModel } from "@multi-agent/shared";

const EXAMPLES = [
  "Scrape the top 5 Hacker News stories and save them to hn.json",
  "Find all TODO comments in the workspace and write a summary",
  "Take a screenshot of google.com and save it to the workspace",
  "Search for any function named 'authenticate' in the codebase",
];

interface Props {
  onClose: () => void;
  onCreated: (task: TaskDetail) => void;
}

export function TaskForm({ onClose, onCreated }: Props) {
  const [goal, setGoal] = useState("");
  const [plannerModel, setPlannerModel] = useState("openrouter/free");
  const [criticModel, setCriticModel] = useState("openrouter/free");
  const [tokenBudget, setTokenBudget] = useState(100000);
  const [maxRunRetries, setMaxRunRetries] = useState(2);
  const [maxStepRetries, setMaxStepRetries] = useState(2);
  const [showAdv, setShowAdv] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getModels().then((m) => {
      setModels(m);
      const isFree = (model: { pricing?: { prompt?: string } }) => parseFloat(model.pricing?.prompt ?? "1") === 0;
      const hasTools = (model: { supported_parameters?: string[] }) => (model.supported_parameters ?? []).includes("tools");
      const ids = new Set(m.map((x) => x.id));
      // Prefer verified free models in order
      const plannerPriority = ["openrouter/free", "qwen/qwen3-coder:free", "meta-llama/llama-3.3-70b-instruct:free", "openai/gpt-oss-120b:free", "nvidia/nemotron-3-super-120b-a12b:free"];
      const criticPriority  = ["openrouter/free", "meta-llama/llama-3.3-70b-instruct:free", "qwen/qwen3-coder:free", "openai/gpt-oss-120b:free"];
      const bestPlanner = plannerPriority.find((id) => ids.has(id)) ?? m.find((x) => isFree(x) && hasTools(x))?.id;
      const bestCritic  = criticPriority.find((id) => ids.has(id))  ?? m.find((x) => isFree(x))?.id;
      if (bestPlanner) setPlannerModel(bestPlanner);
      if (bestCritic)  setCriticModel(bestCritic);
    }).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;
    setLoading(true);
    setError("");
    try {
      const t = await api.createTask({ goal: goal.trim(), plannerModel, criticModel, tokenBudget, maxRunRetries, maxStepRetries });
      onCreated(t as TaskDetail);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <motion.div
        initial={{ scale: 0.97, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        style={{ width: "100%", maxWidth: 520, background: "#111", border: "1px solid #1e1e1e", borderRadius: 12, overflow: "hidden" }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #1a1a1a" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0" }}>New Task</span>
          <button className="btn btn-secondary" style={{ padding: "4px 6px" }} onClick={onClose}>
            <X size={13} />
          </button>
        </div>

        <form onSubmit={(e) => void submit(e)} style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Goal */}
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Goal</div>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe what the agents should accomplish…"
              className="input"
              rows={4}
              style={{ resize: "none" }}
            />
          </div>

          {/* Examples */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {EXAMPLES.map((eg) => (
              <button
                key={eg} type="button"
                onClick={() => setGoal(eg)}
                style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: "#1a1a1a", border: "1px solid #222", color: "#555", cursor: "pointer" }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.color = "#999"; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.color = "#555"; }}
              >
                {eg.slice(0, 42)}…
              </button>
            ))}
          </div>

          {/* Models */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <ModelPicker
              value={plannerModel}
              onChange={setPlannerModel}
              label="Planner"
              models={models}
              requiresTools
              icon={<Brain size={11} />}
            />
            <ModelPicker
              value={criticModel}
              onChange={setCriticModel}
              label="Critic"
              models={models}
              icon={<CheckCheck size={11} />}
            />
          </div>

          {/* Advanced */}
          <div>
            <button type="button" onClick={() => setShowAdv((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#444", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              {showAdv ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Advanced
            </button>
            {showAdv && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div className="label" style={{ marginBottom: 5 }}>Token budget — {tokenBudget.toLocaleString()}</div>
                  <input type="range" min={10000} max={500000} step={10000} value={tokenBudget} onChange={(e) => setTokenBudget(+e.target.value)} style={{ width: "100%", accentColor: "#4f6ef7" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div className="label" style={{ marginBottom: 5 }}>Run retries</div>
                    <input type="number" min={0} max={5} value={maxRunRetries} onChange={(e) => setMaxRunRetries(+e.target.value)} className="input" />
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom: 5 }}>Step retries</div>
                    <input type="number" min={0} max={3} value={maxStepRetries} onChange={(e) => setMaxStepRetries(+e.target.value)} className="input" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{ fontSize: 12, color: "#ef4444", background: "#1a0a0a", border: "1px solid #2a1010", borderRadius: 6, padding: "8px 10px", lineHeight: 1.4 }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, paddingTop: 2 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading || !goal.trim()}>
              {loading ? "Launching…" : "Launch Task"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
