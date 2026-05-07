import { utilityProcess } from "electron";
import path from "path";
import { z } from "zod";
import log from "electron-log";
import type {
  ConnectionState,
  SessionEvent,
  SessionStatus,
  TrafficEvent
} from "../../packages/shared-types";

// ── Types ─────────────────────────────────────────────────────────────

export type WorkerRequestType =
  | "init"
  | "connect"
  | "disconnect"
  | "read"
  | "write"
  | "invokeCapability"
  | "startPolling"
  | "stopPolling"
  | "destroy";

export interface WorkerRequest {
  id: number;
  type: WorkerRequestType;
  sessionId: string;
  data?: Record<string, unknown>;
}

export interface WorkerResponse {
  id?: number;
  type?: "traffic" | "status" | "session-event";
  sessionId?: string;
  data?: unknown;
  success?: boolean;
  error?: string;
}

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

export interface WorkerHandle {
  worker: ReturnType<typeof utilityProcess.fork>;
  pendingRequests: Map<number, PendingRequest>;
}

// ── Zod Schemas for Worker Messages ───────────────────────────────────

const WorkerStatusDataSchema = z.object({
  status: z.enum(["disconnected", "connecting", "connected", "error"]),
  error: z.string().optional()
});

const WorkerBaseMessageSchema = z.object({
  type: z.string().optional(),
  id: z.number().optional(),
  sessionId: z.string().optional(),
  success: z.boolean().optional(),
  data: z.unknown().optional(),
  error: z.string().optional()
});

// ── Callbacks Interface ───────────────────────────────────────────────

export interface WorkerCallbacks {
  onTraffic: (sessionId: string, event: TrafficEvent) => void;
  onStatusChange: (sessionId: string, status: SessionStatus, lastError?: string) => void;
  onSessionEvent: (sessionId: string, event: SessionEvent) => void;
  onWorkerExit: (sessionId: string, code: number) => void;
}

// ── WorkerPool Class ──────────────────────────────────────────────────

/**
 * Manages worker process lifecycle, message routing, and request/response correlation.
 */
export class WorkerPool {
  private workers = new Map<string, WorkerHandle>();
  private requestCounter = 0;
  private callbacks: WorkerCallbacks;
  private workerScriptPath: string;

  constructor(
    workerScriptPath: string,
    callbacks: WorkerCallbacks
  ) {
    this.workerScriptPath = workerScriptPath;
    this.callbacks = callbacks;
  }

  /** Spawn a new worker for a session and attach message listeners. */
  spawn(sessionId: string): WorkerHandle {
    const worker = utilityProcess.fork(this.workerScriptPath);
    const handle: WorkerHandle = {
      worker,
      pendingRequests: new Map()
    };

    this.workers.set(sessionId, handle);
    this.attachListeners(sessionId, worker);
    return handle;
  }

  /** Get the worker handle for a session, throwing if not found. */
  getHandle(sessionId: string): WorkerHandle {
    const handle = this.workers.get(sessionId);
    if (!handle) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return handle;
  }

  /** Check if a worker exists for a session. */
  has(sessionId: string): boolean {
    return this.workers.has(sessionId);
  }

  /** Send a request to a worker and return a promise for the response. */
  request<T>(sessionId: string, type: WorkerRequestType, data?: Record<string, unknown>): Promise<T> {
    const handle = this.getHandle(sessionId);
    const id = ++this.requestCounter;
    const request: WorkerRequest = { id, type, sessionId, data };

    return new Promise<T>((resolve, reject) => {
      handle.pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject
      });
      handle.worker.postMessage(request);
    });
  }

  /** Kill a worker and clean up its state. */
  kill(sessionId: string): void {
    const handle = this.workers.get(sessionId);
    if (!handle) {
      return;
    }

    handle.worker.kill();
    this.workers.delete(sessionId);
  }

  /** Kill all workers (used on app shutdown). */
  killAll(): void {
    for (const [sessionId, handle] of this.workers.entries()) {
      handle.worker.kill();
    }
    this.workers.clear();
  }

  /** Get the number of active workers. */
  get size(): number {
    return this.workers.size;
  }

  /** Get all session IDs with active workers. */
  getSessionIds(): string[] {
    return Array.from(this.workers.keys());
  }

  // ── Private ─────────────────────────────────────────────────────────

  private attachListeners(sessionId: string, worker: ReturnType<typeof utilityProcess.fork>): void {
    worker.on("message", (message: unknown) => {
      const parsed = WorkerBaseMessageSchema.safeParse(message);
      if (!parsed.success) {
        log.warn(`[worker:${sessionId}] Invalid message received, ignoring:`, parsed.error.format());
        return;
      }

      const payload = parsed.data;
      const handle = this.workers.get(sessionId);
      if (!handle) {
        return;
      }

      if (payload.type === "traffic" && payload.data) {
        this.callbacks.onTraffic(sessionId, payload.data as TrafficEvent);
        return;
      }

      if (payload.type === "status" && payload.data) {
        const statusParsed = WorkerStatusDataSchema.safeParse(payload.data);
        if (statusParsed.success) {
          this.callbacks.onStatusChange(sessionId, statusParsed.data.status, statusParsed.data.error);
        } else {
          log.warn(`[worker:${sessionId}] Invalid status data:`, statusParsed.error.format());
        }
        return;
      }

      if (payload.type === "session-event" && payload.data) {
        this.callbacks.onSessionEvent(sessionId, payload.data as SessionEvent);
        return;
      }

      if (typeof payload.id === "number") {
        const pending = handle.pendingRequests.get(payload.id);
        if (!pending) {
          return;
        }

        handle.pendingRequests.delete(payload.id);
        if (payload.success) {
          pending.resolve(payload.data);
          return;
        }

        pending.reject(new Error(payload.error ?? "Unknown worker error"));
      }
    });

    worker.on("exit", (code: number) => {
      this.callbacks.onWorkerExit(sessionId, code);
    });
  }
}
