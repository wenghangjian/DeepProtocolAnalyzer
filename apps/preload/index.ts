import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";
import type {
  PollTask,
  ProtocolManifest,
  SessionEvent,
  SerialPortInfo,
  SessionState,
  TrafficEvent
} from "../../packages/shared-types";

const SessionCreateSchema = z.object({
  sessionId: z.string().min(1),
  protocolId: z.string().min(1),
  transport: z.enum(["tcp", "serial", "udp"]),
  config: z.record(z.unknown())
});

const ReadRequestSchema = z.object({
  address: z.string().min(1),
  length: z.number().int().positive(),
  functionCode: z.number().int().min(1).max(255).optional(),
  unitId: z.number().int().min(1).max(247).optional(),
  dataType: z.enum(["uint16", "int16", "float32", "bool", "raw"]).optional(),
  timeoutMs: z.number().int().positive().optional()
});

const WriteRequestSchema = z.object({
  address: z.string().min(1),
  data: z.instanceof(Uint8Array),
  functionCode: z.number().int().min(1).max(255).optional(),
  unitId: z.number().int().min(1).max(247).optional(),
  timeoutMs: z.number().int().positive().optional()
});

const PollTaskSchema = z.object({
  taskId: z.string().min(1),
  address: z.string().min(1),
  length: z.number().int().positive(),
  intervalMs: z.number().int().min(10),
  functionCode: z.number().int().min(1).max(255).optional(),
  unitId: z.number().int().min(1).max(247).optional(),
  dataType: z.enum(["uint16", "int16", "float32", "bool", "raw"]).optional()
});

function createListener<T>(channel: string) {
  return (callback: (payload: T) => void) => {
    const handler = (_event: unknown, payload: unknown) => callback(payload as T);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.off(channel, handler);
    };
  };
}

contextBridge.exposeInMainWorld("sessionApi", {
  create: (data: unknown) => {
    const validated = SessionCreateSchema.parse(data);
    return ipcRenderer.invoke("session:create", validated) as Promise<{
      success: boolean;
      error?: string;
      session?: SessionState;
    }>;
  },
  connect: (sessionId: string) => ipcRenderer.invoke("session:connect", sessionId),
  disconnect: (sessionId: string) => ipcRenderer.invoke("session:disconnect", sessionId),
  list: () => ipcRenderer.invoke("session:list") as Promise<SessionState[]>,
  status: (sessionId: string) => ipcRenderer.invoke("session:status", sessionId) as Promise<SessionState | null>,
  onStatusChange: createListener<{ sessionId: string; status: SessionState["status"]; lastError?: string }>(
    "session:status-changed"
  ),
  onEvent: createListener<SessionEvent>("session:event"),
  onCrash: createListener<{ sessionId: string; code?: number }>("session:crashed")
});

contextBridge.exposeInMainWorld("protocolApi", {
  read: (sessionId: string, request: unknown) => {
    const validated = ReadRequestSchema.parse(request);
    return ipcRenderer.invoke("protocol:read", sessionId, validated) as Promise<Uint8Array>;
  },
  write: (sessionId: string, request: unknown) => {
    const validated = WriteRequestSchema.parse(request);
    return ipcRenderer.invoke("protocol:write", sessionId, validated) as Promise<boolean>;
  },
  invoke: (sessionId: string, action: string, payload?: unknown) => {
    return ipcRenderer.invoke("protocol:invoke", sessionId, action, payload) as Promise<unknown>;
  }
});

contextBridge.exposeInMainWorld("trafficApi", {
  subscribe: createListener<{ sessionId: string; events: TrafficEvent[] }>("traffic:batch"),
  subscribeWarning: createListener<{ sessionId: string; message: string }>("traffic:warning"),
  clear: (sessionId: string) => ipcRenderer.invoke("traffic:clear", sessionId) as Promise<{ success: boolean }>
});

contextBridge.exposeInMainWorld("taskApi", {
  start: (sessionId: string, task: unknown) => {
    const validated = PollTaskSchema.parse(task);
    return ipcRenderer.invoke("task:start", sessionId, validated) as Promise<{ success: boolean }>;
  },
  stop: (sessionId: string, taskId: string) => ipcRenderer.invoke("task:stop", sessionId, taskId) as Promise<{ success: boolean }>,
  list: (sessionId: string) => ipcRenderer.invoke("task:list", sessionId) as Promise<PollTask[]>
});

contextBridge.exposeInMainWorld("configApi", {
  get: (key: string) => ipcRenderer.invoke("config:get", key),
  set: (key: string, value: unknown) => ipcRenderer.invoke("config:set", key, value) as Promise<{ success: boolean }>
});

contextBridge.exposeInMainWorld("templateApi", {
  list: () => ipcRenderer.invoke("template:list"),
  save: (template: unknown) => ipcRenderer.invoke("template:save", template),
  load: (templateId: string) => ipcRenderer.invoke("template:load", templateId),
  delete: (templateId: string) => ipcRenderer.invoke("template:delete", templateId),
  export: (templateId: string, filePath?: string) => ipcRenderer.invoke("template:export", templateId, filePath),
  import: (filePath?: string) => ipcRenderer.invoke("template:import", filePath)
});

contextBridge.exposeInMainWorld("credentialApi", {
  store: (target: string, username: string, password: string) => {
    return ipcRenderer.invoke("credential:store", { target, username, password }) as Promise<{ success: boolean; error?: string }>;
  },
  retrieve: (target: string) => {
    return ipcRenderer.invoke("credential:retrieve", target) as Promise<{
      success: boolean;
      credential?: { target: string; username: string; password: string };
      error?: string;
    }>;
  },
  delete: (target: string) => {
    return ipcRenderer.invoke("credential:delete", target) as Promise<{ success: boolean; error?: string }>;
  },
  list: (prefix: string) => {
    return ipcRenderer.invoke("credential:list", { prefix }) as Promise<{
      success: boolean;
      targets?: string[];
      error?: string;
    }>;
  }
});

contextBridge.exposeInMainWorld("pluginApi", {
  list: () => ipcRenderer.invoke("plugin:list") as Promise<ProtocolManifest[]>,
  load: (pluginId: string) => ipcRenderer.invoke("plugin:load", pluginId) as Promise<{ success: boolean }>,
  unload: (pluginId: string) => ipcRenderer.invoke("plugin:unload", pluginId) as Promise<{ success: boolean }>
});

contextBridge.exposeInMainWorld("resourceApi", {
  listSerialPorts: () => ipcRenderer.invoke("resource:serial-ports") as Promise<SerialPortInfo[]>
});

contextBridge.exposeInMainWorld("logApi", {
  query: (filter?: { level?: "info" | "warn" | "error"; limit?: number }) => {
    return ipcRenderer.invoke("log:query", filter) as Promise<
      Array<{ timestamp: number; level: "info" | "warn" | "error"; message: string; meta?: unknown }>
    >;
  },
  getLogFilePath: () => ipcRenderer.invoke("log:getFilePath") as Promise<string>,
  getRecentLogs: (count?: number) => ipcRenderer.invoke("log:getRecent", count) as Promise<string[]>,
  exportLogs: (filePath?: string) => ipcRenderer.invoke("log:export", filePath) as Promise<string | null>,
  openLogDirectory: () => ipcRenderer.invoke("log:openDirectory") as Promise<void>
});

contextBridge.exposeInMainWorld("benchmarkApi", {
  throughput: (options?: {
    durationMs?: number;
    targetMsgPerSec?: number;
    messageSize?: number;
    concurrent?: number;
  }) => ipcRenderer.invoke("benchmark:throughput", options) as Promise<{
    success: boolean;
    result?: import("../../packages/benchmark").ThroughputResult;
    error?: string;
  }>,
  memory: (options?: {
    durationMs?: number;
    sampleIntervalMs?: number;
  }) => ipcRenderer.invoke("benchmark:memory", options) as Promise<{
    success: boolean;
    result?: import("../../packages/benchmark").MemoryResult;
    error?: string;
  }>,
  concurrency: (options?: {
    sessionCount?: number;
    durationMs?: number;
    targetMsgPerSec?: number;
  }) => ipcRenderer.invoke("benchmark:concurrency", options) as Promise<{
    success: boolean;
    result?: import("../../packages/benchmark").ConcurrencyResult;
    error?: string;
  }>,
  system: () => ipcRenderer.invoke("benchmark:system") as Promise<{
    success: boolean;
    metrics?: import("../../packages/benchmark").SystemMetrics;
    validation?: import("../../packages/benchmark").SpecValidation;
    error?: string;
  }>
});
