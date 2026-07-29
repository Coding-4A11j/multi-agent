"use client";

import { useEffect, useRef, useCallback } from "react";
import type { AgentEvent } from "@multi-agent/shared";

interface UseSSEOptions {
  onEvent: (event: AgentEvent) => void;
  onError?: (err: Event) => void;
  enabled?: boolean;
}

export function useSSE(taskId: string | null, options: UseSSEOptions): void {
  const { onEvent, onError, enabled = true } = options;
  const esRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);

  onEventRef.current = onEvent;
  onErrorRef.current = onError;

  const connect = useCallback(() => {
    if (!taskId || !enabled) return;

    const es = new EventSource(`/api/tasks/${taskId}/stream`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as AgentEvent;
        onEventRef.current(event);
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = (err) => {
      onErrorRef.current?.(err);
      es.close();
      // Reconnect after 3s with exponential backoff (simplified)
      setTimeout(() => {
        if (esRef.current === es) connect();
      }, 3000);
    };
  }, [taskId, enabled]);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);
}
