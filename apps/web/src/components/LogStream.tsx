"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TaskLog, TaskStatus } from "@multi-agent/shared";

const LEVEL_STYLE: Record<string, { row: string; badge: string; msg: string }> = {
  DEBUG: { row: "transparent",  badge: "#222",    msg: "#3a3a3a" },
  INFO:  { row: "transparent",  badge: "#1c2a1c", msg: "#888"    },
  WARN:  { row: "#130f00",      badge: "#2a1f00", msg: "#c08010" },
  ERROR: { row: "#130505",      badge: "#2a0808", msg: "#c03030" },
};

function timeStr(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function LogStream({ logs, taskStatus }: { logs: TaskLog[]; taskStatus: TaskStatus }) {
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const isLive = taskStatus === "RUNNING";

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
    if (nearBottom) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", height: 480 }}>
      {/* Status bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "6px 14px", borderBottom: "1px solid #141414", flexShrink: 0 }}>
        {isLive && (
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#3b82f6" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#3b82f6", animation: "pulse-dot 1.4s ease-out infinite", display: "inline-block" }} />
            Live
          </span>
        )}
        <span style={{ fontSize: 11, color: "#2a2a2a" }}>{logs.length} entries</span>
      </div>

      {/* Log body */}
      <div
        ref={boxRef}
        style={{ flex: 1, overflowY: "auto", fontFamily: "ui-monospace,'Cascadia Code',Consolas,monospace", fontSize: 11, lineHeight: 1.6 }}
      >
        {logs.length === 0 ? (
          <div style={{ padding: "32px 16px", color: "#252525", textAlign: "center" }}>
            {isLive ? "Waiting for logs…" : "No logs"}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {logs.map((log) => {
              const s = LEVEL_STYLE[log.level] ?? LEVEL_STYLE.INFO;
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ display: "flex", gap: 0, background: s.row }}
                >
                  {/* Sidebar: time + level */}
                  <div style={{ display: "flex", gap: 10, padding: "2px 10px 2px 14px", flexShrink: 0, alignItems: "flex-start", paddingTop: 4 }}>
                    <span style={{ color: "#272727", fontSize: 10, flexShrink: 0 }}>{timeStr(log.createdAt)}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                      background: s.badge, color: log.level === "WARN" ? "#c08010" : log.level === "ERROR" ? "#c03030" : "#363636",
                      padding: "1px 5px", borderRadius: 3, flexShrink: 0, marginTop: 1, minWidth: 34, textAlign: "center",
                    }}>
                      {log.level === "DEBUG" ? "DBG" : log.level.slice(0, 4)}
                    </span>
                  </div>
                  {/* Message */}
                  <div style={{ flex: 1, padding: "3px 14px 3px 0", color: s.msg, wordBreak: "break-word" }}>
                    {log.message}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
