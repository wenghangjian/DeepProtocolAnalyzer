import React from "react";
import type { SessionState } from "../../../packages/shared-types";
import { Button } from "../ui";

interface ConnectionControlProps {
  session: SessionState | null;
  onConnect: (sessionId: string) => void;
  onDisconnect: (sessionId: string) => void;
  onClearTraffic: () => void;
  onTogglePollManager: () => void;
  pollManagerOpen: boolean;
}

function getSessionSummary(session: SessionState): string {
  const config = session.config as Record<string, unknown>;
  if (session.transport === "tcp" || session.transport === "udp") {
    return `${String(config.host ?? "127.0.0.1")}:${String(config.port ?? "")}`;
  }
  return `${String(config.path ?? "")} @ ${String(config.baudRate ?? "")}`;
}

export default function ConnectionControl({
  session,
  onConnect,
  onDisconnect,
  onClearTraffic,
  onTogglePollManager,
  pollManagerOpen,
}: ConnectionControlProps) {
  return (
    <section className="p-4 rounded-xl border border-slate-700/50 bg-slate-800">
      <h3 className="m-0 mb-3 text-sm font-bold text-slate-200">Connection Control</h3>
      {session ? (
        <>
          <p className="m-0 mb-3 text-xs text-slate-400 font-mono">{getSessionSummary(session)}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              data-testid="connect-session"
              aria-label={`Connect to session ${session.sessionId}`}
              onClick={() => onConnect(session.sessionId)}
              disabled={session.status === "connected"}
            >
              Connect
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="disconnect-session"
              aria-label={`Disconnect session ${session.sessionId}`}
              onClick={() => onDisconnect(session.sessionId)}
              disabled={session.status !== "connected"}
            >
              Disconnect
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="clear-traffic"
              aria-label="Clear traffic buffer for selected session"
              onClick={onClearTraffic}
            >
              Clear Traffic
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid="toggle-poll-manager"
              aria-label={pollManagerOpen ? "Hide poll task manager" : "Show poll task manager"}
              aria-expanded={pollManagerOpen}
              onClick={onTogglePollManager}
            >
              {pollManagerOpen ? "Hide Poll Tasks" : "Poll Tasks"}
            </Button>
          </div>
        </>
      ) : (
        <div className="p-4 border border-dashed border-slate-700 rounded-xl text-slate-500 text-xs text-center">
          Select a session to connect, disconnect and inspect traffic.
        </div>
      )}
    </section>
  );
}
