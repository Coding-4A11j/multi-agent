"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { ChevronDown, Search, CheckCheck, Zap } from "lucide-react";
import type { OpenRouterModel } from "@multi-agent/shared";

const PRESETS = [
  // Paid models
  { id: "openai/gpt-4o",                            name: "GPT-4o",                       tools: true  },
  { id: "openai/gpt-4o-mini",                       name: "GPT-4o mini",                  tools: true  },
  { id: "anthropic/claude-3.5-sonnet",               name: "Claude 3.5 Sonnet",            tools: true  },
  { id: "google/gemini-flash-1.5",                   name: "Gemini Flash 1.5",             tools: true  },
  { id: "deepseek/deepseek-chat",                    name: "DeepSeek V3",                  tools: true  },
  // Free — verified live as of June 2025
  { id: "qwen/qwen3-coder:free",                     name: "Qwen3 Coder 480B (free)",      tools: true  },
  { id: "meta-llama/llama-3.3-70b-instruct:free",    name: "Llama 3.3 70B (free)",         tools: true  },
  { id: "openai/gpt-oss-120b:free",                  name: "OpenAI OSS 120B (free)",       tools: true  },
  { id: "nvidia/nemotron-3-super-120b-a12b:free",    name: "Nemotron 3 Super 120B (free)", tools: true  },
  { id: "openrouter/free",                           name: "Free Router (auto)",            tools: true  },
];

function shortName(id: string) {
  const preset = PRESETS.find((p) => p.id === id);
  if (preset) return preset.name;
  return id.split("/").pop()?.replace(/:.*/, "") ?? id;
}

function fmtPrice(s: string) {
  const n = parseFloat(s) * 1_000_000;
  if (!n) return "free";
  return `$${n < 1 ? n.toFixed(2) : n.toFixed(0)}/1M`;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  label: string;
  models: OpenRouterModel[];
  requiresTools?: boolean;
  icon?: React.ReactNode;
}

export function ModelPicker({ value, onChange, label, models, requiresTools, icon }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const list = useMemo(() => {
    const q = query.toLowerCase();
    const live = models.length > 0
      ? models
        .filter((m) => !requiresTools || (m.supported_parameters ?? []).includes("tools"))
        .filter((m) => !q || m.id.toLowerCase().includes(q) || (m.name ?? "").toLowerCase().includes(q))
        .slice(0, 80)
      : PRESETS
        .filter((p) => !requiresTools || p.tools)
        .filter((p) => !q || p.id.includes(q) || p.name.toLowerCase().includes(q))
        .map((p) => ({ id: p.id, name: p.name, context_length: 0, pricing: { prompt: "0", completion: "0" } } as OpenRouterModel));
    return live;
  }, [models, query, requiresTools]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div className="label" style={{ marginBottom: 5, display: "flex", alignItems: "center", gap: 4 }}>
        {icon} {label}
        {requiresTools && <span style={{ fontSize: 9, color: "#4f6ef7", background: "#4f6ef710", border: "1px solid #4f6ef720", borderRadius: 3, padding: "1px 4px" }}>tools</span>}
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", textAlign: "left", borderColor: open ? "#4f6ef7" : "#1e1e1e" }}
      >
        <span style={{ fontSize: 12, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortName(value)}</span>
        <ChevronDown size={12} color="#444" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
          background: "#111", border: "1px solid #1e1e1e", borderRadius: 8,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)", overflow: "hidden",
        }}>
          {/* Search */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid #1a1a1a" }}>
            <Search size={11} color="#444" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 12, color: "#ccc" }}
            />
          </div>

          {/* List */}
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {list.length === 0 && (
              <div style={{ padding: "16px", textAlign: "center", color: "#333", fontSize: 12 }}>No models</div>
            )}
            {list.map((m) => {
              const selected = m.id === value;
              const price = fmtPrice(m.pricing?.prompt ?? "0");
              const isFree = price === "free";
              return (
                <button
                  key={m.id} type="button"
                  onClick={() => { onChange(m.id); setOpen(false); setQuery(""); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px",
                    background: selected ? "#1a1f3a" : "transparent", border: "none", cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = "#141414"; }}
                  onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: selected ? "#818cf8" : "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.name || m.id.split("/").pop()}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 1 }}>
                      <span style={{ fontSize: 10, color: "#333", fontFamily: "monospace" }}>{m.id.replace(/:free$/, "").split("/").join(" / ")}</span>
                      {isFree
                        ? <span style={{ fontSize: 10, color: "#22c55e" }}>free</span>
                        : <span style={{ fontSize: 10, color: "#2a2a2a" }}>{price} in</span>
                      }
                    </div>
                  </div>
                  {selected && <CheckCheck size={11} color="#4f6ef7" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
