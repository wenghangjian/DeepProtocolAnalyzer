import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs/promises";
import { SerialPort } from "serialport";
import { z } from "zod";
import log from "electron-log";
import { readFile } from "fs/promises";
import type {
  PollTask,
  ProtocolManifest,
  SerialPortInfo,
  SessionState
} from "../../packages/shared-types";
import {
  extractSensitiveFields,
  resolveCredentialRefs,
  deleteSessionCredentials
} from "../../packages/credential-store";
import { SessionManager } from "./session-manager";
import {
  getConfig,
  setConfig,
  listAllTemplates,
  saveTemplateEntry,
  loadTemplateEntry,
  deleteTemplateEntry,
  exportTemplateEntry,
  importTemplateEntry,
  storeCredentialEntry,
  retrieveCredentialEntry,
  deleteCredentialEntry,
  listCredentialEntries,
  TemplateSaveSchema,
  CredentialStoreSchema,
  CredentialTargetSchema,
  CredentialListSchema,
  type LogFunction
} from "./config-persistence";

// ── Types ─────────────────────────────────────────────────────────────

interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
  meta?: unknown;
}

// ── Zod Schemas ───────────────────────────────────────────────────────

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

// ── Log Buffer ────────────────────────────────────────────────────────

const logBuffer: LogEntry[] = [];

export function createRecordLog(): LogFunction {
  return function recordLog(level: LogEntry["level"], message: string, meta?: unknown) {
    log[level](message, meta ?? "");
    logBuffer.push({ timestamp: Date.now(), level, message, meta });
    if (logBuffer.length > 1000) {
      logBuffer.shift();
    }
  };
}

// ── Helper Functions ──────────────────────────────────────────────────

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

async function listProtocolManifests(protocolsDir: string): Promise<ProtocolManifest[]> {
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

// ── Register All IPC Handlers ─────────────────────────────────────────

export interface IpcHandlerDependencies {
  sessionManager: SessionManager;
  protocolsDir: string;
  recordLog: LogFunction;
  getMainWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(deps: IpcHandlerDependencies): void {
  const { sessionManager, protocolsDir, recordLog, getMainWindow } = deps;
  const loadedPlugins = new Set<string>();

  // ── Session Handlers ──────────────────────────────────────────────

  ipcMain.handle("session:create", async (_event: unknown, payload: unknown) => {
    const data = SessionCreateSchema.parse(payload);
    if (sessionManager.has(data.sessionId)) {
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

    sessionManager.addSession(data.sessionId, sessionState);

    try {
      // Resolve credential references before sending config to the worker
      const resolvedConfig = resolveCredentialRefs(sanitized);
      await sessionManager.requestWorker(data.sessionId, "init", {
        protocolId: data.protocolId,
        config: resolvedConfig
      });
      recordLog("info", `Session created: ${data.sessionId}`, {
        protocolId: data.protocolId,
        transport: data.transport
      });
      return { success: true, session: sessionState };
    } catch (error) {
      await sessionManager.destroySession(data.sessionId);
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
      sessionManager.publishStatus(sessionId, "connecting");
      await sessionManager.requestWorker(sessionId, "connect");
      sessionManager.publishStatus(sessionId, "connected");
      recordLog("info", `Session connected: ${sessionId}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed";
      sessionManager.publishStatus(sessionId, "error", message);
      recordLog("error", `Session connect failed: ${sessionId}`, error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("session:disconnect", async (_event: unknown, sessionIdPayload: unknown) => {
    const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
    try {
      await sessionManager.requestWorker(sessionId, "disconnect");
      sessionManager.publishStatus(sessionId, "disconnected");
      recordLog("info", `Session disconnected: ${sessionId}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Disconnect failed";
      sessionManager.publishStatus(sessionId, "error", message);
      recordLog("error", `Session disconnect failed: ${sessionId}`, error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("session:list", async (_event: unknown) => {
    return sessionManager.listSessions();
  });

  ipcMain.handle("session:status", async (_event: unknown, sessionIdPayload: unknown) => {
    const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
    return sessionManager.getEntryOrUndefined(sessionId)?.session ?? null;
  });

  // ── Protocol Handlers ─────────────────────────────────────────────

  ipcMain.handle("protocol:read", async (_event: unknown, sessionIdPayload: unknown, request: unknown) => {
    const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
    return sessionManager.requestWorker<Uint8Array>(sessionId, "read", { request });
  });

  ipcMain.handle("protocol:write", async (_event: unknown, sessionIdPayload: unknown, request: unknown) => {
    const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
    return sessionManager.requestWorker<boolean>(sessionId, "write", { request });
  });

  ipcMain.handle("protocol:invoke", async (_event: unknown, sessionIdPayload: unknown, actionPayload: unknown, payload: unknown) => {
    const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
    const action = z.string().min(1).parse(actionPayload);
    return sessionManager.requestWorker<unknown>(sessionId, "invokeCapability", { action, payload });
  });

  // ── Task Handlers ─────────────────────────────────────────────────

  ipcMain.handle("task:start", async (_event: unknown, sessionIdPayload: unknown, taskPayload: unknown) => {
    const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
    const task = TaskSchema.parse(taskPayload) as PollTask;
    const entry = sessionManager.getEntry(sessionId);

    await sessionManager.requestWorker(sessionId, "startPolling", { task });
    entry.session.tasks = entry.session.tasks
      .filter((currentTask) => currentTask.taskId !== task.taskId)
      .concat(task);
    return { success: true };
  });

  ipcMain.handle("task:stop", async (_event: unknown, sessionIdPayload: unknown, taskIdPayload: unknown) => {
    const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
    const taskId = z.string().min(1).parse(taskIdPayload);
    const entry = sessionManager.getEntry(sessionId);

    await sessionManager.requestWorker(sessionId, "stopPolling", { taskId });
    entry.session.tasks = entry.session.tasks
      .filter((task) => task.taskId !== taskId);
    return { success: true };
  });

  ipcMain.handle("task:list", async (_event: unknown, sessionIdPayload: unknown) => {
    const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
    return sessionManager.getEntry(sessionId).session.tasks;
  });

  // ── Traffic Handlers ──────────────────────────────────────────────

  ipcMain.handle("traffic:clear", async (_event: unknown, sessionIdPayload: unknown) => {
    const sessionId = RequestSessionIdSchema.parse(sessionIdPayload);
    sessionManager.clearTraffic(sessionId);
    return { success: true };
  });

  // ── Config Handlers ───────────────────────────────────────────────

  ipcMain.handle("config:get", async (_event: unknown, keyPayload: unknown) => {
    const key = z.string().min(1).parse(keyPayload);
    return getConfig(key);
  });

  ipcMain.handle("config:set", async (_event: unknown, keyPayload: unknown, value: unknown) => {
    const key = z.string().min(1).parse(keyPayload);
    return setConfig(key, value);
  });

  // ── Plugin Handlers ───────────────────────────────────────────────

  ipcMain.handle("plugin:list", async (_event: unknown) => listProtocolManifests(protocolsDir));

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

  // ── Resource Handlers ─────────────────────────────────────────────

  ipcMain.handle("resource:serial-ports", async (_event: unknown) => {
    try {
      return await listSerialPorts();
    } catch (error) {
      recordLog("error", "Failed to list serial ports", error);
      return [];
    }
  });

  // ── Log Handlers ──────────────────────────────────────────────────

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

      const result = await dialog.showSaveDialog(getMainWindow()!, {
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

  // ── Template Handlers ─────────────────────────────────────────────

  ipcMain.handle("template:list", async () => listAllTemplates(recordLog));

  ipcMain.handle("template:save", async (_event: unknown, templatePayload: unknown) => {
    const template = TemplateSaveSchema.parse(templatePayload);
    return saveTemplateEntry(template, recordLog);
  });

  ipcMain.handle("template:load", async (_event: unknown, templateIdPayload: unknown) => {
    const templateId = z.string().min(1).parse(templateIdPayload);
    return loadTemplateEntry(templateId, recordLog);
  });

  ipcMain.handle("template:delete", async (_event: unknown, templateIdPayload: unknown) => {
    const templateId = z.string().min(1).parse(templateIdPayload);
    return deleteTemplateEntry(templateId, recordLog);
  });

  ipcMain.handle("template:export", async (_event: unknown, templateIdPayload: unknown, filePathPayload?: unknown) => {
    const templateId = z.string().min(1).parse(templateIdPayload);
    const targetPath = z.string().optional().parse(filePathPayload);
    return exportTemplateEntry(templateId, targetPath, getMainWindow(), recordLog);
  });

  ipcMain.handle("template:import", async (_event: unknown, filePathPayload?: unknown) => {
    const filePath = z.string().optional().parse(filePathPayload);
    return importTemplateEntry(filePath, getMainWindow(), recordLog);
  });

  // ── Credential Handlers ───────────────────────────────────────────

  ipcMain.handle("credential:store", async (_event: unknown, payload: unknown) => {
    const { target, username, password } = CredentialStoreSchema.parse(payload);
    return storeCredentialEntry(target, username, password, recordLog);
  });

  ipcMain.handle("credential:retrieve", async (_event: unknown, targetPayload: unknown) => {
    const target = CredentialTargetSchema.parse(targetPayload);
    return retrieveCredentialEntry(target, recordLog);
  });

  ipcMain.handle("credential:delete", async (_event: unknown, targetPayload: unknown) => {
    const target = CredentialTargetSchema.parse(targetPayload);
    return deleteCredentialEntry(target, recordLog);
  });

  ipcMain.handle("credential:list", async (_event: unknown, payload: unknown) => {
    const { prefix } = CredentialListSchema.parse(payload);
    return listCredentialEntries(prefix, recordLog);
  });

  // ── Benchmark Handlers ────────────────────────────────────────────

  ipcMain.handle("benchmark:throughput", async (_event: unknown, optionsPayload?: unknown) => {
    const options = BenchmarkThroughputSchema.parse(optionsPayload) ?? {};
    try {
      const { benchmarkThroughput } = await import("../../packages/benchmark");
      const result = await benchmarkThroughput(
        async (data: Buffer) => {
          void data;
        },
        async () => {
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
          return `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        },
        async (_sessionId: string, _data: Buffer) => {
        },
        async (_sessionId: string) => {
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
}
