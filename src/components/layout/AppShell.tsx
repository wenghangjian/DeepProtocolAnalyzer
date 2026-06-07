import React, { useState, useCallback } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Workspace from "./Workspace";
import DetailPanel from "./DetailPanel";
import type { ProtocolManifest, SerialPortInfo, SessionState, SessionEvent, TrafficEvent } from "../../../packages/shared-types";

interface AppShellProps {
  // Data
  manifests: ProtocolManifest[];
  sessions: SessionState[];
  serialPorts: SerialPortInfo[];
  selectedProtocolId: string;
  selectedSessionId: string | null;
  selectedSession: SessionState | null;
  activeManifest: ProtocolManifest | null;
  filteredTraffic: TrafficEvent[];
  selectedSessionEvents: SessionEvent[];
  banner: string;
  lastResult: string;
  trafficQuery: string;
  pollManagerOpen: boolean;
  canOperate: boolean;
  busy: boolean;
  refreshingPorts: boolean;
  transport: "tcp" | "serial" | "udp";
  draftConfig: Record<string, string>;
  modbusForm: { address: string; length: string; functionCode: string; unitId: string; timeoutMs: string; writeHex: string };
  rawForm: { payload: string; timeoutMs: string };
  pollForm: { intervalMs: string };
  detailPanelVisible: boolean;

  // Theme
  theme: "dark" | "light";
  onToggleTheme: () => void;

  // Callbacks
  onSelectProtocol: (protocolId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onRefreshPorts: () => void;
  onOpenTemplates: () => void;
  onOpenPerformance: () => void;
  onTransportChange: (transport: "tcp" | "serial" | "udp") => void;
  onDraftConfigChange: (config: Record<string, string>) => void;
  onConnect: (sessionId: string) => void;
  onDisconnect: (sessionId: string) => void;
  onClearTraffic: () => void;
  onTogglePollManager: () => void;
  onModbusFormChange: (form: { address: string; length: string; functionCode: string; unitId: string; timeoutMs: string; writeHex: string }) => void;
  onRawFormChange: (form: { payload: string; timeoutMs: string }) => void;
  onPollFormChange: (form: { intervalMs: string }) => void;
  onModbusRead: () => void;
  onModbusWrite: () => void;
  onSendRawFrame: () => void;
  onWaitForFrame: () => void;
  onStartPolling: () => void;
  onStopPolling: (taskId: string) => void;
  onInvokeCapability: (action: string) => void;
  onTrafficQueryChange: (query: string) => void;
  onBanner: (message: string) => void;
}

export default function AppShell(props: AppShellProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  const toggleLeft = useCallback(() => setLeftCollapsed((v) => !v), []);
  const toggleRight = useCallback(() => setRightCollapsed((v) => !v), []);

  const rightVisible = props.detailPanelVisible && !rightCollapsed;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <Header
        sessions={props.sessions}
        banner={props.banner}
        theme={props.theme}
        onToggleTheme={props.onToggleTheme}
      />
      <div className="flex flex-1 min-h-0 relative">
        {/* Left sidebar with collapse transition */}
        <div
          className="transition-[width,min-width] duration-200 ease-in-out overflow-hidden"
          style={{ width: leftCollapsed ? 0 : 280, minWidth: leftCollapsed ? 0 : 280 }}
        >
          <Sidebar
            manifests={props.manifests}
            sessions={props.sessions}
            serialPorts={props.serialPorts}
            selectedProtocolId={props.selectedProtocolId}
            selectedSessionId={props.selectedSessionId}
            onSelectProtocol={props.onSelectProtocol}
            onSelectSession={props.onSelectSession}
            onCreateSession={props.onCreateSession}
            onRefreshPorts={props.onRefreshPorts}
            onOpenTemplates={props.onOpenTemplates}
            onOpenPerformance={props.onOpenPerformance}
            transport={props.transport}
            draftConfig={props.draftConfig}
            busy={props.busy}
            refreshingPorts={props.refreshingPorts}
            onTransportChange={props.onTransportChange}
            onDraftConfigChange={props.onDraftConfigChange}
          />
        </div>

        {/* Left collapse toggle */}
        <button
          type="button"
          onClick={toggleLeft}
          className="absolute top-2 z-20 flex items-center justify-center w-6 h-6 rounded-md bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          style={{ left: leftCollapsed ? 4 : 276 }}
          aria-label={leftCollapsed ? "Expand left sidebar" : "Collapse left sidebar"}
          data-testid="toggle-left-sidebar"
        >
          {leftCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>

        {/* Main workspace */}
        <div className="flex-1 min-w-0">
          <Workspace
            activeManifest={props.activeManifest}
            selectedSession={props.selectedSession}
            selectedSessionId={props.selectedSessionId}
            filteredTraffic={props.filteredTraffic}
            selectedSessionEvents={props.selectedSessionEvents}
            banner={props.banner}
            lastResult={props.lastResult}
            trafficQuery={props.trafficQuery}
            pollManagerOpen={props.pollManagerOpen}
            sessions={props.sessions}
            canOperate={props.canOperate}
            onConnect={props.onConnect}
            onDisconnect={props.onDisconnect}
            onClearTraffic={props.onClearTraffic}
            onTogglePollManager={props.onTogglePollManager}
            modbusForm={props.modbusForm}
            rawForm={props.rawForm}
            pollForm={props.pollForm}
            onModbusFormChange={props.onModbusFormChange}
            onRawFormChange={props.onRawFormChange}
            onPollFormChange={props.onPollFormChange}
            onModbusRead={props.onModbusRead}
            onModbusWrite={props.onModbusWrite}
            onSendRawFrame={props.onSendRawFrame}
            onWaitForFrame={props.onWaitForFrame}
            onStartPolling={props.onStartPolling}
            onStopPolling={props.onStopPolling}
            onInvokeCapability={props.onInvokeCapability}
            onTrafficQueryChange={props.onTrafficQueryChange}
            onBanner={props.onBanner}
          />
        </div>

        {/* Right collapse toggle (only when detail panel should be visible) */}
        {props.detailPanelVisible && (
          <button
            type="button"
            onClick={toggleRight}
            className="absolute top-2 z-20 flex items-center justify-center w-6 h-6 rounded-md bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            style={{ right: rightCollapsed ? 4 : 316 }}
            aria-label={rightCollapsed ? "Expand right panel" : "Collapse right panel"}
            data-testid="toggle-right-sidebar"
          >
            {rightCollapsed ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
          </button>
        )}

        {/* Right detail panel with collapse transition */}
        {props.detailPanelVisible && (
          <div
            className="transition-[width,min-width] duration-200 ease-in-out overflow-hidden"
            style={{ width: rightCollapsed ? 0 : 320, minWidth: rightCollapsed ? 0 : 320 }}
          >
            <DetailPanel
              activeManifest={props.activeManifest}
              serialPorts={props.serialPorts}
              visible={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
