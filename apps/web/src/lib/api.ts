import type { Task, TaskRun, TaskLog, OpenRouterModel } from "@multi-agent/shared";
import type { CreateTaskInput } from "@multi-agent/shared";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: init?.body != null ? { "Content-Type": "application/json" } : {},
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as { error: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface TaskDetail extends Task {
  runs: (TaskRun & { steps: NonNullable<TaskRun["steps"]> })[];
  logs: TaskLog[];
}

export interface FileEntry {
  name: string;
  relativePath: string;
  size: number;
  modifiedAt: string;
  isDirectory: boolean;
}

export const api = {
  createTask: (body: CreateTaskInput) =>
    request<Task>("/tasks", { method: "POST", body: JSON.stringify(body) }),

  listTasks: () => request<TaskDetail[]>("/tasks"),

  getTask: (id: string) => request<TaskDetail>(`/tasks/${id}`),

  cancelTask: (id: string) =>
    request<{ ok: boolean }>(`/tasks/${id}/cancel`, { method: "PATCH" }),

  deleteTask: (id: string) =>
    request<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" }),

  getLogs: (id: string, params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
    ).toString();
    return request<TaskLog[]>(`/tasks/${id}/logs${qs ? `?${qs}` : ""}`);
  },

  getModels: () => request<OpenRouterModel[]>("/models"),

  getTaskFiles: (id: string) => request<FileEntry[]>(`/tasks/${id}/files`),

  getFileUrl: (id: string, relativePath: string) =>
    `${BASE}/tasks/${id}/files/${relativePath}`,
};
