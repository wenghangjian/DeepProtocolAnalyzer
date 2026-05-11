import React from "react";
import type { ProtocolManifest, SerialPortInfo } from "../../../packages/shared-types";
import ProtocolCard from "./ProtocolCard";
import ConfigForm from "./ConfigForm";
import { Button } from "../ui";

interface SessionCreatorProps {
  manifests: ProtocolManifest[];
  selectedManifest: ProtocolManifest | null;
  selectedProtocolId: string;
  transport: "tcp" | "serial" | "udp";
  draftConfig: Record<string, string>;
  serialPorts: SerialPortInfo[];
  busy: boolean;
  refreshingPorts: boolean;
  onSelectProtocol: (protocolId: string) => void;
  onTransportChange: (transport: "tcp" | "serial" | "udp") => void;
  onDraftConfigChange: (config: Record<string, string>) => void;
  onCreateSession: () => void;
  onRefreshPorts: () => void;
  onOpenTemplates: () => void;
  onOpenPerformance: () => void;
}

export default function SessionCreator({
  manifests,
  selectedManifest,
  selectedProtocolId,
  transport,
  draftConfig,
  serialPorts,
  busy,
  refreshingPorts,
  onSelectProtocol,
  onTransportChange,
  onDraftConfigChange,
  onCreateSession,
  onRefreshPorts,
  onOpenTemplates,
  onOpenPerformance,
}: SessionCreatorProps) {
  return (
    <div>
      <h3 className="m-0 mb-3 text-xs font-bold text-slate-400 uppercase tracking-wider">New Session</h3>

      {/* Protocol grid */}
      <div className="space-y-2 mb-4">
        {manifests.map((manifest) => (
          <ProtocolCard
            key={manifest.protocolId}
            manifest={manifest}
            isSelected={manifest.protocolId === selectedProtocolId}
            onSelect={onSelectProtocol}
          />
        ))}
      </div>

      {/* Config form */}
      {selectedManifest && (
        <>
          <ConfigForm
            manifest={selectedManifest}
            transport={transport}
            draftConfig={draftConfig}
            serialPorts={serialPorts}
            onTransportChange={onTransportChange}
            onDraftConfigChange={onDraftConfigChange}
          />

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              variant="primary"
              size="sm"
              data-testid="create-session"
              aria-label={busy ? "Creating session..." : "Create new session"}
              onClick={onCreateSession}
              disabled={busy}
            >
              {busy ? "Creating..." : "Create Session"}
            </Button>
            {transport === "serial" && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={refreshingPorts ? "Refreshing serial ports..." : "Refresh serial ports"}
                onClick={onRefreshPorts}
                disabled={refreshingPorts}
              >
                {refreshingPorts ? "Refreshing..." : "Refresh Ports"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              aria-label="Open config templates panel"
              onClick={onOpenTemplates}
              data-testid="open-templates-btn"
            >
              Templates
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Open performance benchmark panel"
              onClick={onOpenPerformance}
              data-testid="open-performance-btn"
            >
              Performance
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
