import type { BrowserWindow } from "electron";
import type { TrafficEvent } from "../../packages/shared-types";

/**
 * Manages traffic event batching for efficient renderer updates.
 * Buffers traffic events per session and flushes them at ~60fps (16ms intervals).
 */
export class TrafficBatcher {
  private buffers = new Map<string, TrafficEvent[]>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private getMainWindow: () => BrowserWindow | null) {}

  /** Register a new session's traffic buffer and ensure the flush timer is running. */
  registerSession(sessionId: string): void {
    this.buffers.set(sessionId, []);
    this.ensureTimer();
  }

  /** Remove a session's traffic buffer. */
  unregisterSession(sessionId: string): void {
    this.buffers.delete(sessionId);
  }

  /** Append a traffic event to the session's batch buffer. */
  enqueue(sessionId: string, event: TrafficEvent): void {
    const batch = this.buffers.get(sessionId);
    if (batch) {
      batch.push(event);
    }
  }

  /** Flush all pending batch buffers to the renderer. */
  flush(): void {
    const win = this.getMainWindow();
    for (const [sessionId, batch] of this.buffers.entries()) {
      if (batch.length === 0) {
        continue;
      }

      win?.webContents.send("traffic:batch", {
        sessionId,
        events: [...batch]
      });
      batch.length = 0;
    }
  }

  /** Start the flush timer if not already running. */
  ensureTimer(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => this.flush(), 16);
  }

  /** Stop the flush timer if there are no active sessions. */
  stopTimerIfIdle(activeSessionCount: number): void {
    if (activeSessionCount > 0 || !this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  /** Clear the batch buffer for a specific session. */
  clear(sessionId: string): void {
    this.buffers.set(sessionId, []);
  }

  /** Stop the timer and clear all buffers (used on app shutdown). */
  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.buffers.clear();
  }
}
