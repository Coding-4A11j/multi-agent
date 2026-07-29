"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type FileEntry } from "@/lib/api";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function fileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["json", "yaml", "yml"].includes(ext)) return "{}";
  if (["txt", "md", "log"].includes(ext)) return "T";
  if (["html", "xml"].includes(ext)) return "<>";
  if (["csv"].includes(ext)) return "≡";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "⬜";
  if (["js", "ts", "py"].includes(ext)) return "</>";
  return "F";
}

export default function FilesBrowser({ taskId, taskStatus }: { taskId: string; taskStatus: string }) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{ path: string; content: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getTaskFiles(taskId);
      setFiles(data);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh while task is running
  useEffect(() => {
    if (taskStatus !== "RUNNING") return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [taskStatus, load]);

  const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);

  function isImage(name: string): boolean {
    return IMAGE_EXTS.has(name.split(".").pop()?.toLowerCase() ?? "");
  }

  async function openPreview(file: FileEntry) {
    if (isImage(file.name)) {
      setPreview({ path: file.relativePath, content: "__image__" });
      return;
    }
    setPreviewLoading(true);
    setPreview({ path: file.relativePath, content: "Loading…" });
    try {
      const url = api.getFileUrl(taskId, file.relativePath);
      const res = await fetch(url);
      const text = await res.text();
      setPreview({ path: file.relativePath, content: text });
    } catch {
      setPreview({ path: file.relativePath, content: "Failed to load file." });
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "#555", fontSize: "13px" }}>
        Loading files…
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "#444", fontSize: "13px" }}>
        <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.4 }}>📁</div>
        {taskStatus === "RUNNING" ? "Files will appear here as the task runs…" : "No output files were created."}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* File list */}
      <div style={{
        width: preview ? "260px" : "100%",
        borderRight: preview ? "1px solid #1a1a1a" : "none",
        overflowY: "auto",
        flexShrink: 0,
      }}>
        <div style={{
          padding: "10px 14px",
          borderBottom: "1px solid #1a1a1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "11px", color: "#555", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Output Files
          </span>
          <span style={{ fontSize: "11px", color: "#444" }}>{files.length} file{files.length !== 1 ? "s" : ""}</span>
        </div>

        {files.map((file) => (
          <div
            key={file.relativePath}
            onClick={() => openPreview(file)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "9px 14px",
              cursor: "pointer",
              borderBottom: "1px solid #111",
              background: preview?.path === file.relativePath ? "#141414" : "transparent",
              transition: "background 0.1s",
            }}
            onMouseEnter={(e) => { if (preview?.path !== file.relativePath) (e.currentTarget as HTMLDivElement).style.background = "#0f0f0f"; }}
            onMouseLeave={(e) => { if (preview?.path !== file.relativePath) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            <span style={{
              fontFamily: "monospace",
              fontSize: "11px",
              color: "#444",
              width: "20px",
              textAlign: "center",
              flexShrink: 0,
            }}>
              {fileIcon(file.name)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file.relativePath}
              </div>
              <div style={{ fontSize: "11px", color: "#444", marginTop: "1px" }}>
                {formatBytes(file.size)} · {new Date(file.modifiedAt).toLocaleTimeString()}
              </div>
            </div>
            <a
              href={api.getFileUrl(taskId, file.relativePath)}
              download={file.name}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: "11px",
                color: "#3b82f6",
                textDecoration: "none",
                flexShrink: 0,
                padding: "2px 6px",
                borderRadius: "4px",
                border: "1px solid #1e3a5f",
              }}
            >
              ↓
            </a>
          </div>
        ))}
      </div>

      {/* Preview pane */}
      {preview && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{
            padding: "10px 14px",
            borderBottom: "1px solid #1a1a1a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <span style={{ fontSize: "12px", color: "#888", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {preview.path}
            </span>
            <button
              onClick={() => setPreview(null)}
              style={{
                background: "none",
                border: "none",
                color: "#555",
                cursor: "pointer",
                fontSize: "16px",
                lineHeight: 1,
                padding: "0 2px",
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
          {preview.content === "__image__" ? (
            <div style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={api.getFileUrl(taskId, preview.path)}
                alt={preview.path}
                style={{ maxWidth: "100%", borderRadius: 4, border: "1px solid #1a1a1a" }}
              />
            </div>
          ) : (
            <pre style={{
              flex: 1,
              margin: 0,
              padding: "14px",
              fontSize: "12px",
              color: previewLoading ? "#444" : "#bbb",
              fontFamily: "monospace",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              lineHeight: "1.6",
            }}>
              {preview.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
