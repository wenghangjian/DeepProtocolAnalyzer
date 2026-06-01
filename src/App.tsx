import { useDeferredValue, useEffect, useRef, useState, useCallback } from "react";
import type {
  ProtocolManifest,
  SerialPortInfo,
  SessionState,
  TrafficEvent
} from "../packages/shared-types";
import ConfigTemplates from "./components/ConfigTemplates";
import PerformanceMonitor from "./components/PerformanceMonitor";
import AppShell from "./components/layout/AppShell";
import { useSessionStore } from "./store/session-store";

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

function formatCapabilityResult(action: string, result: unknown) {
  if (result instanceof Uint8Array) {
    return `${action}\nRX ${result.length}B\n${toHex(result)}`;
  }
  return `${action}\n${JSON.stringify(result, null, 2)}`;
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
  const [trafficQuery, setTrafficQuery] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [templatePanelOpen, setTemplatePanelOpen] = useState(false);
  const [pollManagerOpen, setPollManagerOpen] = useState(false);
  const [performancePanelOpen, setPerformancePanelOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("dpa-theme");
    return saved === "light" ? "light" : "dark";
  });
  const skipDraftPresetResetRef = useRef(false);

  // Apply theme class to document element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem("dpa-theme", theme);
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

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

  async function syncSession(sessionId: string) {
    const session = await window.sessionApi.status(sessionId);
    if (session) {
      upsertSession(session);
    }
  }

  /* ── Bootstrap ──────────────────────────────────────────────── */

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
        if (!alive) return;

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
      } catch (error) {
        setBanner(error instanceof Error ? error.message : "Failed to load application state.");
      } finally {
        if (alive) setHydrated(true);
      }
    }

    void bootstrap();

    const unsubscribeStatus = window.sessionApi.onStatusChange(({ sessionId, status, lastError }) => {
      updateStatus(sessionId, status, lastError);
      if (status === "error" && lastError) setBanner(lastError);
    });
    const unsubscribeCrash = window.sessionApi.onCrash(({ sessionId, code }) => {
      updateStatus(sessionId, "error", `Worker exited with code ${String(code ?? "unknown")}`);
      setBanner(`Protocol worker crashed for ${sessionId}.`);
    });
    const unsubscribeSessionEvent = window.sessionApi.onEvent((event) => {
      addSessionEvent(event);
      if (event.type === "connection-state" && event.reason && event.state === "error") setBanner(event.reason);
      if (event.type === "transaction" && event.error) setBanner(event.error);
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

  /* ── Draft preset reset when protocol changes ──────────────── */

  useEffect(() => {
    if (!selectedManifest) return;
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
    if (!selectedSession) return;
    const config = selectedSession.config as Record<string, unknown>;
    if (typeof config.unitId === "number") {
      setModbusForm((current) => ({ ...current, unitId: String(config.unitId) }));
    }
  }, [selectedSession]);

  /* ── Workspace persistence ──────────────────────────────────── */

  useEffect(() => {
    if (!hydrated) return;
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

  /* ── Actions ────────────────────────────────────────────────── */

  const canOperate = selectedSession?.status === "connected";

  async function createSession() {
    if (!selectedManifest) return;
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
    if (!selectedSession) return;
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
    if (!selectedSession) return;
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
    if (!selectedSession) return;
    try {
      const payload = parseHex(modbusForm.writeHex);
      if (payload.length === 0) throw new Error("Write payload is empty.");
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
    if (!selectedSession) return;
    try {
      const payload = parseHex(rawForm.payload);
      if (payload.length === 0) throw new Error("HEX payload is empty.");
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
    if (!selectedSession) return;
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
    if (!selectedSession) return;
    await window.trafficApi.clear(selectedSession.sessionId);
    clearTraffic(selectedSession.sessionId);
    setLastResult("Traffic buffer cleared for the selected session.");
  }

  async function startPollingTask() {
    if (!selectedSession || (selectedSession.protocolId !== "modbus-tcp" && selectedSession.protocolId !== "modbus-rtu")) return;
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
    if (!selectedSession) return;
    const response = await window.taskApi.stop(selectedSession.sessionId, taskId);
    if (!response.success) {
      setBanner(`Failed to stop task ${taskId}.`);
      return;
    }
    await syncSession(selectedSession.sessionId);
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

  /* ── Render ─────────────────────────────────────────────────── */

  return (
    <>
      <AppShell
        manifests={manifests}
        sessions={sessions}
        serialPorts={serialPorts}
        selectedProtocolId={selectedProtocolId}
        selectedSessionId={selectedSessionId}
        selectedSession={selectedSession}
        activeManifest={activeManifest ?? null}
        filteredTraffic={filteredTraffic}
        selectedSessionEvents={selectedSessionEvents}
        banner={banner}
        lastResult={lastResult}
        trafficQuery={trafficQuery}
        pollManagerOpen={pollManagerOpen}
        canOperate={canOperate}
        busy={busy}
        refreshingPorts={refreshingPorts}
        transport={transport}
        draftConfig={draftConfig}
        modbusForm={modbusForm}
        rawForm={rawForm}
        pollForm={pollForm}
        detailPanelVisible={true}
        onSelectProtocol={setSelectedProtocolId}
        onSelectSession={selectSession}
        onCreateSession={() => void createSession()}
        onRefreshPorts={() => void refreshSerialPorts()}
        onOpenTemplates={() => setTemplatePanelOpen(true)}
        onOpenPerformance={() => setPerformancePanelOpen(true)}
        onTransportChange={setTransport}
        onDraftConfigChange={setDraftConfig}
        onConnect={(id) => void connectSelectedSession(id)}
        onDisconnect={(id) => void disconnectSelectedSession(id)}
        onClearTraffic={() => void clearSelectedTraffic()}
        onTogglePollManager={() => setPollManagerOpen((v) => !v)}
        onModbusFormChange={setModbusForm}
        onRawFormChange={setRawForm}
        onPollFormChange={setPollForm}
        onModbusRead={() => void runModbusRead()}
        onModbusWrite={() => void runModbusWrite()}
        onSendRawFrame={() => void sendRawFrame()}
        onWaitForFrame={() => void waitForFrame()}
        onStartPolling={() => void startPollingTask()}
        onStopPolling={(id) => void stopPollingTask(id)}
        onInvokeCapability={(action) => void invokeCapabilityAction(action)}
        onTrafficQueryChange={setTrafficQuery}
        onBanner={setBanner}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />
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
