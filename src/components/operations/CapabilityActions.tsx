import React from "react";
import type { SessionState } from "../../../packages/shared-types";
import { Button } from "../ui";

interface CapabilityAction {
  action: string;
  label: string;
}

interface CapabilityActionsProps {
  session: SessionState | null;
  canOperate: boolean;
  onInvoke: (action: string) => void;
}

function getCapabilityActions(protocolId?: string): CapabilityAction[] {
  switch (protocolId) {
    case "iec104":
      return [
        { action: "iec104:startdt-act", label: "StartDT act" },
        { action: "iec104:testfr-act", label: "TestFR act" },
        { action: "iec104:stopdt-act", label: "StopDT act" }
      ];
    case "opcua":
      return [
        { action: "opcua:hello-probe", label: "HEL probe" },
        { action: "opcua:open-secure-channel-probe", label: "OPN probe" }
      ];
    default:
      return [];
  }
}

export default function CapabilityActions({ session, canOperate, onInvoke }: CapabilityActionsProps) {
  const actions = getCapabilityActions(session?.protocolId);

  if (!session || actions.length === 0) return null;

  return (
    <section className="p-4 rounded-xl border border-slate-700/50 bg-slate-800">
      <h3 className="m-0 mb-1 text-sm font-bold text-slate-200">Protocol Capability Actions</h3>
      <p className="m-0 mb-3 text-xs text-slate-400">
        Trigger protocol-specific connection or control frames through the shared transaction kernel.
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((capability) => (
          <Button
            key={capability.action}
            variant="ghost"
            size="sm"
            onClick={() => onInvoke(capability.action)}
            disabled={!canOperate}
          >
            {capability.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
