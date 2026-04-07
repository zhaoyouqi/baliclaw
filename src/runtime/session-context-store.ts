export interface SessionCompactionInfo {
  trigger: "manual" | "auto";
  preTokens: number;
  compactedAt: string;
}

export interface SessionTodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm: string;
}

export interface SessionTodoSnapshot {
  todos: SessionTodoItem[];
  updatedAt: string;
}

export interface SessionContextSnapshot {
  estimatedInputTokens?: number;
  compacting: boolean;
  lastCompaction?: SessionCompactionInfo;
  todo?: SessionTodoSnapshot;
  updatedAt: string;
}

export class SessionContextStore {
  private readonly snapshots = new Map<string, SessionContextSnapshot>();

  get(sessionId: string): SessionContextSnapshot | undefined {
    return this.snapshots.get(sessionId);
  }

  set(sessionId: string, snapshot: SessionContextSnapshot): void {
    this.snapshots.set(sessionId, snapshot);
  }

  delete(sessionId: string): void {
    this.snapshots.delete(sessionId);
  }
}
