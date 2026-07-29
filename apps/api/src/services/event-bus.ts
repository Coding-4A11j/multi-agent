import { EventEmitter } from "events";
import type { AgentEvent } from "@multi-agent/shared";

class EventBus extends EventEmitter {
  emit(event: string, data: AgentEvent): boolean {
    return super.emit(event, data);
  }

  emitTaskEvent(taskId: string, data: AgentEvent): void {
    this.emit(`task:${taskId}`, data);
  }

  onTaskEvent(taskId: string, handler: (data: AgentEvent) => void): () => void {
    this.on(`task:${taskId}`, handler);
    return () => this.off(`task:${taskId}`, handler);
  }
}

export const eventBus = new EventBus();
eventBus.setMaxListeners(200);
