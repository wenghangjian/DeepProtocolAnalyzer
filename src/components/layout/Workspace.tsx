import React from "react";
import type { ProtocolManifest, SessionState, TrafficEvent } from "../../../packages/shared-types";
import ConnectionControl from "../session/ConnectionControl";
import OperationPanel from "../operations/OperationPanel";
import CapabilityActions from "../operations/CapabilityActions";
import TrafficMonitor from "../TrafficMonitor";
import PollTaskManager from "../PollTaskManager";
import ProtocolSessionDiagnostics from "../ProtocolSessionDiagnostics";

interface WorkspaceProps {
  activeManifest: ProtocolManifest | null;
  selectedSession: SessionState | null;
  selectedSessionId: string | null;
  filteredTraffic: TrafficEvent[];
  selectedSessionEvents: import("../../../packages/shared-types").SessionEvent[];
  banner: string;
  lastResult: string;
  trafficQuery: string;
  pollManagerOpen: boolean;
  sessions: SessionState[];
  canOperate: boolean;
  // Connection control
  onConnect: (sessionId: string) => void;
  onDisconnect: (sessionId: string) => void;
  onClearTraffic: () => void;
  onTogglePollManager: () => void;
  // Operations
  modbusForm: { address: string; length: string; functionCode: string; unitId: string; timeoutMs: string; writeHex: string };
  rawForm: { payload: string; timeoutMs: string };
  pollForm: { intervalMs: string };
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

export default function Workspace({
  activeManifest,
  selectedSession,
  selectedSessionId,
  filteredTraffic,
  selectedSessionEvents,
  banner,
  lastResult,
  trafficQuery,
  pollManagerOpen,
  sessions,
  canOperate,
  onConnect,
  onDisconnect,
  onClearTraffic,
  onTogglePollManager,
  modbusForm,
  rawForm,
  pollForm,
  onModbusFormChange,
  onRawFormChange,
  onPollFormChange,
  onModbusRead,
  onModbusWrite,
  onSendRawFrame,
  onWaitForFrame,
  onStartPolling,
  onStopPolling,
  onInvokeCapability,
  onTrafficQueryChange,
  onBanner,
}: WorkspaceProps) {
  return (
    <main className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 min-w-0" id="main-content" role="main">
      {/* Hero banner */}
      <div className="flex items-start justify-between gap-4 p-5 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-800/80 border border-slate-700/50">
        <div>
          <h2 className="m-0 mb-1.5 text-xl font-bold text-slate-100 tracking-tight">
            {activeManifest?.protocolName ?? "Select a protocol"}
          </h2>
          <p className="m-0 text-sm text-slate-400 leading-relaxed max-w-2xl">
            {selectedSession
              ? `${selectedSession.sessionId} is ready for connection management, request execution and live traffic inspection.`
              : activeManifest?.connectionSummary ?? "Choose a protocol profile and create a session from the left panel."}
          </p>
        </div>
        {selectedSession && (
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-xs font-semibold ${
              selectedSession.status === "connected" ? "bg-emerald-900/60 text-emerald-300" :
              selectedSession.status === "connecting" ? "bg-blue-900/60 text-blue-300" :
              selectedSession.status === "error" ? "bg-red-900/60 text-red-300" :
              "bg-slate-700/60 text-slate-300"
            }`}>
              {selectedSession.status}
            </span>
            <span className="inline-flex items-center h-6 px-2.5 rounded-full text-xs font-semibold bg-slate-700/60 text-slate-300">
              {selectedSession.transport.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Banner */}
      <div
        className="px-4 py-3 rounded-xl border border-amber-600/20 bg-amber-900/20 text-amber-200 text-sm"
        data-testid="banner"
        role="status"
        aria-live="polite"
      >
        {banner}
      </div>

      {/* Connection Control */}
      <ConnectionControl
        session={selectedSession}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onClearTraffic={onClearTraffic}
        onTogglePollManager={onTogglePollManager}
        pollManagerOpen={pollManagerOpen}
      />

      {/* Poll Task Manager */}
      {pollManagerOpen && (
        <PollTaskManager sessions={sessions} onBanner={onBanner} />
      )}

      {/* Operations */}
      <OperationPanel
        session={selectedSession}
        canOperate={canOperate}
        modbusForm={modbusForm}
        rawForm={rawForm}
        pollForm={pollForm}
        onModbusFormChange={onModbusFormChange}
        onRawFormChange={onRawFormChange}
        onPollFormChange={onPollFormChange}
        onModbusRead={onModbusRead}
        onModbusWrite={onModbusWrite}
        onSendRawFrame={onSendRawFrame}
        onWaitForFrame={onWaitForFrame}
        onStartPolling={onStartPolling}
        onStopPolling={onStopPolling}
      />

      {/* Capability Actions */}
      <CapabilityActions
        session={selectedSession}
        canOperate={canOperate}
        onInvoke={onInvokeCapability}
      />

      {/* Operation Result */}
      <section className="p-4 rounded-xl border border-slate-700/50 bg-slate-800">
        <h3 className="m-0 mb-3 text-sm font-bold text-slate-200">Operation Result</h3>
        <pre
          className="p-3 rounded-lg bg-slate-900 text-blue-200 text-xs leading-relaxed overflow-auto max-h-[300px] m-0 font-mono"
          data-testid="operation-result"
          role="log"
          aria-live="polite"
          aria-label="Operation result"
        >
          {lastResult}
        </pre>
      </section>

      {/* Diagnostics */}
      <ProtocolSessionDiagnostics session={selectedSession} events={selectedSessionEvents} />

      {/* Traffic Monitor */}
      <section className="p-4 rounded-xl border border-slate-700/50 bg-slate-800 min-h-[380px] flex flex-col">
        <h3 className="m-0 mb-3 text-sm font-bold text-slate-200">Traffic Monitor</h3>
        <div className="mb-3">
          <input
            className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-500"
            data-testid="traffic-filter"
            aria-label="Filter traffic by hex bytes, protocol id, direction or parsed fields"
            value={trafficQuery}
            onChange={(e) => onTrafficQueryChange(e.target.value)}
            placeholder="Search hex bytes, protocol id, direction or parsed fields"
          />
        </div>
        {selectedSession ? (
          <TrafficMonitor traffic={filteredTraffic as TrafficEvent[]} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm border border-dashed border-slate-700 rounded-xl p-6">
            Traffic will appear here once a session is selected.
          </div>
        )}
      </section>
    </main>
  );
}
