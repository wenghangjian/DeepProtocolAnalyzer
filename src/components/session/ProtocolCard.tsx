import React from "react";
import type { ProtocolManifest } from "../../../packages/shared-types";

interface ProtocolCardProps {
  manifest: ProtocolManifest;
  isSelected: boolean;
  onSelect: (protocolId: string) => void;
}

export default function ProtocolCard({ manifest, isSelected, onSelect }: ProtocolCardProps) {
  return (
    <button
      type="button"
      className={`w-full text-left p-3 rounded-xl border transition-all duration-150 cursor-pointer ${
        isSelected
          ? "border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/10"
          : "border-slate-700/50 bg-slate-800/50 hover:bg-slate-700/50 hover:border-slate-600/50"
      }`}
      data-testid={`protocol-card-${manifest.protocolId}`}
      aria-label={`Select ${manifest.protocolName} protocol`}
      aria-pressed={isSelected}
      onClick={() => onSelect(manifest.protocolId)}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-bold text-slate-100">{manifest.protocolName}</span>
        <span className="text-2xs px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">
          {manifest.defaultTransport ?? manifest.supportedTransports[0]}
        </span>
      </div>
      <p className="m-0 text-2xs text-slate-400 leading-relaxed line-clamp-2">
        {manifest.connectionSummary ?? "Protocol plugin"}
      </p>
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-2xs px-1.5 py-0.5 rounded-full bg-slate-700/60 text-slate-400">
          {manifest.category ?? "custom"}
        </span>
        <span className="text-2xs px-1.5 py-0.5 rounded-full bg-slate-700/60 text-slate-400">
          v{manifest.version}
        </span>
      </div>
    </button>
  );
}
