import React from "react";
import type { SessionState } from "../../../packages/shared-types";
import { Badge } from "../ui";

interface HeaderProps {
  sessions: SessionState[];
  banner: string;
}

export default function Header({ sessions, banner }: HeaderProps) {
  const connectedCount = sessions.filter((s) => s.status === "connected").length;
  const errorCount = sessions.filter((s) => s.status === "error").length;

  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-sm shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
          <span className="text-white font-bold text-sm">DP</span>
        </div>
        <h1 className="text-base font-bold text-slate-100 tracking-tight m-0">
          DeepProtocolAnalyzer
        </h1>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-3">
        {sessions.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="info" dot={connectedCount > 0} pulse={connectedCount > 0}>
              {connectedCount} connected
            </Badge>
            {errorCount > 0 && (
              <Badge variant="danger" dot>
                {errorCount} error
              </Badge>
            )}
            <Badge variant="neutral">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        )}
        {banner && (
          <span className="text-xs text-slate-400 max-w-md truncate" title={banner}>
            {banner}
          </span>
        )}
      </div>
    </header>
  );
}
