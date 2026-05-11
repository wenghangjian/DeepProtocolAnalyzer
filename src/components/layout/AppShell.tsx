import React from "react";
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
  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <Header sessions={props.sessions} banner={props.banner} />
      <div className="flex flex-1 min-h-0">
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
        <DetailPanel
          activeManifest={props.activeManifest}
          serialPorts={props.serialPorts}
          visible={props.detailPanelVisible}
        />
      </div>
    </div>
  );
}
