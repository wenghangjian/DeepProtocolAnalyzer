import type {
  PollTask,
  ProtocolManifest,
  SessionEvent,
  SerialPortInfo,
  SessionState,
  TrafficEvent
} from "../../packages/shared-types";
import type {
  ThroughputResult,
  MemoryResult,
  ConcurrencyResult,
  SystemMetrics,
  SpecValidation
} from "../../packages/benchmark";

interface ConfigTemplate {
  id: string;
  name: string;
  protocol: string;
  config: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

declare global {
  interface Window {
    sessionApi: {
      create: (data: unknown) => Promise<{ success: boolean; error?: string; session?: SessionState }>;
      connect: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
      disconnect: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
      list: () => Promise<SessionState[]>;
      status: (sessionId: string) => Promise<SessionState | null>;
      onStatusChange: (callback: (payload: { sessionId: string; status: SessionState["status"]; lastError?: string }) => void) => () => void;
      onEvent: (callback: (payload: SessionEvent) => void) => () => void;
      onCrash: (callback: (payload: { sessionId: string; code?: number }) => void) => () => void;
    };
    protocolApi: {
      read: (sessionId: string, request: unknown) => Promise<Uint8Array>;
      write: (sessionId: string, request: unknown) => Promise<boolean>;
      invoke: (sessionId: string, action: string, payload?: unknown) => Promise<unknown>;
    };
    trafficApi: {
      subscribe: (callback: (payload: { sessionId: string; events: TrafficEvent[] }) => void) => () => void;
      subscribeWarning: (callback: (payload: { sessionId: string; message: string }) => void) => () => void;
      clear: (sessionId: string) => Promise<{ success: boolean }>;
    };
    taskApi: {
      start: (sessionId: string, task: unknown) => Promise<{ success: boolean }>;
      stop: (sessionId: string, taskId: string) => Promise<{ success: boolean }>;
      list: (sessionId: string) => Promise<PollTask[]>;
    };
    configApi: {
      get: (key: string) => Promise<unknown>;
      set: (key: string, value: unknown) => Promise<{ success: boolean }>;
    };
    templateApi: {
      list: () => Promise<ConfigTemplate[]>;
      save: (template: unknown) => Promise<{ success: boolean; template?: ConfigTemplate; error?: string }>;
      load: (templateId: string) => Promise<{ success: boolean; template?: ConfigTemplate; error?: string }>;
      delete: (templateId: string) => Promise<{ success: boolean; error?: string }>;
      export: (templateId: string, filePath?: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      import: (filePath?: string) => Promise<{ success: boolean; template?: ConfigTemplate; error?: string }>;
    };
    credentialApi: {
      store: (target: string, username: string, password: string) => Promise<{ success: boolean; error?: string }>;
      retrieve: (target: string) => Promise<{
        success: boolean;
        credential?: { target: string; username: string; password: string };
        error?: string;
      }>;
      delete: (target: string) => Promise<{ success: boolean; error?: string }>;
      list: (prefix: string) => Promise<{ success: boolean; targets?: string[]; error?: string }>;
    };
    pluginApi: {
      list: () => Promise<ProtocolManifest[]>;
      load: (pluginId: string) => Promise<{ success: boolean }>;
      unload: (pluginId: string) => Promise<{ success: boolean }>;
    };
    resourceApi: {
      listSerialPorts: () => Promise<SerialPortInfo[]>;
    };
    logApi: {
      query: (filter?: { level?: "info" | "warn" | "error"; limit?: number }) => Promise<
        Array<{ timestamp: number; level: "info" | "warn" | "error"; message: string; meta?: unknown }>
      >;
      getLogFilePath: () => Promise<string>;
      getRecentLogs: (count?: number) => Promise<string[]>;
      exportLogs: (filePath?: string) => Promise<string | null>;
      openLogDirectory: () => Promise<void>;
    };
    benchmarkApi: {
      throughput: (options?: {
        durationMs?: number;
        targetMsgPerSec?: number;
        messageSize?: number;
        concurrent?: number;
      }) => Promise<{ success: boolean; result?: ThroughputResult; error?: string }>;
      memory: (options?: {
        durationMs?: number;
        sampleIntervalMs?: number;
      }) => Promise<{ success: boolean; result?: MemoryResult; error?: string }>;
      concurrency: (options?: {
        sessionCount?: number;
        durationMs?: number;
        targetMsgPerSec?: number;
      }) => Promise<{ success: boolean; result?: ConcurrencyResult; error?: string }>;
      system: () => Promise<{
        success: boolean;
        metrics?: SystemMetrics;
        validation?: SpecValidation;
        error?: string;
      }>;
    };
  }
}

export {};
