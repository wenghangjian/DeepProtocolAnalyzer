import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from "electron";
import { SerialPort } from "serialport";
import { z } from "zod";
import log from "electron-log";
import { readFile } from "fs/promises";

// Configure electron-log transports
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB rolling files
log.transports.file.format = "{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}";
log.transports.console.format = "{h}:{i}:{s}.{ms} [{level}] {text}";

// Custom archive function for 7-file rotation
const MAX_ROTATED_FILES = 7;
log.transports.file.archiveLogFn = (file) => {
  try {
    const logPath = file.path;
    const ext = path.extname(logPath);
    const base = logPath.slice(0, -ext.length);

    // Shift existing rotated files: .6 → deleted, .5 → .6, ..., .1 → .2, current → .1
    for (let i = MAX_ROTATED_FILES - 1; i >= 1; i--) {
      const older = `${base}.${i}${ext}`;
      const newer = `${base}.${i + 1}${ext}`;
      if (i === MAX_ROTATED_FILES - 1) {
        try { fsSync.unlinkSync(newer); } catch { /* ignore */ }
      }
      try { fsSync.renameSync(older, newer); } catch { /* ignore */ }
    }
    try { fsSync.renameSync(logPath, `${base}.1${ext}`); } catch { /* ignore */ }
  } catch {
    // Fallback: just let electron-log handle it
  }
};
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import fsSync from "fs";
import type {
  ConnectionState,
  PollTask,
  ProtocolManifest,
  SerialPortInfo,
  SessionEvent,
  SessionState,
  SessionStatus,
  TrafficEvent
} from "../../packages/shared-types";
import { saveConfig, loadConfig, listTemplates, saveTemplate, loadTemplate, deleteTemplate, exportTemplate, importTemplateFromFile, type ConfigTemplateInput } from "../../packages/config-manager";
import {
  storeCredential,
  retrieveCredential,
  deleteCredential,
  listCredentials,
  extractSensitiveFields,
  resolveCredentialRefs,
  deleteSessionCredentials
} from "../../packages/credential-store";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const protocolsDir = path.resolve(__dirname, "../../protocols");
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

type WorkerRequestType =
  | "init"
  | "connect"
  | "disconnect"
  | "read"
  | "write"
  | "invokeCapability"
  | "startPolling"
  | "stopPolling"
  | "destroy";

interface WorkerRequest {
  id: number;
  type: WorkerRequestType;
  sessionId: string;
  data?: Record<string, unknown>;
}

interface WorkerResponse {
  id?: number;
  type?: "traffic" | "status" | "session-event";
  sessionId?: string;
  data?: unknown;
  success?: boolean;
  error?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}

interface WorkerSession {
  session: SessionState;
  worker: ReturnType<typeof utilityProcess.fork>;
  pendingRequests: Map<number, PendingRequest>;
  traffic: TrafficEvent[];
}

interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
  meta?: unknown;
}

const SessionCreateSchema = z.object({
  sessionId: z.string().min(1),
  protocolId: z.string().min(1),
  transport: z.enum(["tcp", "serial", "udp"]),
  config: z.record(z.unknown())
});

const RequestSessionIdSchema = z.string().min(1);
const TaskSchema = z.object({
  taskId: z.string().min(1),
  address: z.string().min(1),
  length: z.number().int().positive(),
  intervalMs: z.number().int().min(10),
  functionCode: z.number().int().min(1).max(255).optional(),
  unitId: z.number().int().min(1).max(247).optional(),
  dataType: z.enum(["uint16", "int16", "float32", "bool", "raw"]).optional()
});

const WorkerStatusDataSchema = z.object({
  status: z.enum(["disconnected", "connecting", "connected", "error"]),
  error: z.string().optional()
});

const WorkerTrafficMessageSchema = z.object({
  type: z.literal("traffic"),
  sessionId: z.string(),
  data: z.unknown()
});

const WorkerStatusMessageSchema = z.object({
  type: z.literal("status"),
  sessionId: z.string(),
  data: WorkerStatusDataSchema
});

const WorkerSessionEventMessageSchema = z.object({
  type: z.literal("session-event"),
  sessionId: z.string(),
  data: z.unknown()
});

const WorkerBaseMessageSchema = z.object({
  type: z.string().optional(),
  id: z.number().optional(),
  sessionId: z.string().optional(),
  success: z.boolean().optional(),
  data: z.unknown().optional(),
  error: z.string().optional()
});

const sessions = new Map<string, WorkerSession>();
const loadedPlugins = new Set<string>();
const logBuffer: LogEntry[] = [];
const trafficBatchBuffers = new Map<string, TrafficEvent[]>();
let batchTimer: NodeJS.Timeout | null = null;
let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
let requestCounter = 0;

function recordLog(level: LogEntry["level"], message: string, meta?: unknown) {
  log[level](message, meta ?? "");
  logBuffer.push({ timestamp: Date.now(), level, message, meta });
  if (logBuffer.length > 1000) {
    logBuffer.shift();
  }
}

function getDevServerUrl() {
  return process.env.VITE_DEV_SERVER_URL;
}

function publishSessionStatus(sessionId: string, status: SessionStatus, lastError?: string) {
  const sessionEntry = sessions.get(sessionId);
  if (!sessionEntry) {
    return;
  }

  sessionEntry.session.status = status;
  sessionEntry.session.lastError = lastError;
  mainWindow?.webContents.send("session:status-changed", {
    sessionId,
    status,
    lastError
  });
}

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

function publishSessionEvent(sessionId: string, event: SessionEvent) {
  const sessionEntry = sessions.get(sessionId);
  if (!sessionEntry) {
    return;
  }

  if (event.type === "connection-state") {
    sessionEntry.session.connectionState = event.state;
    publishSessionStatus(
      sessionId,
      mapConnectionStateToStatus(event.state),
      event.reason ?? sessionEntry.session.lastError
    );
  } else if (event.type === "handshake") {
    sessionEntry.session.handshakePhase = `${event.handshakeId}:${event.stepId}:${event.status}`;
  } else if (event.type === "transaction") {
    sessionEntry.session.activeTransactionId =
      event.state === "completed" || event.state === "failed" || event.state === "timed_out"
        ? undefined
        : event.transactionId;
  }

  mainWindow?.webContents.send("session:event", event);
}

function enqueueTraffic(sessionId: string, event: TrafficEvent) {
  const sessionEntry = sessions.get(sessionId);
  if (!sessionEntry) {
    return;
  }

  sessionEntry.traffic.push(event);
  if (sessionEntry.traffic.length > 10000) {
    sessionEntry.traffic.shift();
    mainWindow?.webContents.send("traffic:warning", {
      sessionId,
      message: "Traffic buffer reached 10,000 frames and dropped the oldest entry."
    });
  }

  const batch = trafficBatchBuffers.get(sessionId);
  if (batch) {
    batch.push(event);
  }
}

function flushTrafficBatch() {
  for (const [sessionId, batch] of trafficBatchBuffers.entries()) {
    if (batch.length === 0) {
      continue;
    }

    mainWindow?.webContents.send("traffic:batch", {
      sessionId,
      events: [...batch]
    });
    batch.length = 0;
  }
}

function ensureBatchTimer() {
  if (batchTimer) {
    return;
  }

  batchTimer = setInterval(flushTrafficBatch, 16);
}

function stopBatchTimerIfIdle() {
  if (sessions.size > 0 || !batchTimer) {
    return;
  }

  clearInterval(batchTimer);
  batchTimer = null;
}

function createWindow() {
  const preloadPath = path.join(__dirname, "../preload/index.js");
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#eef3f9",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (...args: unknown[]) => {
    const [event, targetUrl] = args as [{ preventDefault(): void }, string];
    const devServerUrl = getDevServerUrl();
    if (devServerUrl) {
      const allowedOrigin = new URL(devServerUrl).origin;
      if (!targetUrl.startsWith(allowedOrigin)) {
        event.preventDefault();
      }
      return;
    }

    if (!targetUrl.startsWith("file://")) {
      event.preventDefault();
    }
  });

  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self';"
        ]
      }
    });
  });

  const devServerUrl = getDevServerUrl();
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
    if (isDevelopment) {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}

function attachWorkerListeners(sessionId: string, worker: ReturnType<typeof utilityProcess.fork>) {
  worker.on("message", (message: unknown) => {
    const parsed = WorkerBaseMessageSchema.safeParse(message);
    if (!parsed.success) {
      log.warn(`[worker:${sessionId}] Invalid message received, ignoring:`, parsed.error.format());
      return;
    }

    const payload = parsed.data;
    const sessionEntry = sessions.get(sessionId);
    if (!sessionEntry) {
      return;
    }

    if (payload.type === "traffic" && payload.data) {
      enqueueTraffic(sessionId, payload.data as TrafficEvent);
      return;
    }

    if (payload.type === "status" && payload.data) {
      const statusParsed = WorkerStatusDataSchema.safeParse(payload.data);
      if (statusParsed.success) {
        publishSessionStatus(sessionId, statusParsed.data.status, statusParsed.data.error);
      } else {
        log.warn(`[worker:${sessionId}] Invalid status data:`, statusParsed.error.format());
      }
      return;
    }

    if (payload.type === "session-event" && payload.data) {
      publishSessionEvent(sessionId, payload.data as SessionEvent);
      return;
    }

    if (typeof payload.id === "number") {
      const pending = sessionEntry.pendingRequests.get(payload.id);
      if (!pending) {
        return;
      }

      sessionEntry.pendingRequests.delete(payload.id);
      if (payload.success) {
        pending.resolve(payload.data);
        return;
      }

      pending.reject(new Error(payload.error ?? "Unknown worker error"));
    }
  });

  worker.on("exit", (code: number) => {
    recordLog("error", `Worker exited for session ${sessionId}`, { code });
    publishSessionStatus(sessionId, "error", `Worker exited with code ${code}`);
    mainWindow?.webContents.send("session:crashed", { sessionId, code });
  });
}

function getSessionEntry(sessionId: string) {
  const sessionEntry = sessions.get(sessionId);
  if (!sessionEntry) {
    throw new Error(`Session ${sessionId} not found`);
  }

  return sessionEntry;
}

function requestWorker<T>(sessionId: string, type: WorkerRequestType, data?: Record<string, unknown>) {
  const sessionEntry = getSessionEntry(sessionId);
  const id = ++requestCounter;
  const request: WorkerRequest = { id, type, sessionId, data };

  return new Promise<T>((resolve, reject) => {
    sessionEntry.pendingRequests.set(id, {
      resolve: (value) => resolve(value as T),
      reject
    });
    sessionEntry.worker.postMessage(request);
  });
}

async function destroySession(sessionId: string) {
  const sessionEntry = sessions.get(sessionId);
  if (!sessionEntry) {
    return;
  }

  try {
    await requestWorker(sessionId, "destroy");
  } catch (error) {
    recordLog("warn", `Destroy worker failed for session ${sessionId}`, error);
  }

  sessionEntry.worker.kill();
  sessions.delete(sessionId);
  trafficBatchBuffers.delete(sessionId);
  stopBatchTimerIfIdle();
}

async function listProtocolManifests(): Promise<ProtocolManifest[]> {
  try {
    const entries = await fs.readdir(protocolsDir, { withFileTypes: true });
    const manifests = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const manifestPath = path.join(protocolsDir, entry.name, "manifest.json");
          try {
            const content = await fs.readFile(manifestPath, "utf-8");
            return JSON.parse(content) as ProtocolManifest;
          } catch {
            return null;
          }
        })
    );

    return manifests.filter((manifest): manifest is ProtocolManifest => Boolean(manifest));
  } catch {
    return [];
  }
}

function isLikelyVirtualPort(port: {
  path: string;
  manufacturer?: string | null;
  pnpId?: string;
  friendlyName?: string;
}) {
  const fingerprint = [
    port.path,
    port.manufacturer ?? "",
    port.pnpId ?? "",
    port.friendlyName ?? ""
  ]
    .join(" ")
    .toLowerCase();

  return [
    "virtual",
    "bluetooth",
    "bth",
    "com0com",
    "tty0tty",
    "vsp",
    "emulator"
  ].some((token) => fingerprint.includes(token));
}

function mapSerialPort(port: {
  path: string;
  manufacturer?: string | null;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  vendorId?: string;
  productId?: string;
  friendlyName?: string;
}): SerialPortInfo {
  const friendlyName = port.friendlyName
    ?? port.manufacturer
    ?? port.path;
  const isLikelyVirtual = isLikelyVirtualPort(port);
  const isMappedPhysical = Boolean(
    !isLikelyVirtual && (
      port.vendorId
      || port.productId
      || port.locationId
      || port.serialNumber
      || port.manufacturer
    )
  );

  return {
    path: port.path,
    friendlyName,
    manufacturer: port.manufacturer ?? undefined,
    serialNumber: port.serialNumber,
    pnpId: port.pnpId,
    locationId: port.locationId,
    vendorId: port.vendorId,
    productId: port.productId,
    isMappedPhysical,
    isLikelyVirtual
  };
}

async function listSerialPorts(): Promise<SerialPortInfo[]> {
  const ports = await SerialPort.list();
  return ports
    .map(mapSerialPort)
    .sort((left, right) => {
      if (left.isMappedPhysical !== right.isMappedPhysical) {
        return left.isMappedPhysical ? -1 : 1;
      }
      if (left.isLikelyVirtual !== right.isLikelyVirtual) {
        return left.isLikelyVirtual ? 1 : -1;
      }
      return left.path.localeCompare(right.path, undefined, { numeric: true });
    });
}

async function validateResources(transport: "tcp" | "serial" | "udp", config: Record<string, unknown>) {
  if (transport === "serial") {
    const pathValue = typeof config.path === "string" ? config.path : "";
    if (!pathValue) {
      return { available: false, error: "Serial path is required" };
    }

    const ports = await listSerialPorts();
    const exists = ports.some((port) => port.path === pathValue);
    return exists
      ? { available: true }
      : { available: false, error: `Serial port ${pathValue} is not available` };
  }

  const host = typeof config.host === "string" ? config.host : "";
  const port = typeof config.port === "number" ? config.port : Number(config.port);
  if (!host || Number.isNaN(port)) {
    return { available: false, error: `${transport.toUpperCase()} host and port are required` };
  }

  if (port < 1 || port > 65535) {
    return { available: false, error: "TCP port must be between 1 and 65535" };
  }

  return { available: true };
}

ipcMain.handle("session:create", async (_event: unknown, payload: unknown) => {
  const data = SessionCreateSchema.parse(payload);
  if (sessions.has(data.sessionId)) {
    return { success: false, error: "Session already exists" };
  }

  const resourceCheck = await validateResources(data.transport, data.config);
  if (!resourceCheck.available) {
    recordLog("warn", `Resource check failed for session ${data.sessionId}`, resourceCheck.error);
    return { success: false, error: resourceCheck.error ?? "Resource unavailable" };
  }

  // Extract sensitive fields from config and store in Windows Credential Manager
  const { sanitized, stored } = extractSensitiveFields(
    data.config as Record<string, unknown>,
    data.protocolId,
    data.sessionId
  );

  if (stored.length > 0) {
    recordLog("info", `Stored ${stored.length} credential(s) for session ${data.sessionId}`, {
      fields: stored.map((s) => s.field)
    });
  }

  const sessionState: SessionState = {
    ...data,
    config: sanitized,
    status: "disconnected",
    connectionState: "idle",
    tasks: []
  };

  const worker = utilityProcess.fork(path.join(__dirname, "../protocol-worker/index.js"));
  const sessionEntry: WorkerSession = {
    session: sessionState,
    worker,
    pendingRequests: new Map(),
    traffic: []
  };

  sessions.set(data.sessionId, sessionEntry);
  trafficBatchBuffers.set(data.sessionId, []);
  ensureBatchTimer();
  attachWorkerListeners(data.sessionId, worker);

  try {
    // Resolve credential references before sending config to the worker
    const resolvedConfig = resolveCredentialRefs(sanitized);
    await requestWorker(data.sessionId, "init", {
      protocolId: data.protocolId,
      config: resolvedConfig
    });
    recordLog("info", `Session created: ${data.sessionId}`, {
      protocolId: data.protocolId,
      transport: data.transport
    });
    return { success: true, session: sessionState };
  } catch (error) {
    await destroySession(data.sessionId);
    // Clean up stored credentials on failure
    const cleaned = deleteSessionCredentials(data.protocolId, data.sessionId);
    if (cleaned > 0) {
      recordLog("info", `Cleaned up ${cleaned} credential(s) for failed session ${data.sessionId}`);
    }
    recordLog("error", `Failed to initialize session ${data.sessionId}`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to initialize session"
    };
  }
});

ipcMain.handle("session:connect", async (_event: unknown, sessionIdPayload: unknown) => {
  const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
  try {
    publishSessionStatus(sessionId, "connecting");
    await requestWorker(sessionId, "connect");
    publishSessionStatus(sessionId, "connected");
    recordLog("info", `Session connected: ${sessionId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    publishSessionStatus(sessionId, "error", message);
    recordLog("error", `Session connect failed: ${sessionId}`, error);
    return { success: false, error: message };
  }
});

ipcMain.handle("session:disconnect", async (_event: unknown, sessionIdPayload: unknown) => {
  const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
  try {
    await requestWorker(sessionId, "disconnect");
    publishSessionStatus(sessionId, "disconnected");
    recordLog("info", `Session disconnected: ${sessionId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Disconnect failed";
    publishSessionStatus(sessionId, "error", message);
    recordLog("error", `Session disconnect failed: ${sessionId}`, error);
    return { success: false, error: message };
  }
});

ipcMain.handle("session:list", async (_event: unknown) => {
  return Array.from(sessions.values()).map(({ session }) => session);
});

ipcMain.handle("session:status", async (_event: unknown, sessionIdPayload: unknown) => {
  const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
  return sessions.get(sessionId)?.session ?? null;
});

ipcMain.handle("protocol:read", async (_event: unknown, sessionIdPayload: unknown, request: unknown) => {
  const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
  return requestWorker<Uint8Array>(sessionId, "read", { request });
});

ipcMain.handle("protocol:write", async (_event: unknown, sessionIdPayload: unknown, request: unknown) => {
  const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
  return requestWorker<boolean>(sessionId, "write", { request });
});

ipcMain.handle("protocol:invoke", async (_event: unknown, sessionIdPayload: unknown, actionPayload: unknown, payload: unknown) => {
  const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
  const action = z.string().min(1).parse(actionPayload);
  return requestWorker<unknown>(sessionId, "invokeCapability", { action, payload });
});

ipcMain.handle("task:start", async (_event: unknown, sessionIdPayload: unknown, taskPayload: unknown) => {
  const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
  const task = TaskSchema.parse(taskPayload) as PollTask;
  const sessionEntry = getSessionEntry(sessionId);

  await requestWorker(sessionId, "startPolling", { task });
  sessionEntry.session.tasks = sessionEntry.session.tasks
    .filter((currentTask) => currentTask.taskId !== task.taskId)
    .concat(task);
  return { success: true };
});

ipcMain.handle("task:stop", async (_event: unknown, sessionIdPayload: unknown, taskIdPayload: unknown) => {
  const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
  const taskId = z.string().min(1).parse(taskIdPayload);
  const sessionEntry = getSessionEntry(sessionId);

  await requestWorker(sessionId, "stopPolling", { taskId });
  sessionEntry.session.tasks = sessionEntry.session.tasks
    .filter((task) => task.taskId !== taskId);
  return { success: true };
});

ipcMain.handle("task:list", async (_event: unknown, sessionIdPayload: unknown) => {
  const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
  return getSessionEntry(sessionId).session.tasks;
});

ipcMain.handle("traffic:clear", async (_event: unknown, sessionIdPayload: unknown) => {
  const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
  const sessionEntry = getSessionEntry(sessionId);
  sessionEntry.traffic = [];
  trafficBatchBuffers.set(sessionId, []);
  return { success: true };
});

ipcMain.handle("config:get", async (_event: unknown, keyPayload: unknown) => {
  const key = z.string().min(1).parse(keyPayload);
  return loadConfig(key);
});

ipcMain.handle("config:set", async (_event: unknown, keyPayload: unknown, value: unknown) => {
  const key = z.string().min(1).parse(keyPayload);
  await saveConfig(key, value);
  return { success: true };
});

ipcMain.handle("plugin:list", async (_event: unknown) => listProtocolManifests());

ipcMain.handle("resource:serial-ports", async (_event: unknown) => {
  try {
    return await listSerialPorts();
  } catch (error) {
    recordLog("error", "Failed to list serial ports", error);
    return [];
  }
});

ipcMain.handle("plugin:load", async (_event: unknown, pluginIdPayload: unknown) => {
  const pluginId = z.string().min(1).parse(pluginIdPayload);
  loadedPlugins.add(pluginId);
  recordLog("info", `Plugin marked as loaded: ${pluginId}`);
  return { success: true };
});

ipcMain.handle("plugin:unload", async (_event: unknown, pluginIdPayload: unknown) => {
  const pluginId = z.string().min(1).parse(pluginIdPayload);
  loadedPlugins.delete(pluginId);
  recordLog("info", `Plugin marked as unloaded: ${pluginId}`);
  return { success: true };
});

ipcMain.handle("log:query", async (_event: unknown, filterPayload?: unknown) => {
  const filter = z
    .object({
      level: z.enum(["info", "warn", "error"]).optional(),
      limit: z.number().int().positive().max(1000).optional()
    })
    .optional()
    .parse(filterPayload);

  const limit = filter?.limit ?? 100;
  const level = filter?.level;
  const entries = level ? logBuffer.filter((entry) => entry.level === level) : logBuffer;
  return entries.slice(-limit);
});

ipcMain.handle("log:getFilePath", async () => {
  const file = log.transports.file.getFile();
  return file.path;
});

ipcMain.handle("log:getRecent", async (_event: unknown, countPayload?: unknown) => {
  const count = z.number().int().positive().max(10000).optional().parse(countPayload) ?? 100;
  try {
    const file = log.transports.file.getFile();
    const content = await readFile(file.path, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    return lines.slice(-count);
  } catch {
    return [];
  }
});

ipcMain.handle("log:export", async (_event: unknown, filePathPayload?: unknown) => {
  const targetPath = z.string().optional().parse(filePathPayload);
  try {
    const file = log.transports.file.getFile();
    const sourcePath = file.path;

    if (targetPath) {
      await fs.copyFile(sourcePath, targetPath);
      return targetPath;
    }

    const result = await dialog.showSaveDialog(mainWindow!, {
      title: "Export Logs",
      defaultPath: "deep-protocol-analyzer-logs.log",
      filters: [{ name: "Log Files", extensions: ["log", "txt"] }]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    await fs.copyFile(sourcePath, result.filePath);
    return result.filePath;
  } catch (error) {
    log.error("Failed to export logs", error);
    return null;
  }
});

ipcMain.handle("log:openDirectory", async () => {
  const file = log.transports.file.getFile();
  const dirPath = path.dirname(file.path);
  await shell.openPath(dirPath);
});

// ── Template IPC Handlers ────────────────────────────────────────────

const TemplateSaveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  protocol: z.string().min(1),
  config: z.record(z.unknown())
});

ipcMain.handle("template:list", async () => {
  try {
    return await listTemplates();
  } catch (error) {
    recordLog("error", "Failed to list templates", error);
    return [];
  }
});

ipcMain.handle("template:save", async (_event: unknown, templatePayload: unknown) => {
  const template = TemplateSaveSchema.parse(templatePayload);
  try {
    const saved = await saveTemplate(template);
    recordLog("info", `Template saved: ${saved.name}`, { id: saved.id });
    return { success: true, template: saved };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save template";
    recordLog("error", "Failed to save template", error);
    return { success: false, error: message };
  }
});

ipcMain.handle("template:load", async (_event: unknown, templateIdPayload: unknown) => {
  const templateId = z.string().min(1).parse(templateIdPayload);
  try {
    const template = await loadTemplate(templateId);
    if (!template) {
      return { success: false, error: "Template not found" };
    }
    return { success: true, template };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load template";
    recordLog("error", "Failed to load template", error);
    return { success: false, error: message };
  }
});

ipcMain.handle("template:delete", async (_event: unknown, templateIdPayload: unknown) => {
  const templateId = z.string().min(1).parse(templateIdPayload);
  try {
    const deleted = await deleteTemplate(templateId);
    if (!deleted) {
      return { success: false, error: "Template not found" };
    }
    recordLog("info", `Template deleted: ${templateId}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete template";
    recordLog("error", "Failed to delete template", error);
    return { success: false, error: message };
  }
});

ipcMain.handle("template:export", async (_event: unknown, templateIdPayload: unknown, filePathPayload?: unknown) => {
  const templateId = z.string().min(1).parse(templateIdPayload);
  const targetPath = z.string().optional().parse(filePathPayload);
  try {
    if (targetPath) {
      const result = await exportTemplate(templateId, targetPath);
      return result ? { success: true, filePath: result } : { success: false, error: "Template not found" };
    }

    const result = await dialog.showSaveDialog(mainWindow!, {
      title: "Export Template",
      defaultPath: "protocol-template.json",
      filters: [{ name: "JSON Files", extensions: ["json"] }]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, error: "Export cancelled" };
    }

    const exported = await exportTemplate(templateId, result.filePath);
    return exported ? { success: true, filePath: exported } : { success: false, error: "Template not found" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export template";
    recordLog("error", "Failed to export template", error);
    return { success: false, error: message };
  }
});

ipcMain.handle("template:import", async (_event: unknown, filePathPayload?: unknown) => {
  const filePath = z.string().optional().parse(filePathPayload);
  try {
    let targetPath = filePath;

    if (!targetPath) {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: "Import Template",
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        properties: ["openFile"]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: "Import cancelled" };
      }

      targetPath = result.filePaths[0];
    }

    const template = await importTemplateFromFile(targetPath);
    if (!template) {
      return { success: false, error: "Invalid template file" };
    }

    recordLog("info", `Template imported: ${template.name}`, { id: template.id });
    return { success: true, template };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import template";
    recordLog("error", "Failed to import template", error);
    return { success: false, error: message };
  }
});

// ── Credential IPC Handlers ──────────────────────────────────────────

const CredentialStoreSchema = z.object({
  target: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1)
});

const CredentialTargetSchema = z.string().min(1);

const CredentialListSchema = z.object({
  prefix: z.string().min(1)
});

ipcMain.handle("credential:store", async (_event: unknown, payload: unknown) => {
  const { target, username, password } = CredentialStoreSchema.parse(payload);
  try {
    storeCredential(target, username, password);
    recordLog("info", `Credential stored: ${target}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to store credential";
    recordLog("error", `Failed to store credential: ${target}`, error);
    return { success: false, error: message };
  }
});

ipcMain.handle("credential:retrieve", async (_event: unknown, targetPayload: unknown) => {
  const target = CredentialTargetSchema.parse(targetPayload);
  try {
    const entry = retrieveCredential(target);
    if (!entry) {
      return { success: false, error: "Credential not found" };
    }
    return { success: true, credential: entry };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to retrieve credential";
    recordLog("error", `Failed to retrieve credential: ${target}`, error);
    return { success: false, error: message };
  }
});

ipcMain.handle("credential:delete", async (_event: unknown, targetPayload: unknown) => {
  const target = CredentialTargetSchema.parse(targetPayload);
  try {
    const deleted = deleteCredential(target);
    if (deleted) {
      recordLog("info", `Credential deleted: ${target}`);
    }
    return { success: deleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete credential";
    recordLog("error", `Failed to delete credential: ${target}`, error);
    return { success: false, error: message };
  }
});

ipcMain.handle("credential:list", async (_event: unknown, payload: unknown) => {
  const { prefix } = CredentialListSchema.parse(payload);
  try {
    const targets = listCredentials(prefix);
    return { success: true, targets };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list credentials";
    recordLog("error", "Failed to list credentials", error);
    return { success: false, error: message, targets: [] };
  }
});

// ── Benchmark IPC Handlers ──────────────────────────────────────────

const BenchmarkThroughputSchema = z.object({
  durationMs: z.number().int().positive().optional(),
  targetMsgPerSec: z.number().positive().optional(),
  messageSize: z.number().int().positive().optional(),
  concurrent: z.number().int().positive().optional()
}).optional();

const BenchmarkMemorySchema = z.object({
  durationMs: z.number().int().positive().optional(),
  sampleIntervalMs: z.number().int().positive().optional()
}).optional();

const BenchmarkConcurrencySchema = z.object({
  sessionCount: z.number().int().positive().optional(),
  durationMs: z.number().int().positive().optional(),
  targetMsgPerSec: z.number().positive().optional()
}).optional();

ipcMain.handle("benchmark:throughput", async (_event: unknown, optionsPayload?: unknown) => {
  const options = BenchmarkThroughputSchema.parse(optionsPayload) ?? {};
  try {
    const { benchmarkThroughput } = await import("../../packages/benchmark");
    const result = await benchmarkThroughput(
      async (data: Buffer) => {
        // Echo-based send: write data to a buffer
        void data;
      },
      async () => {
        // Echo-based receive: return a synthetic response
        return Buffer.alloc(options.messageSize ?? 100, 0xcd);
      },
      {
        durationMs: options.durationMs ?? 10_000,
        targetMsgPerSec: options.targetMsgPerSec ?? 500,
        messageSize: options.messageSize ?? 100,
        concurrent: options.concurrent ?? 1
      }
    );
    recordLog("info", "Throughput benchmark completed", {
      messagesPerSecond: result.messagesPerSecond,
      totalMessages: result.totalMessages
    });
    return { success: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Throughput benchmark failed";
    recordLog("error", "Throughput benchmark failed", error);
    return { success: false, error: message };
  }
});

ipcMain.handle("benchmark:memory", async (_event: unknown, optionsPayload?: unknown) => {
  const options = BenchmarkMemorySchema.parse(optionsPayload) ?? {};
  try {
    const { benchmarkMemory } = await import("../../packages/benchmark");
    const result = await benchmarkMemory(
      async () => {
        // Simulate a memory-intensive operation
        const buffer = Buffer.alloc(1024);
        buffer.fill(0xab);
        void buffer;
      },
      {
        durationMs: options.durationMs ?? 60_000,
        sampleIntervalMs: options.sampleIntervalMs ?? 1_000
      }
    );
    recordLog("info", "Memory benchmark completed", {
      deltaHeapMB: result.deltaHeapMB,
      peakHeapMB: result.peakHeapMB
    });
    return { success: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Memory benchmark failed";
    recordLog("error", "Memory benchmark failed", error);
    return { success: false, error: message };
  }
});

ipcMain.handle("benchmark:concurrency", async (_event: unknown, optionsPayload?: unknown) => {
  const options = BenchmarkConcurrencySchema.parse(optionsPayload) ?? {};
  try {
    const { benchmarkConcurrency } = await import("../../packages/benchmark");
    const result = await benchmarkConcurrency(
      async () => {
        // Create a synthetic session ID
        return `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      },
      async (_sessionId: string, _data: Buffer) => {
        // Simulate send
      },
      async (_sessionId: string) => {
        // Simulate destroy
      },
      {
        sessionCount: options.sessionCount ?? 20,
        durationMs: options.durationMs ?? 30_000,
        targetMsgPerSec: options.targetMsgPerSec ?? 500
      }
    );
    recordLog("info", "Concurrency benchmark completed", {
      sessionCount: result.sessionCount,
      totalMessages: result.totalMessages,
      errors: result.errors
    });
    return { success: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Concurrency benchmark failed";
    recordLog("error", "Concurrency benchmark failed", error);
    return { success: false, error: message };
  }
});

ipcMain.handle("benchmark:system", async (_event: unknown) => {
  try {
    const { getSystemMetrics, validateAgainstSpec } = await import("../../packages/benchmark");
    const metrics = getSystemMetrics();
    const validation = validateAgainstSpec(undefined, undefined, metrics, undefined);
    return { success: true, metrics, validation };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get system metrics";
    recordLog("error", "System metrics failed", error);
    return { success: false, error: message };
  }
});

app.whenReady().then(() => {
  mainWindow = createWindow();
  recordLog("info", "Application started");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  if (batchTimer) {
    clearInterval(batchTimer);
    batchTimer = null;
  }

  for (const sessionId of Array.from(sessions.keys())) {
    const sessionEntry = sessions.get(sessionId);
    sessionEntry?.worker.kill();
  }

  sessions.clear();
  trafficBatchBuffers.clear();
  recordLog("info", "Application shutting down");
});
