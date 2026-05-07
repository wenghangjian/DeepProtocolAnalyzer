import type { BrowserWindow } from "electron";
import type {
  ConnectionState,
  SessionEvent,
  SessionState,
  SessionStatus,
  TrafficEvent
} from "../../packages/shared-types";
import { TrafficBatcher } from "./traffic-batcher";
import { WorkerPool, type WorkerCallbacks, type WorkerRequestType } from "./worker-pool";

// ── Types ─────────────────────────────────────────────────────────────

export interface SessionEntry {
  session: SessionState;
  traffic: TrafficEvent[];
}

// ── SessionManager Class ──────────────────────────────────────────────

/**
 * Manages session lifecycle, state tracking, and event publishing.
 * Coordinates between the WorkerPool and TrafficBatcher.
 */
export class SessionManager {
  private sessions = new Map<string, SessionEntry>();
  private workerPool: WorkerPool;
  private trafficBatcher: TrafficBatcher;
  private getMainWindow: () => BrowserWindow | null;

  constructor(
    workerPool: WorkerPool,
    trafficBatcher: TrafficBatcher,
    getMainWindow: () => BrowserWindow | null
  ) {
    this.workerPool = workerPool;
    this.trafficBatcher = trafficBatcher;
    this.getMainWindow = getMainWindow;
  }

  // ── Session Lifecycle ─────────────────────────────────────────────

  /** Create a new session entry and register it with the traffic batcher. */
  addSession(sessionId: string, sessionState: SessionState): void {
    const entry: SessionEntry = {
      session: sessionState,
      traffic: []
    };
    this.sessions.set(sessionId, entry);
    this.trafficBatcher.registerSession(sessionId);
  }

  /** Remove a session and clean up its traffic buffer. */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.trafficBatcher.unregisterSession(sessionId);
    this.trafficBatcher.stopTimerIfIdle(this.sessions.size);
  }

  /** Check if a session exists. */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Get a session entry, throwing if not found. */
  getEntry(sessionId: string): SessionEntry {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return entry;
  }

  /** Get a session entry or undefined. */
  getEntryOrUndefined(sessionId: string): SessionEntry | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get all session states as an array. */
  listSessions(): SessionState[] {
    return Array.from(this.sessions.values()).map(({ session }) => session);
  }

  /** Get the number of active sessions. */
  get size(): number {
    return this.sessions.size;
  }

  // ── Traffic Management ────────────────────────────────────────────

  /** Enqueue a traffic event for a session (stores in session buffer + batch buffer). */
  enqueueTraffic(sessionId: string, event: TrafficEvent): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return;
    }

    entry.traffic.push(event);
    if (entry.traffic.length > 10000) {
      entry.traffic.shift();
      this.getMainWindow()?.webContents.send("traffic:warning", {
        sessionId,
        message: "Traffic buffer reached 10,000 frames and dropped the oldest entry."
      });
    }

    this.trafficBatcher.enqueue(sessionId, event);
  }

  /** Clear the traffic buffer for a session. */
  clearTraffic(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.traffic = [];
    }
    this.trafficBatcher.clear(sessionId);
  }

  // ── Status & Event Publishing ─────────────────────────────────────

  /** Publish a session status change to the renderer. */
  publishStatus(sessionId: string, status: SessionStatus, lastError?: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return;
    }

    entry.session.status = status;
    entry.session.lastError = lastError;
    this.getMainWindow()?.webContents.send("session:status-changed", {
      sessionId,
      status,
      lastError
    });
  }

  /** Publish a session event to the renderer and update internal state. */
  publishEvent(sessionId: string, event: SessionEvent): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return;
    }

    if (event.type === "connection-state") {
      entry.session.connectionState = event.state;
      this.publishStatus(
        sessionId,
        mapConnectionStateToStatus(event.state),
        event.reason ?? entry.session.lastError
      );
    } else if (event.type === "handshake") {
      entry.session.handshakePhase = `${event.handshakeId}:${event.stepId}:${event.status}`;
    } else if (event.type === "transaction") {
      entry.session.activeTransactionId =
        event.state === "completed" || event.state === "failed" || event.state === "timed_out"
          ? undefined
          : event.transactionId;
    }

    this.getMainWindow()?.webContents.send("session:event", event);
  }

  // ── Worker Delegation ─────────────────────────────────────────────

  /** Send a request to a session's worker. */
  requestWorker<T>(sessionId: string, type: WorkerRequestType, data?: Record<string, unknown>): Promise<T> {
    return this.workerPool.request<T>(sessionId, type, data);
  }

  /** Destroy a session: send destroy to worker, kill worker, clean up. */
  async destroySession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      return;
    }

    try {
      await this.requestWorker(sessionId, "destroy");
    } catch {
      // Worker may already be dead
    }

    this.workerPool.kill(sessionId);
    this.removeSession(sessionId);
  }

  /** Kill all workers and clear all sessions (used on app shutdown). */
  shutdown(): void {
    this.workerPool.killAll();
    this.sessions.clear();
    this.trafficBatcher.destroy();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function mapConnectionStateToStatus(state: ConnectionState): SessionStatus {
  switch (state) {
    case "connecting":
    case "transport_connected":
    case "handshaking":
      return "connecting";
    case "ready":
    case "degraded":
      return "connected";
    case "error":
      return "error";
    default:
      return "disconnected";
  }
}
