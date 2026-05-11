import React from "react";
import type { ProtocolManifest, SessionState } from "../../../packages/shared-types";
import SessionCard from "./SessionCard";

interface SessionListProps {
  sessions: SessionState[];
  manifests: ProtocolManifest[];
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
}

export default function SessionList({ sessions, manifests, selectedSessionId, onSelectSession }: SessionListProps) {
  return (
    <div>
      <h3 className="m-0 mb-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Sessions</h3>
      {sessions.length === 0 ? (
        <div className="p-4 border border-dashed border-slate-700 rounded-xl text-slate-500 text-xs text-center">
          No session has been created yet.
        </div>
      ) : (
        <div className="space-y-2" data-testid="session-list">
          {sessions.map((session) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              manifest={manifests.find((m) => m.protocolId === session.protocolId)}
              isSelected={session.sessionId === selectedSessionId}
              onSelect={onSelectSession}
            />
          ))}
        </div>
      )}
    </div>
  );
}
