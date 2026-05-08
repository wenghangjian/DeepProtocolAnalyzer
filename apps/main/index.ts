import { app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fsSync from "fs";
import log from "electron-log";
import type { SessionEvent, TrafficEvent } from "../../packages/shared-types";
import { TrafficBatcher } from "./traffic-batcher";
import { WorkerPool } from "./worker-pool";
import { SessionManager } from "./session-manager";
import { registerIpcHandlers, createRecordLog } from "./ipc-handlers";

// ── Path Constants ────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const protocolsDir = path.resolve(__dirname, "../../protocols");
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

// ── Log Configuration ─────────────────────────────────────────────────

log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB rolling files
log.transports.file.format = "{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}";
log.transports.console.format = "{h}:{i}:{s}.{ms} [{level}] {text}";

const MAX_ROTATED_FILES = 7;
log.transports.file.archiveLogFn = (file) => {
  try {
    const logPath = file.path;
    const ext = path.extname(logPath);
    const base = logPath.slice(0, -ext.length);

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

// ── Shared State ──────────────────────────────────────────────────────

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
const getMainWindow = () => mainWindow;

// ── Module Wiring ─────────────────────────────────────────────────────

const recordLog = createRecordLog();

const trafficBatcher = new TrafficBatcher(getMainWindow);

const workerPool = new WorkerPool(
  path.join(__dirname, "../protocol-worker/index.js"),
  {
    onTraffic(sessionId: string, event: TrafficEvent) {
      sessionManager.enqueueTraffic(sessionId, event);
    },
    onStatusChange(sessionId: string, status, lastError?: string) {
      sessionManager.publishStatus(sessionId, status, lastError);
      recordLog("error", `Worker exited for session ${sessionId}`, { status, lastError });
    },
    onSessionEvent(sessionId: string, event: SessionEvent) {
      sessionManager.publishEvent(sessionId, event);
    },
    onWorkerExit(sessionId: string, code: number) {
      recordLog("error", `Worker exited for session ${sessionId}`, { code });
      sessionManager.publishStatus(sessionId, "error", `Worker exited with code ${code}`);
      mainWindow?.webContents.send("session:crashed", { sessionId, code });
    }
  }
);

const sessionManager = new SessionManager(workerPool, trafficBatcher, getMainWindow);

// ── Register IPC Handlers ─────────────────────────────────────────────

registerIpcHandlers({
  sessionManager,
  protocolsDir,
  recordLog,
  getMainWindow
});

// ── Window Creation ───────────────────────────────────────────────────

function getDevServerUrl() {
  return process.env.VITE_DEV_SERVER_URL;
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

  // Only enforce strict CSP in production; dev mode needs relaxed CSP for Vite HMR
  if (!isDevelopment) {
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
  }

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

// ── App Lifecycle ─────────────────────────────────────────────────────

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
  sessionManager.shutdown();
  recordLog("info", "Application shutting down");
});
