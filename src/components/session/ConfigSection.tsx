import React, { useState } from "react";
import ConfigField from "./ConfigField";

interface FieldSchema {
  type: string;
  default?: string | number | boolean;
  description?: string;
  required?: boolean;
  min?: number;
  max?: number;
  enum?: Array<string | number>;
}

interface ConfigSectionProps {
  title: string;
  fields: Record<string, FieldSchema>;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  transport: "tcp" | "serial" | "udp";
  serialPorts?: Array<{ path: string; friendlyName: string; isMappedPhysical: boolean }>;
  baudRates?: string[];
  defaultOpen?: boolean;
}

export default function ConfigSection({
  title,
  fields,
  values,
  onChange,
  transport,
  serialPorts,
  baudRates,
  defaultOpen = true,
}: ConfigSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [showHelp, setShowHelp] = useState(false);

  // Filter fields based on transport relevance
  const relevantFields = Object.entries(fields).filter(([key]) => {
    // Serial-only fields
    if (["path", "baudRate", "dataBits", "stopBits"].includes(key)) {
      return transport === "serial";
    }
    // TCP/UDP-only fields
    if (["host", "port", "localPort", "bindAddress"].includes(key)) {
      return transport === "tcp" || transport === "udp";
    }
    return true;
  });

  if (relevantFields.length === 0) return null;

  return (
    <div className="border border-slate-700/30 rounded-lg overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/50">
        <button
          type="button"
          className="flex items-center gap-2 flex-1 text-left cursor-pointer bg-transparent border-none p-0"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="text-slate-500 text-xs transition-transform" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>
            ▶
          </span>
          <span className="text-xs font-bold text-slate-300">{title}</span>
        </button>
        <button
          type="button"
          className={`w-5 h-5 flex items-center justify-center rounded text-2xs font-bold cursor-pointer transition-colors ${
            showHelp
              ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
              : "bg-transparent text-slate-500 border border-transparent hover:text-slate-300"
          }`}
          onClick={(e) => { e.stopPropagation(); setShowHelp(!showHelp); }}
          title="Toggle field descriptions"
          aria-label={showHelp ? "Hide field descriptions" : "Show field descriptions"}
        >
          ?
        </button>
      </div>

      {/* Fields */}
      {isOpen && (
        <div className="p-3 space-y-3">
          {relevantFields.map(([key, schema]) => (
            <ConfigField
              key={key}
              fieldKey={key}
              schema={schema}
              value={values[key] ?? ""}
              onChange={onChange}
              showDescription={showHelp}
              serialPorts={key === "path" ? serialPorts : undefined}
              baudRates={key === "baudRate" ? baudRates : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
