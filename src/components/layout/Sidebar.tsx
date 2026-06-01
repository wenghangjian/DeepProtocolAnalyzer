import React from "react";
import type { ProtocolManifest, SerialPortInfo, SessionState } from "../../../packages/shared-types";
import SessionCreator from "../session/SessionCreator";
import SessionList from "../session/SessionList";

interface SidebarProps {
  manifests: ProtocolManifest[];
  sessions: SessionState[];
  serialPorts: SerialPortInfo[];
  selectedProtocolId: string;
  selectedSessionId: string | null;
  onSelectProtocol: (protocolId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onRefreshPorts: () => void;
  onOpenTemplates: () => void;
  onOpenPerformance: () => void;
  // Session creator state
  transport: "tcp" | "serial" | "udp";
  draftConfig: Record<string, string>;
  busy: boolean;
  refreshingPorts: boolean;
  onTransportChange: (transport: "tcp" | "serial" | "udp") => void;
  onDraftConfigChange: (config: Record<string, string>) => void;
}

export default function Sidebar({
  manifests,
  sessions,
  serialPorts,
  selectedProtocolId,
  selectedSessionId,
  onSelectProtocol,
  onSelectSession,
  onCreateSession,
  onRefreshPorts,
  onOpenTemplates,
  onOpenPerformance,
  transport,
  draftConfig,
  busy,
  refreshingPorts,
  onTransportChange,
  onDraftConfigChange,
}: SidebarProps) {
  const selectedManifest = manifests.find((m) => m.protocolId === selectedProtocolId);

  return (
    <aside className="w-full h-full border-r border-border bg-background/50 overflow-y-auto flex flex-col">
      {/* Protocol Selector + Config Form */}
      <div className="p-4 border-b border-slate-700/30">
        <SessionCreator
          manifests={manifests}
          selectedManifest={selectedManifest ?? null}
          selectedProtocolId={selectedProtocolId}
          transport={transport}
          draftConfig={draftConfig}
          serialPorts={serialPorts}
          busy={busy}
          refreshingPorts={refreshingPorts}
          onSelectProtocol={onSelectProtocol}
          onTransportChange={onTransportChange}
          onDraftConfigChange={onDraftConfigChange}
          onCreateSession={onCreateSession}
          onRefreshPorts={onRefreshPorts}
          onOpenTemplates={onOpenTemplates}
          onOpenPerformance={onOpenPerformance}
        />
      </div>

      {/* Session List */}
      <div className="p-4 flex-1 min-h-0">
        <SessionList
          sessions={sessions}
          manifests={manifests}
          selectedSessionId={selectedSessionId}
          onSelectSession={onSelectSession}
        />
      </div>
    </aside>
  );
}
