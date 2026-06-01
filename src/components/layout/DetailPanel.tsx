import React, { useState, useEffect, useCallback } from "react";
import type { ProtocolManifest, SerialPortInfo } from "../../../packages/shared-types";

interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error";
  message: string;
  meta?: unknown;
}

interface DetailPanelProps {
  activeManifest: ProtocolManifest | null;
  serialPorts: SerialPortInfo[];
  visible: boolean;
}

export default function DetailPanel({ activeManifest, serialPorts, visible }: DetailPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logLevel, setLogLevel] = useState<"" | "info" | "warn" | "error">("");
  const [loadingLogs, setLoadingLogs] = useState(false);

  const refreshLogs = useCallback(async (nextLevel = logLevel) => {
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
  }, [logLevel]);

  useEffect(() => {
    void refreshLogs();
  }, [logLevel]);

  if (!visible) return null;

  return (
    <aside className="w-full h-full border-l border-border bg-background/50 overflow-y-auto flex flex-col">
      {/* Connection Guide */}
      <div className="p-4 border-b border-slate-700/30">
        <h3 className="m-0 mb-2 text-sm font-bold text-slate-200">Connection Guide</h3>
        <p className="m-0 mb-3 text-xs text-slate-400 leading-relaxed">
          {activeManifest?.connectionSummary ?? "Select a protocol to inspect its connection model."}
        </p>
        <ol className="m-0 pl-4 text-xs text-slate-400 leading-relaxed space-y-2">
          {(activeManifest?.connectionSteps ?? [
            "Choose a protocol profile.",
            "Create a session with the required transport settings.",
            "Connect and execute requests while observing live traffic."
          ]).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      {/* Read Behavior */}
      <div className="p-4 border-b border-slate-700/30">
        <h3 className="m-0 mb-2 text-sm font-bold text-slate-200">Read Behavior</h3>
        <p className="m-0 text-xs text-slate-400 leading-relaxed">
          {activeManifest?.readBehavior ?? "The selected protocol plugin did not provide extra guidance."}
        </p>
      </div>

      {/* Serial Resources */}
      <div className="p-4 border-b border-slate-700/30">
        <h3 className="m-0 mb-2 text-sm font-bold text-slate-200">Serial Resources</h3>
        {serialPorts.length === 0 ? (
          <p className="m-0 text-xs text-slate-500">No serial ports are currently visible.</p>
        ) : (
          <div className="space-y-2">
            {serialPorts.map((port) => (
              <div key={port.path} className="p-2.5 rounded-lg border border-slate-700/50 bg-slate-800/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-200">{port.path}</span>
                  <span className="text-2xs px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">
                    {port.isMappedPhysical ? "Physical" : "Virtual"}
                  </span>
                </div>
                <p className="m-0 text-2xs text-slate-500">{port.friendlyName}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Application Logs */}
      <div className="p-4 flex-1 min-h-0">
        <h3 className="m-0 mb-2 text-sm font-bold text-slate-200">Application Logs</h3>
        <div className="flex items-center gap-2 mb-3">
          <select
            className="flex-1 px-2 py-1.5 rounded-lg border border-slate-600 bg-slate-900 text-slate-300 text-xs outline-none focus:ring-2 focus:ring-blue-500/30"
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value as "" | "info" | "warn" | "error")}
          >
            <option value="">All</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg border border-slate-600 bg-transparent text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-colors cursor-pointer"
            onClick={() => void refreshLogs()}
            disabled={loadingLogs}
          >
            {loadingLogs ? "..." : "Refresh"}
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="m-0 text-xs text-slate-500">No log entries loaded.</p>
        ) : (
          <div className="space-y-1.5">
            {logs.map((entry) => (
              <div key={`${entry.timestamp}-${entry.message}`} className="p-2 rounded-lg border border-slate-700/30 bg-slate-800/30">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-2xs font-bold uppercase ${
                    entry.level === "error" ? "text-red-400" :
                    entry.level === "warn" ? "text-amber-400" :
                    "text-blue-400"
                  }`}>{entry.level}</span>
                  <span className="text-2xs text-slate-500">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="m-0 text-2xs text-slate-400 leading-relaxed">{entry.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
