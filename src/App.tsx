import { useDeferredValue, useEffect, useRef, useState } from "react";
import type {
  ProtocolManifest,
  SerialPortInfo,
  SessionState,
  TrafficEvent
} from "../packages/shared-types";
import ConfigTemplates from "./components/ConfigTemplates";
import PerformanceMonitor from "./components/PerformanceMonitor";
import PollTaskManager from "./components/PollTaskManager";
import ProtocolSessionDiagnostics from "./components/ProtocolSessionDiagnostics";
import TrafficMonitor from "./components/TrafficMonitor";
import { useSessionStore } from "./store/session-store";

const APP_NAME = "Industrial Protocol Studio";
const COMMON_BAUD_RATES = ["1200", "2400", "4800", "9600", "19200", "38400", "57600", "115200"];
const NUMBER_FIELDS = new Set([
  "port",
  "baudRate",
  "unitId",
  "connectTimeoutMs",
  "readTimeoutMs",
  "writeTimeoutMs",
  "timeoutMs",
  "dataBits",
  "stopBits"
]);

interface WorkspaceTemplate {
  id: string;
  name: string;
  protocolId: string;
  transport: "tcp" | "serial" | "udp";
  config: Record<string, string>;
}

interface WorkspaceState {
  sessionDrafts: Array<{
    sessionId: string;
    protocolId: string;
    transport: "tcp" | "serial" | "udp";
    config: Record<string, string | number | boolean>;
  }>;
  templates: WorkspaceTemplate[];
  selectedProtocolId?: string;
}

interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
  meta?: unknown;
}

const shellCss = `
  :root {
    color: #162033;
    background: linear-gradient(180deg, #eef3f9 0%, #e9eef7 100%);
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-width: 1024px; min-height: 768px; }
  button, input, select, textarea { font: inherit; }

  /* Accessibility: focus ring for keyboard navigation */
  :focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
  button:focus-visible, [role="button"]:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
    border-radius: 4px;
  }

  /* Screen-reader only utility */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  .shell {
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr) 320px;
    min-height: 100vh;
    background:
      radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 24%),
      radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 28%),
      linear-gradient(180deg, #eef3f9 0%, #e7edf6 100%);
  }
  .rail, .workspace, .guide { padding: 24px; }
  .rail {
    border-right: 1px solid rgba(147, 163, 184, 0.22);
    background: rgba(255, 255, 255, 0.82);
    backdrop-filter: blur(18px);
    overflow-y: auto;
    max-height: 100vh;
    position: sticky;
    top: 0;
  }
  .workspace {
    display: flex;
    flex-direction: column;
    gap: 18px;
    overflow-y: auto;
    min-height: 0;
  }
  .guide {
    border-left: 1px solid rgba(147, 163, 184, 0.22);
    background: rgba(248, 250, 252, 0.88);
    overflow-y: auto;
    max-height: 100vh;
    position: sticky;
    top: 0;
  }
  .brand {
    margin: 0 0 6px;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.03em;
  }
  .muted {
    color: #60708a;
    margin: 0;
    line-height: 1.5;
  }
  .section {
    margin-top: 18px;
    padding: 18px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.06);
  }
  .section h2, .section h3 {
    margin: 0 0 12px;
    font-size: 15px;
  }
  .protocol-grid {
    display: grid;
    gap: 10px;
  }
  .protocol-card, .session-card {
    width: 100%;
    padding: 14px;
    border-radius: 16px;
    border: 1px solid rgba(191, 219, 254, 0.8);
    background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    text-align: left;
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
  }
  .protocol-card:hover, .session-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 24px rgba(37, 99, 235, 0.12);
  }
  .active {
    border-color: #2563eb;
    box-shadow: 0 14px 32px rgba(37, 99, 235, 0.14);
  }
  .card-head, .session-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
  }
  .card-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }
  .card-copy {
    margin: 8px 0 0;
    font-size: 12px;
    color: #60708a;
    line-height: 1.5;
  }
  .pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .pill, .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    background: #eff6ff;
    color: #1d4ed8;
  }
  .status-connected { background: #ecfdf3; color: #15803d; }
  .status-connecting { background: #eff6ff; color: #1d4ed8; }
  .status-disconnected { background: #f8fafc; color: #475569; }
  .status-error { background: #fef2f2; color: #b91c1c; }
  .hero {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    padding: 22px 24px;
    border-radius: 22px;
    background: linear-gradient(135deg, #ffffff 0%, #edf5ff 100%);
    border: 1px solid rgba(148, 163, 184, 0.18);
    box-shadow: 0 18px 36px rgba(15, 23, 42, 0.08);
  }
  .hero h2 {
    margin: 0 0 6px;
    font-size: 24px;
    letter-spacing: -0.03em;
  }
  .hero p {
    margin: 0;
    max-width: 760px;
    color: #5b6b83;
    line-height: 1.65;
  }
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field span {
    font-size: 12px;
    font-weight: 600;
    color: #475569;
  }
  .input, .textarea {
    width: 100%;
    padding: 12px 13px;
    border-radius: 12px;
    border: 1px solid #d7e3f4;
    background: #fff;
    color: #162033;
    outline: none;
  }
  .textarea {
    min-height: 88px;
    resize: vertical;
  }
  .input:focus, .textarea:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
  }
  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 14px;
  }
  .button {
    height: 42px;
    padding: 0 16px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, #2563eb 0%, #0f766e 100%);
    color: #fff;
    font-weight: 700;
    cursor: pointer;
  }
  .button.secondary {
    background: #e8f0ff;
    color: #1d4ed8;
  }
  .button.ghost {
    background: #ffffff;
    color: #334155;
    border: 1px solid #d7e3f4;
  }
  .button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .banner {
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(251, 191, 36, 0.28);
    background: #fff8e6;
    color: #8a5a00;
  }
  .result {
    padding: 14px;
    border-radius: 16px;
    background: #0f172a;
    color: #dbeafe;
    font-size: 12px;
    line-height: 1.6;
    overflow: auto;
    max-height: 300px;
  }
  .guide-list {
    margin: 12px 0 0;
    padding-left: 18px;
    color: #475569;
    line-height: 1.7;
  }
  .guide-list li + li {
    margin-top: 8px;
  }
  .empty {
    padding: 28px 18px;
    border: 1px dashed #cbd5e1;
    border-radius: 16px;
    color: #64748b;
    text-align: center;
  }
  @media (max-width: 1260px) {
    .shell { grid-template-columns: 320px minmax(0, 1fr); }
    .guide { grid-column: 1 / -1; border-left: none; border-top: 1px solid rgba(147, 163, 184, 0.22); position: static; max-height: none; }
  }
  @media (max-width: 920px) {
    .shell { grid-template-columns: 1fr; }
    .rail { border-right: none; border-bottom: 1px solid rgba(147, 163, 184, 0.22); position: static; max-height: none; }
    .form-grid { grid-template-columns: 1fr; }
  }
`;

function toHex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function parseHex(value: string) {
  const normalized = value.replace(/0x/gi, "").replace(/[^a-fA-F0-9]/g, "");
  if (!normalized) {
    return new Uint8Array();
  }
  if (normalized.length % 2 !== 0) {
    throw new Error("HEX payload must contain an even number of characters.");
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function stringifyDefaultConfig(manifest?: ProtocolManifest) {
  return Object.fromEntries(
    Object.entries(manifest?.defaultConfig ?? {}).map(([key, value]) => [key, String(value)])
  );
}

function coerceConfig(
  manifest: ProtocolManifest,
  transport: "tcp" | "serial" | "udp",
  draftConfig: Record<string, string>,
  serialPorts: SerialPortInfo[]
) {
  const config: Record<string, string | number | boolean> = {};
  const defaultConfig = manifest.defaultConfig ?? {};
  const keys = new Set<string>(Object.keys(defaultConfig));

  if (transport === "tcp" || transport === "udp") {
    keys.add("host");
    keys.add("port");
  } else {
    keys.add("path");
    keys.add("baudRate");
  }

  for (const key of keys) {
    const fallback = defaultConfig[key];
    const raw = draftConfig[key]
      ?? (key === "path" && serialPorts[0] ? serialPorts[0].path : undefined)
      ?? (fallback === undefined ? "" : String(fallback));
    if (!raw) {
      continue;
    }

    if (typeof fallback === "boolean") {
      config[key] = raw === "true";
      continue;
    }
    if (typeof fallback === "number" || NUMBER_FIELDS.has(key)) {
      config[key] = Number(raw);
      continue;
    }
    config[key] = raw;
  }

  return config;
}

function sortManifests(left: ProtocolManifest, right: ProtocolManifest) {
  const order = { modbus: 0, scada: 1, automation: 2, substation: 3, building: 4, custom: 5 };
  const leftOrder = order[left.category ?? "custom"];
  const rightOrder = order[right.category ?? "custom"];
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.protocolName.localeCompare(right.protocolName);
}

function getSessionSummary(session: SessionState) {
  const config = session.config as Record<string, unknown>;
  if (session.transport === "tcp" || session.transport === "udp") {
    return `${String(config.host ?? "127.0.0.1")}:${String(config.port ?? "")}`;
  }
  return `${String(config.path ?? "")} @ ${String(config.baudRate ?? "")}`;
}

function getDraftFieldLabel(key: string) {
  const labels: Record<string, string> = {
    host: "Host",
    port: "Port",
    localPort: "Local Port",
    path: "Serial Port",
    baudRate: "Baud Rate",
    unitId: "Unit ID",
    connectTimeoutMs: "Connect Timeout",
    readTimeoutMs: "Read Timeout",
    writeTimeoutMs: "Write Timeout"
  };
  return labels[key] ?? key;
}

function isModbusProtocol(protocolId?: string) {
  return protocolId === "modbus-tcp" || protocolId === "modbus-rtu";
}

function getCapabilityActions(protocolId?: string) {
  switch (protocolId) {
    case "iec104":
      return [
        { action: "iec104:startdt-act", label: "StartDT act" },
        { action: "iec104:testfr-act", label: "TestFR act" },
        { action: "iec104:stopdt-act", label: "StopDT act" }
      ];
    case "opcua":
      return [
        { action: "opcua:hello-probe", label: "HEL probe" },
        { action: "opcua:open-secure-channel-probe", label: "OPN probe" }
      ];
    default:
      return [];
  }
}

function formatCapabilityResult(action: string, result: unknown) {
  if (result instanceof Uint8Array) {
    return `${action}\nRX ${result.length}B\n${toHex(result)}`;
  }
  return `${action}\n${JSON.stringify(result, null, 2)}`;
}

function stringifySessionConfig(session: SessionState) {
  return Object.fromEntries(
    Object.entries(session.config as Record<string, unknown>).map(([key, value]) => [key, String(value)])
  );
}

function matchesTrafficQuery(event: TrafficEvent, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  const haystack = [
    event.direction,
    event.protocolId,
    String(event.length),
    toHex(event.rawBytes).toLowerCase(),
    JSON.stringify(event.parsedFields ?? {}).toLowerCase()
  ].join(" ");
  return haystack.includes(normalized);
}

export default function App() {
  const {
    sessions,
    traffic,
    sessionEvents,
    selectedSessionId,
    addSession,
    upsertSession,
    selectSession,
    updateStatus,
    addTrafficBatch,
    addSessionEvent,
    clearTraffic,
    saveSession,
    loadPersistedSessions
  } = useSessionStore();

  const [manifests, setManifests] = useState<ProtocolManifest[]>([]);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [selectedProtocolId, setSelectedProtocolId] = useState("");
  const [transport, setTransport] = useState<"tcp" | "serial" | "udp">("tcp");
  const [draftConfig, setDraftConfig] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("System serial resources and protocol manifests are loaded from the host.");
  const [busy, setBusy] = useState(false);
  const [refreshingPorts, setRefreshingPorts] = useState(false);
  const [lastResult, setLastResult] = useState("No operation has been executed yet.");
  const [modbusForm, setModbusForm] = useState({
    address: "0",
    length: "2",
    functionCode: "3",
    unitId: "1",
    timeoutMs: "3000",
    writeHex: "00 01"
  });
  const [rawForm, setRawForm] = useState({
    payload: "",
    timeoutMs: "5000"
  });
  const [pollForm, setPollForm] = useState({
    intervalMs: "1000"
  });
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logLevel, setLogLevel] = useState<"" | "info" | "warn" | "error">("");
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [trafficQuery, setTrafficQuery] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [pollManagerOpen, setPollManagerOpen] = useState(false);
  const [performancePanelOpen, setPerformancePanelOpen] = useState(false);
  const skipDraftPresetResetRef = useRef(false);

  const selectedManifest = manifests.find((manifest) => manifest.protocolId === selectedProtocolId);
  const selectedSession = sessions.find((session) => session.sessionId === selectedSessionId) ?? null;
  const activeManifest = manifests.find((manifest) => manifest.protocolId === selectedSession?.protocolId) ?? selectedManifest;
  const selectedTraffic = useDeferredValue(
    traffic.filter((event) => event.sessionId === selectedSessionId)
  );
  const filteredTraffic = useDeferredValue(
    selectedTraffic.filter((event) => matchesTrafficQuery(event, trafficQuery))
  );
  const selectedSessionEvents = selectedSessionId ? (sessionEvents[selectedSessionId] ?? []) : [];

  async function refreshSerialPorts() {
    setRefreshingPorts(true);
    try {
      const ports = await window.resourceApi.listSerialPorts();
      setSerialPorts(ports);
      if (ports.length === 0) {
        setBanner("No serial ports were detected on this host.");
      }
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Failed to enumerate serial ports.");
    } finally {
      setRefreshingPorts(false);
    }
  }

  async function refreshLogs(nextLevel = logLevel) {
    setLoadingLogs(true);
    try {
      const nextLogs = await window.logApi.query({
        level: nextLevel || undefined,
        limit: 20
      });
      setLogs(nextLogs);
    } finally {
      setLoadingLogs(false);
    }
  }

  async function syncSession(sessionId: string) {
    const session = await window.sessionApi.status(sessionId);
    if (session) {
      upsertSession(session);
    }
  }

  useEffect(() => {
    let alive = true;

    async function bootstrap() {
      try {
        const [protocols, sessionList, ports, workspaceValue, persistedSessions] = await Promise.all([
          window.pluginApi.list(),
          window.sessionApi.list(),
          window.resourceApi.listSerialPorts(),
          window.configApi.get("workspace-v1"),
          loadPersistedSessions()
        ]);
        if (!alive) {
          return;
        }

        const nextManifests = protocols.slice().sort(sortManifests);
        const workspace = (workspaceValue ?? null) as WorkspaceState | null;
        setManifests(nextManifests);
        setSerialPorts(ports);
        setTemplates(workspace?.templates ?? []);

        const effectiveSessions = [...sessionList];
        if (effectiveSessions.length === 0 && workspace?.sessionDrafts?.length) {
          for (const draft of workspace.sessionDrafts) {
            const restored = await window.sessionApi.create(draft);
            if (restored.success && restored.session) {
              effectiveSessions.push(restored.session);
            }
          }
          if (effectiveSessions.length > 0) {
            setBanner(`Restored ${effectiveSessions.length} saved session(s) into the workspace.`);
          }
        }

        // Fallback: restore from individually persisted session configs if workspace drafts were empty
        if (effectiveSessions.length === 0 && persistedSessions.length > 0) {
          for (const persisted of persistedSessions) {
            const restored = await window.sessionApi.create(persisted);
            if (restored.success && restored.session) {
              effectiveSessions.push(restored.session);
            }
          }
          if (effectiveSessions.length > 0) {
            setBanner(`Restored ${effectiveSessions.length} persisted session(s).`);
          }
        }

        effectiveSessions.forEach((session) => upsertSession(session));
        const preferredProtocolId = workspace?.selectedProtocolId && nextManifests.some((manifest) => manifest.protocolId === workspace.selectedProtocolId)
          ? workspace.selectedProtocolId
          : nextManifests[0]?.protocolId;
        if (preferredProtocolId) {
          setSelectedProtocolId((current) => current || preferredProtocolId);
        }
        if (!selectedSessionId && effectiveSessions[0]) {
          selectSession(effectiveSessions[0].sessionId);
        }
        void refreshLogs();
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Failed to load application state.");
      } finally {
        if (alive) {
          setHydrated(true);
        }
      }
    }

    void bootstrap();

    const unsubscribeStatus = window.sessionApi.onStatusChange(({ sessionId, status, lastError }) => {
      updateStatus(sessionId, status, lastError);
      if (status === "error" && lastError) {
        setBanner(lastError);
      }
    });
    const unsubscribeCrash = window.sessionApi.onCrash(({ sessionId, code }) => {
      updateStatus(sessionId, "error", `Worker exited with code ${String(code ?? "unknown")}`);
      setBanner(`Protocol worker crashed for ${sessionId}.`);
    });
    const unsubscribeSessionEvent = window.sessionApi.onEvent((event) => {
      addSessionEvent(event);
      if (event.type === "connection-state" && event.reason && event.state === "error") {
        setBanner(event.reason);
      }
      if (event.type === "transaction" && event.error) {
        setBanner(event.error);
      }
    });
    const unsubscribeTraffic = window.trafficApi.subscribe(({ events }) => addTrafficBatch(events));
    const unsubscribeTrafficWarning = window.trafficApi.subscribeWarning(({ message }) => setBanner(message));

    return () => {
      alive = false;
      unsubscribeStatus();
      unsubscribeCrash();
      unsubscribeSessionEvent();
      unsubscribeTraffic();
      unsubscribeTrafficWarning();
    };
  }, [addSessionEvent, addTrafficBatch, loadPersistedSessions, selectSession, selectedSessionId, updateStatus, upsertSession]);

  useEffect(() => {
    if (!selectedManifest) {
      return;
    }

    if (skipDraftPresetResetRef.current) {
      skipDraftPresetResetRef.current = false;
      return;
    }

    const nextTransport = selectedManifest.defaultTransport ?? selectedManifest.supportedTransports[0] ?? "tcp";
    const nextConfig = stringifyDefaultConfig(selectedManifest);
    if (nextTransport === "serial" && !nextConfig.path && serialPorts[0]) {
      nextConfig.path = serialPorts[0].path;
    }
    setTransport(nextTransport);
    setDraftConfig(nextConfig);
  }, [selectedManifest]);

  useEffect(() => {
    if (transport === "serial" && !draftConfig.path && serialPorts[0]) {
      setDraftConfig((current) => ({ ...current, path: serialPorts[0].path }));
    }
  }, [draftConfig.path, serialPorts, transport]);

  useEffect(() => {
    if (!selectedSessionId && sessions[0]) {
      selectSession(sessions[0].sessionId);
    }
  }, [selectSession, selectedSessionId, sessions]);

  useEffect(() => {
    if (!selectedSession) {
      return;
    }
    const config = selectedSession.config as Record<string, unknown>;
    if (typeof config.unitId === "number") {
      setModbusForm((current) => ({ ...current, unitId: String(config.unitId) }));
    }
  }, [selectedSession]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    const workspace: WorkspaceState = {
      sessionDrafts: sessions.map((session) => ({
        sessionId: session.sessionId,
        protocolId: session.protocolId,
        transport: session.transport,
        config: session.config as Record<string, string | number | boolean>
      })),
      templates,
      selectedProtocolId
    };

    void window.configApi.set("workspace-v1", workspace);
  }, [hydrated, selectedProtocolId, sessions, templates]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    void refreshLogs();
  }, [hydrated, logLevel]);

  const canOperate = selectedSession?.status === "connected";
  const serialBaudValue = draftConfig.baudRate && COMMON_BAUD_RATES.includes(draftConfig.baudRate)
    ? draftConfig.baudRate
    : draftConfig.baudRate ?? "";

  async function createSession() {
    if (!selectedManifest) {
      return;
    }

    setBusy(true);
    try {
      const sessionId = `${selectedManifest.protocolId}-${Date.now()}`;
      const config = coerceConfig(selectedManifest, transport, draftConfig, serialPorts);
      const response = await window.sessionApi.create({
        sessionId,
        protocolId: selectedManifest.protocolId,
        transport,
        config
      });

      if (!response.success || !response.session) {
        throw new Error(response.error ?? "Failed to create session.");
      }

      addSession(response.session);
      selectSession(response.session.sessionId);
      void saveSession(response.session);
      setBanner(`${selectedManifest.protocolName} session created.`);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Failed to create session.");
    } finally {
      setBusy(false);
    }
  }

  async function connectSelectedSession(sessionId: string) {
    const response = await window.sessionApi.connect(sessionId);
    if (!response.success) {
      setBanner(response.error ?? "Connection failed.");
      return;
    }
    setBanner(`Connected ${sessionId}.`);
  }

  async function disconnectSelectedSession(sessionId: string) {
    const response = await window.sessionApi.disconnect(sessionId);
    if (!response.success) {
      setBanner(response.error ?? "Disconnect failed.");
      return;
    }
    setBanner(`Disconnected ${sessionId}.`);
  }

  async function invokeCapabilityAction(action: string) {
    if (!selectedSession) {
      return;
    }

    try {
      const result = await window.protocolApi.invoke(selectedSession.sessionId, action, {});
      setLastResult(formatCapabilityResult(action, result));
      setBanner(`Capability ${action} executed.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Capability ${action} failed.`;
      setLastResult(message);
      setBanner(message);
    }
  }

  async function runModbusRead() {
    if (!selectedSession) {
      return;
    }

    try {
      const result = await window.protocolApi.read(selectedSession.sessionId, {
        address: modbusForm.address,
        length: Number(modbusForm.length) || 1,
        functionCode: modbusForm.functionCode ? Number(modbusForm.functionCode) : undefined,
        unitId: modbusForm.unitId ? Number(modbusForm.unitId) : undefined,
        timeoutMs: Number(modbusForm.timeoutMs) || 3000
      });
      setLastResult(`RX ${result.length}B\n${toHex(result)}`);
    } catch (error) {
      setLastResult(error instanceof Error ? error.message : "Read failed.");
    }
  }

  async function runModbusWrite() {
    if (!selectedSession) {
      return;
    }

    try {
      const payload = parseHex(modbusForm.writeHex);
      if (payload.length === 0) {
        throw new Error("Write payload is empty.");
      }

      await window.protocolApi.write(selectedSession.sessionId, {
        address: modbusForm.address,
        data: payload,
        functionCode: modbusForm.functionCode ? Number(modbusForm.functionCode) : undefined,
        unitId: modbusForm.unitId ? Number(modbusForm.unitId) : undefined,
        timeoutMs: Number(modbusForm.timeoutMs) || 3000
      });
      setLastResult(`TX ${payload.length}B\n${toHex(payload)}`);
    } catch (error) {
      setLastResult(error instanceof Error ? error.message : "Write failed.");
    }
  }

  async function sendRawFrame() {
    if (!selectedSession) {
      return;
    }

    try {
      const payload = parseHex(rawForm.payload);
      if (payload.length === 0) {
        throw new Error("HEX payload is empty.");
      }

      await window.protocolApi.write(selectedSession.sessionId, {
        address: "raw",
        data: payload,
        timeoutMs: Number(rawForm.timeoutMs) || 5000
      });
      setLastResult(`TX ${payload.length}B\n${toHex(payload)}`);
    } catch (error) {
      setLastResult(error instanceof Error ? error.message : "Write failed.");
    }
  }

  async function waitForFrame() {
    if (!selectedSession) {
      return;
    }

    try {
      const result = await window.protocolApi.read(selectedSession.sessionId, {
        address: "next-frame",
        length: 1,
        timeoutMs: Number(rawForm.timeoutMs) || 5000
      });
      setLastResult(`RX ${result.length}B\n${toHex(result)}`);
    } catch (error) {
      setLastResult(error instanceof Error ? error.message : "Read failed.");
    }
  }

  async function clearSelectedTraffic() {
    if (!selectedSession) {
      return;
    }

    await window.trafficApi.clear(selectedSession.sessionId);
    clearTraffic(selectedSession.sessionId);
    setLastResult("Traffic buffer cleared for the selected session.");
  }

  function saveCurrentTemplate() {
    if (!selectedManifest) {
      return;
    }

    const name = templateName.trim();
    if (!name) {
      setBanner("Enter a template name before saving.");
      return;
    }

    const nextTemplate: WorkspaceTemplate = {
      id: `${selectedManifest.protocolId}-${Date.now()}`,
      name,
      protocolId: selectedManifest.protocolId,
      transport,
      config: { ...draftConfig }
    };
    setTemplates((current) => current.concat(nextTemplate));
    setTemplateName("");
    setBanner(`Saved template ${name}.`);
  }

  function applyTemplate(template: WorkspaceTemplate) {
    skipDraftPresetResetRef.current = true;
    setSelectedProtocolId(template.protocolId);
    setTransport(template.transport);
    setDraftConfig(template.config);
    setBanner(`Loaded template ${template.name}.`);
  }

  function deleteTemplate(templateId: string) {
    setTemplates((current) => current.filter((template) => template.id !== templateId));
  }

  function handleLoadTemplateFromPanel(template: { id: string; name: string; protocol: string; config: Record<string, unknown> }) {
    skipDraftPresetResetRef.current = true;
    setSelectedProtocolId(template.protocol);
    setTransport("tcp");
    setDraftConfig(
      Object.fromEntries(
        Object.entries(template.config).map(([key, value]) => [key, String(value)])
      )
    );
    setBanner(`Loaded template "${template.name}".`);
  }

  async function startPollingTask() {
    if (!selectedSession || !isModbusProtocol(selectedSession.protocolId)) {
      return;
    }

    const taskId = `poll-${Date.now()}`;
    const response = await window.taskApi.start(selectedSession.sessionId, {
      taskId,
      address: modbusForm.address,
      length: Number(modbusForm.length) || 1,
      intervalMs: Number(pollForm.intervalMs) || 1000,
      functionCode: modbusForm.functionCode ? Number(modbusForm.functionCode) : undefined,
      unitId: modbusForm.unitId ? Number(modbusForm.unitId) : undefined
    });

    if (!response.success) {
      setBanner("Failed to start polling task.");
      return;
    }

    await syncSession(selectedSession.sessionId);
    setBanner(`Started polling task ${taskId}.`);
  }

  async function stopPollingTask(taskId: string) {
    if (!selectedSession) {
      return;
    }

    const response = await window.taskApi.stop(selectedSession.sessionId, taskId);
    if (!response.success) {
      setBanner(`Failed to stop polling task ${taskId}.`);
      return;
    }

    await syncSession(selectedSession.sessionId);
  }

  return (
    <>
      <style>{shellCss}</style>
      {/* Skip-to-content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:outline-none"
      >
        Skip to main content
      </a>
      <div className="shell">
        <aside className="rail" aria-label="Session configuration sidebar">
          <h1 className="brand">{APP_NAME}</h1>
          <p className="muted">
            A desktop workbench for Modbus, DNP3, IEC 61850 and custom protocol sessions.
          </p>

          <section className="section">
            <h2>New Session</h2>
            <div className="protocol-grid">
              {manifests.map((manifest) => (
                <button
                  key={manifest.protocolId}
                  type="button"
                  className={`protocol-card ${manifest.protocolId === selectedProtocolId ? "active" : ""}`}
                  data-testid={`protocol-card-${manifest.protocolId}`}
                  aria-label={`Select ${manifest.protocolName} protocol`}
                  aria-pressed={manifest.protocolId === selectedProtocolId}
                  onClick={() => setSelectedProtocolId(manifest.protocolId)}
                >
                  <div className="card-head">
                    <p className="card-title">{manifest.protocolName}</p>
                    <span className="pill">{manifest.defaultTransport ?? manifest.supportedTransports[0]}</span>
                  </div>
                  <p className="card-copy">{manifest.connectionSummary ?? "Protocol plugin"}</p>
                  <div className="pill-row">
                    <span className="pill">{manifest.category ?? "custom"}</span>
                    <span className="pill">v{manifest.version}</span>
                  </div>
                </button>
              ))}
            </div>

            {selectedManifest ? (
              <>
                <div className="form-grid" style={{ marginTop: 14 }}>
                  <label className="field">
                    <span>Transport</span>
                    <select
                      className="input"
                      value={transport}
                      onChange={(event) => setTransport(event.target.value as "tcp" | "serial" | "udp")}
                    >
                      {selectedManifest.supportedTransports.map((item) => (
                        <option key={item} value={item}>{item.toUpperCase()}</option>
                      ))}
                    </select>
                  </label>

                  {transport === "tcp" || transport === "udp" ? (
                    <>
                      <label className="field">
                        <span>Host</span>
                        <input
                          className="input"
                          value={draftConfig.host ?? ""}
                          onChange={(event) => setDraftConfig((current) => ({ ...current, host: event.target.value }))}
                          placeholder="127.0.0.1"
                        />
                      </label>
                      <label className="field">
                        <span>Port</span>
                        <input
                          className="input"
                          value={draftConfig.port ?? ""}
                          onChange={(event) => setDraftConfig((current) => ({ ...current, port: event.target.value }))}
                          placeholder="502"
                        />
                      </label>
                      {"localPort" in (selectedManifest.defaultConfig ?? {}) ? (
                        <label className="field">
                          <span>Local Port</span>
                          <input
                            className="input"
                            value={draftConfig.localPort ?? ""}
                            onChange={(event) => setDraftConfig((current) => ({ ...current, localPort: event.target.value }))}
                            placeholder="47808"
                          />
                        </label>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <label className="field">
                        <span>Serial Port</span>
                        <select
                          className="input"
                          value={draftConfig.path ?? ""}
                          onChange={(event) => setDraftConfig((current) => ({ ...current, path: event.target.value }))}
                        >
                          {serialPorts.length === 0 ? (
                            <option value="">No ports detected</option>
                          ) : (
                            serialPorts.map((port) => (
                              <option key={port.path} value={port.path}>
                                {port.path} · {port.friendlyName} {port.isMappedPhysical ? "(physical)" : "(virtual)"}
                              </option>
                            ))
                          )}
                        </select>
                      </label>
                      <label className="field">
                        <span>Baud Rate</span>
                        <select
                          className="input"
                          value={serialBaudValue}
                          onChange={(event) => setDraftConfig((current) => ({ ...current, baudRate: event.target.value }))}
                        >
                          {COMMON_BAUD_RATES.map((rate) => (
                            <option key={rate} value={rate}>{rate}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}

                  {"unitId" in (selectedManifest.defaultConfig ?? {}) ? (
                    <label className="field">
                      <span>Unit ID</span>
                      <input
                        className="input"
                        value={draftConfig.unitId ?? ""}
                        onChange={(event) => setDraftConfig((current) => ({ ...current, unitId: event.target.value }))}
                        placeholder="1"
                      />
                    </label>
                  ) : null}

                  {Object.entries(selectedManifest.defaultConfig ?? {})
                    .filter(([key]) => !["host", "port", "localPort", "path", "baudRate", "unitId"].includes(key))
                    .map(([key]) => (
                      <label key={key} className="field">
                        <span>{getDraftFieldLabel(key)}</span>
                        <input
                          className="input"
                          value={draftConfig[key] ?? ""}
                          onChange={(event) => setDraftConfig((current) => ({ ...current, [key]: event.target.value }))}
                        />
                      </label>
                    ))}
                </div>

                <div className="action-row">
                  <button
                    type="button"
                    className="button"
                    data-testid="create-session"
                    aria-label={busy ? "Creating session..." : "Create new session"}
                    onClick={() => void createSession()}
                    disabled={busy}
                  >
                    {busy ? "Creating..." : "Create Session"}
                  </button>
                  {transport === "serial" ? (
                    <button
                      type="button"
                      className="button ghost"
                      aria-label={refreshingPorts ? "Refreshing serial ports..." : "Refresh serial ports"}
                      onClick={() => void refreshSerialPorts()}
                      disabled={refreshingPorts}
                    >
                      {refreshingPorts ? "Refreshing..." : "Refresh Ports"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button ghost"
                    aria-label="Open config templates panel"
                    onClick={() => setTemplatePanelOpen(true)}
                    data-testid="open-templates-btn"
                  >
                    Templates
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    aria-label="Open performance benchmark panel"
                    onClick={() => setPerformancePanelOpen(true)}
                    data-testid="open-performance-btn"
                  >
                    Performance
                  </button>
                </div>
              </>
            ) : null}
          </section>

          <section className="section">
            <h3>Sessions</h3>
            {sessions.length === 0 ? (
              <div className="empty">No session has been created yet.</div>
            ) : (
              <div className="protocol-grid" data-testid="session-list">
                {sessions.map((session) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    data-testid={`session-card-${session.sessionId}`}
                    className={`session-card ${session.sessionId === selectedSessionId ? "active" : ""}`}
                    aria-label={`Select session ${session.sessionId} (${session.status})`}
                    aria-current={session.sessionId === selectedSessionId ? "true" : undefined}
                    onClick={() => selectSession(session.sessionId)}
                  >
                    <div className="session-head">
                      <p className="card-title">
                        {manifests.find((manifest) => manifest.protocolId === session.protocolId)?.protocolName ?? session.protocolId}
                      </p>
                      <span className={`status-pill status-${session.status}`}>{session.status}</span>
                    </div>
                    <p className="card-copy">{getSessionSummary(session)}</p>
                    {session.lastError ? <p className="card-copy" style={{ color: "#b91c1c" }}>{session.lastError}</p> : null}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <h3>Templates</h3>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Template Name</span>
                <input
                  className="input"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="Modbus lab bench"
                />
              </label>
            </div>
            <div className="action-row">
              <button type="button" className="button ghost" onClick={saveCurrentTemplate} disabled={!selectedManifest}>
                Save Template
              </button>
            </div>
            {templates.length === 0 ? (
              <div className="empty" style={{ marginTop: 12 }}>No saved templates.</div>
            ) : (
              <div className="protocol-grid" style={{ marginTop: 12 }}>
                {templates.map((template) => (
                  <div key={template.id} className="protocol-card" style={{ cursor: "default" }}>
                    <div className="card-head">
                      <p className="card-title">{template.name}</p>
                      <span className="pill">{template.transport.toUpperCase()}</span>
                    </div>
                    <p className="card-copy">{template.protocolId}</p>
                    <div className="action-row" style={{ marginTop: 10 }}>
                      <button type="button" className="button ghost" onClick={() => applyTemplate(template)}>
                        Load
                      </button>
                      <button type="button" className="button ghost" onClick={() => deleteTemplate(template.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        <main className="workspace" id="main-content" role="main">
          <header className="hero">
            <div>
              <h2>{activeManifest?.protocolName ?? "Select a protocol"}</h2>
              <p>
                {selectedSession
                  ? `${selectedSession.sessionId} is ready for connection management, request execution and live traffic inspection.`
                  : activeManifest?.connectionSummary ?? "Choose a protocol profile and create a session from the left panel."}
              </p>
            </div>
            {selectedSession ? (
              <div className="pill-row">
                <span className={`status-pill status-${selectedSession.status}`}>{selectedSession.status}</span>
                <span className="pill">{selectedSession.transport.toUpperCase()}</span>
                <span className="pill">{selectedSession.protocolId}</span>
              </div>
            ) : null}
          </header>

          <div className="banner" data-testid="banner" role="status" aria-live="polite">{banner}</div>

          <section className="section">
            <h3>Connection Control</h3>
            {selectedSession ? (
              <>
                <p className="muted">{getSessionSummary(selectedSession)}</p>
                <div className="action-row">
                  <button
                    type="button"
                    className="button"
                    data-testid="connect-session"
                    aria-label={`Connect to session ${selectedSession.sessionId}`}
                    onClick={() => void connectSelectedSession(selectedSession.sessionId)}
                    disabled={selectedSession.status === "connected"}
                  >
                    Connect
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    data-testid="disconnect-session"
                    aria-label={`Disconnect session ${selectedSession.sessionId}`}
                    onClick={() => void disconnectSelectedSession(selectedSession.sessionId)}
                    disabled={selectedSession.status !== "connected"}
                  >
                    Disconnect
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    data-testid="clear-traffic"
                    aria-label="Clear traffic buffer for selected session"
                    onClick={() => void clearSelectedTraffic()}
                    disabled={!selectedSessionId}
                  >
                    Clear Traffic
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    data-testid="toggle-poll-manager"
                    aria-label={pollManagerOpen ? "Hide poll task manager" : "Show poll task manager"}
                    aria-expanded={pollManagerOpen}
                    onClick={() => setPollManagerOpen((v) => !v)}
                  >
                    {pollManagerOpen ? "Hide Poll Tasks" : "Poll Tasks"}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty">Select a session to connect, disconnect and inspect traffic.</div>
            )}
          </section>

          {pollManagerOpen ? (
            <PollTaskManager
              sessions={sessions}
              onBanner={setBanner}
            />
          ) : null}

          <section className="section">
            <h3>{isModbusProtocol(selectedSession?.protocolId) ? "Modbus Register Operations" : "Raw Frame Operations"}</h3>
            {selectedSession ? (
              isModbusProtocol(selectedSession.protocolId) ? (
                <>
                  <div className="form-grid">
                    <label className="field">
                      <span>Address</span>
                      <input
                        className="input"
                        value={modbusForm.address}
                        onChange={(event) => setModbusForm((current) => ({ ...current, address: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Length</span>
                      <input
                        className="input"
                        value={modbusForm.length}
                        onChange={(event) => setModbusForm((current) => ({ ...current, length: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Function Code</span>
                      <input
                        className="input"
                        value={modbusForm.functionCode}
                        onChange={(event) => setModbusForm((current) => ({ ...current, functionCode: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Unit ID</span>
                      <input
                        className="input"
                        value={modbusForm.unitId}
                        onChange={(event) => setModbusForm((current) => ({ ...current, unitId: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Timeout (ms)</span>
                      <input
                        className="input"
                        value={modbusForm.timeoutMs}
                        onChange={(event) => setModbusForm((current) => ({ ...current, timeoutMs: event.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>Write Payload (HEX)</span>
                      <input
                        className="input"
                        value={modbusForm.writeHex}
                        onChange={(event) => setModbusForm((current) => ({ ...current, writeHex: event.target.value }))}
                        placeholder="00 01"
                      />
                    </label>
                  </div>
                  <div className="action-row">
                    <button type="button" className="button" data-testid="modbus-read" aria-label="Read Modbus registers" onClick={() => void runModbusRead()} disabled={!canOperate}>
                      Read Registers
                    </button>
                    <button type="button" className="button secondary" data-testid="modbus-write" aria-label="Write payload to Modbus registers" onClick={() => void runModbusWrite()} disabled={!canOperate}>
                      Write Payload
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-grid">
                    <label className="field" style={{ gridColumn: "1 / -1" }}>
                      <span>HEX Payload</span>
                      <textarea
                        className="textarea"
                        value={rawForm.payload}
                        onChange={(event) => setRawForm((current) => ({ ...current, payload: event.target.value }))}
                        placeholder="68 05 64 05 c0 01 00 00"
                      />
                    </label>
                    <label className="field">
                      <span>Timeout (ms)</span>
                      <input
                        className="input"
                        value={rawForm.timeoutMs}
                        onChange={(event) => setRawForm((current) => ({ ...current, timeoutMs: event.target.value }))}
                      />
                    </label>
                  </div>
                  <div className="action-row">
                    <button type="button" className="button" data-testid="send-frame" aria-label="Send raw protocol frame" onClick={() => void sendRawFrame()} disabled={!canOperate}>
                      Send Frame
                    </button>
                    <button type="button" className="button secondary" data-testid="wait-frame" aria-label="Wait for next incoming frame" onClick={() => void waitForFrame()} disabled={!canOperate}>
                      Wait Next Frame
                    </button>
                  </div>
                </>
              )
            ) : (
              <div className="empty">Create and select a session before executing protocol operations.</div>
            )}
          </section>

          {selectedSession && getCapabilityActions(selectedSession.protocolId).length > 0 ? (
            <section className="section">
              <h3>Protocol Capability Actions</h3>
              <p className="muted">
                Trigger protocol-specific connection or control frames through the shared transaction kernel.
              </p>
              <div className="action-row">
                {getCapabilityActions(selectedSession.protocolId).map((capability) => (
                  <button
                    key={capability.action}
                    type="button"
                    className="button ghost"
                    onClick={() => void invokeCapabilityAction(capability.action)}
                    disabled={!canOperate}
                  >
                    {capability.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="section">
            <h3>Operation Result</h3>
            <pre className="result" data-testid="operation-result" role="log" aria-live="polite" aria-label="Operation result">{lastResult}</pre>
          </section>

          {selectedSession && isModbusProtocol(selectedSession.protocolId) ? (
            <section className="section">
              <h3>Polling Tasks</h3>
              <div className="form-grid">
                <label className="field">
                  <span>Interval (ms)</span>
                  <input
                    className="input"
                    value={pollForm.intervalMs}
                    onChange={(event) => setPollForm({ intervalMs: event.target.value })}
                  />
                </label>
              </div>
              <div className="action-row">
                <button type="button" className="button ghost" onClick={() => void startPollingTask()} disabled={!canOperate}>
                  Start Polling
                </button>
              </div>
              {selectedSession.tasks.length === 0 ? (
                <div className="empty" style={{ marginTop: 12 }}>No active polling tasks.</div>
              ) : (
                <div className="protocol-grid" style={{ marginTop: 12 }}>
                  {selectedSession.tasks.map((task) => (
                    <div key={task.taskId} className="protocol-card" style={{ cursor: "default" }}>
                      <div className="card-head">
                        <p className="card-title">{task.taskId}</p>
                        <span className="pill">{task.intervalMs} ms</span>
                      </div>
                      <p className="card-copy">Address {task.address} · Length {task.length}</p>
                      <div className="action-row" style={{ marginTop: 10 }}>
                        <button type="button" className="button ghost" onClick={() => void stopPollingTask(task.taskId)}>
                          Stop
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <ProtocolSessionDiagnostics
            session={selectedSession}
            events={selectedSessionEvents}
          />

          <section className="section" style={{ minHeight: 380 }}>
            <h3>Traffic Monitor</h3>
            <div className="form-grid" style={{ marginTop: 12, marginBottom: 12 }}>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Traffic Filter</span>
                <input
                  className="input"
                  data-testid="traffic-filter"
                  aria-label="Filter traffic by hex bytes, protocol id, direction or parsed fields"
                  value={trafficQuery}
                  onChange={(event) => setTrafficQuery(event.target.value)}
                  placeholder="Search hex bytes, protocol id, direction or parsed fields"
                />
              </label>
            </div>
            {selectedSession ? (
              <TrafficMonitor traffic={filteredTraffic as TrafficEvent[]} />
            ) : (
              <div className="empty">Traffic will appear here once a session is selected.</div>
            )}
          </section>
        </main>

        <aside className="guide">
          <section className="section" style={{ marginTop: 0 }}>
            <h3>Connection Guide</h3>
            <p className="muted">
              {activeManifest?.connectionSummary ?? "Select a protocol to inspect its connection model."}
            </p>
            <ol className="guide-list">
              {(activeManifest?.connectionSteps ?? [
                "Choose a protocol profile.",
                "Create a session with the required transport settings.",
                "Connect and execute requests while observing live traffic."
              ]).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>

          <section className="section">
            <h3>Read Behavior</h3>
            <p className="muted">
              {activeManifest?.readBehavior ?? "The selected protocol plugin did not provide extra guidance."}
            </p>
            {!isModbusProtocol(activeManifest?.protocolId) ? (
              <div className="pill-row">
                <span className="pill">Raw frame mode</span>
                <span className="pill">{(activeManifest?.defaultTransport ?? "tcp").toUpperCase()} session</span>
                <span className="pill">Traffic capture</span>
              </div>
            ) : null}
          </section>

          <section className="section">
            <h3>Serial Resources</h3>
            {serialPorts.length === 0 ? (
              <div className="empty">No serial ports are currently visible.</div>
            ) : (
              <div className="protocol-grid">
                {serialPorts.map((port) => (
                  <div key={port.path} className="protocol-card" style={{ cursor: "default" }}>
                    <div className="card-head">
                      <p className="card-title">{port.path}</p>
                      <span className="pill">{port.isMappedPhysical ? "Physical" : "Virtual"}</span>
                    </div>
                    <p className="card-copy">{port.friendlyName}</p>
                    <div className="pill-row">
                      {port.manufacturer ? <span className="pill">{port.manufacturer}</span> : null}
                      {port.vendorId ? <span className="pill">VID {port.vendorId}</span> : null}
                      {port.productId ? <span className="pill">PID {port.productId}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <h3>Application Logs</h3>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <label className="field">
                <span>Level</span>
                <select
                  className="input"
                  value={logLevel}
                  onChange={(event) => setLogLevel(event.target.value as "" | "info" | "warn" | "error")}
                >
                  <option value="">All</option>
                  <option value="info">Info</option>
                  <option value="warn">Warn</option>
                  <option value="error">Error</option>
                </select>
              </label>
            </div>
            <div className="action-row">
              <button type="button" className="button ghost" onClick={() => void refreshLogs()} disabled={loadingLogs}>
                {loadingLogs ? "Refreshing..." : "Refresh Logs"}
              </button>
            </div>
            {logs.length === 0 ? (
              <div className="empty" style={{ marginTop: 12 }}>No log entries loaded.</div>
            ) : (
              <div className="protocol-grid" style={{ marginTop: 12 }}>
                {logs.map((entry) => (
                  <div key={`${entry.timestamp}-${entry.message}`} className="protocol-card" style={{ cursor: "default" }}>
                    <div className="card-head">
                      <p className="card-title">{entry.level.toUpperCase()}</p>
                      <span className="pill">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="card-copy">{entry.message}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
      <ConfigTemplates
        isOpen={templatePanelOpen}
        onClose={() => setTemplatePanelOpen(false)}
        onLoadTemplate={handleLoadTemplateFromPanel}
        currentConfig={selectedManifest ? {
          protocolId: selectedManifest.protocolId,
          transport,
          config: coerceConfig(selectedManifest, transport, draftConfig, serialPorts)
        } : undefined}
      />
      <PerformanceMonitor
        isOpen={performancePanelOpen}
        onClose={() => setPerformancePanelOpen(false)}
        onBanner={setBanner}
      />
    </>
  );
}
