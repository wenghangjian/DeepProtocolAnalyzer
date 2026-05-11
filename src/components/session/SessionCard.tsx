import React from "react";
import type { ProtocolManifest, SessionState } from "../../../packages/shared-types";

interface SessionCardProps {
  session: SessionState;
  manifest: ProtocolManifest | undefined;
  isSelected: boolean;
  onSelect: (sessionId: string) => void;
}

function getSessionSummary(session: SessionState): string {
  const config = session.config as Record<string, unknown>;
  if (session.transport === "tcp" || session.transport === "udp") {
    return `${String(config.host ?? "127.0.0.1")}:${String(config.port ?? "")}`;
  }
  return `${String(config.path ?? "")} @ ${String(config.baudRate ?? "")}`;
}

export default function SessionCard({ session, manifest, isSelected, onSelect }: SessionCardProps) {
  const statusColors: Record<string, string> = {
    connected: "bg-emerald-900/60 text-emerald-300",
    connecting: "bg-blue-900/60 text-blue-300",
    disconnected: "bg-slate-700/60 text-slate-400",
    error: "bg-red-900/60 text-red-300",
  };

  return (
    <button
      type="button"
      className={`w-full text-left p-3 rounded-xl border transition-all duration-150 cursor-pointer ${
        isSelected
          ? "border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10"
          : "border-slate-700/50 bg-slate-800/50 hover:bg-slate-700/50 hover:border-slate-600/50"
      }`}
      data-testid={`session-card-${session.sessionId}`}
      aria-label={`Select session ${session.sessionId} (${session.status})`}
      aria-current={isSelected ? "true" : undefined}
      onClick={() => onSelect(session.sessionId)}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-slate-100 truncate">
          {manifest?.protocolName ?? session.protocolId}
        </span>
        <span className={`text-2xs px-1.5 py-0.5 rounded-full font-semibold ${statusColors[session.status] ?? statusColors.disconnected}`}>
          {session.status}
        </span>
      </div>
      <p className="m-0 text-2xs text-slate-400 font-mono">{getSessionSummary(session)}</p>
      {session.lastError && (
        <p className="m-0 mt-1 text-2xs text-red-400">{session.lastError}</p>
      )}
    </button>
  );
}
