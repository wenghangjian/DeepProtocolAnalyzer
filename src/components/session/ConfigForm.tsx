import React from "react";
import type { ProtocolManifest, SerialPortInfo } from "../../../packages/shared-types";
import ConfigSection from "./ConfigSection";

const COMMON_BAUD_RATES = ["1200", "2400", "4800", "9600", "19200", "38400", "57600", "115200"];

interface ConfigFormProps {
  manifest: ProtocolManifest;
  transport: "tcp" | "serial" | "udp";
  draftConfig: Record<string, string>;
  serialPorts: SerialPortInfo[];
  onTransportChange: (transport: "tcp" | "serial" | "udp") => void;
  onDraftConfigChange: (config: Record<string, string>) => void;
}

export default function ConfigForm({
  manifest,
  transport,
  draftConfig,
  serialPorts,
  onTransportChange,
  onDraftConfigChange,
}: ConfigFormProps) {
  const configSchema = ((manifest as unknown) as Record<string, unknown>).configSchema as
    | Record<string, Record<string, { type: string; default?: string | number | boolean; description?: string; required?: boolean; min?: number; max?: number; enum?: Array<string | number> }>>
    | undefined;

  function handleFieldChange(key: string, value: string) {
    onDraftConfigChange({ ...draftConfig, [key]: value });
  }

  // If configSchema exists, use it to render grouped sections
  if (configSchema) {
    const sectionNames: Record<string, string> = {
      connection: "Connection",
      protocol: "Protocol",
      advanced: "Advanced",
    };

    return (
      <div className="space-y-3">
        {/* Transport selector */}
        {manifest.supportedTransports.length > 1 && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-400">Transport</span>
            <select
              className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              value={transport}
              onChange={(e) => onTransportChange(e.target.value as "tcp" | "serial" | "udp")}
            >
              {manifest.supportedTransports.map((t) => (
                <option key={t} value={t}>{t.toUpperCase()}</option>
              ))}
            </select>
          </label>
        )}

        {/* Schema-driven sections */}
        {Object.entries(configSchema).map(([sectionKey, fields]) => (
          <ConfigSection
            key={sectionKey}
            title={sectionNames[sectionKey] ?? sectionKey}
            fields={fields}
            values={draftConfig}
            onChange={handleFieldChange}
            transport={transport}
            serialPorts={serialPorts}
            baudRates={COMMON_BAUD_RATES}
            defaultOpen={sectionKey !== "advanced"}
          />
        ))}
      </div>
    );
  }

  // Fallback: render from defaultConfig (no schema)
  const defaultConfig = manifest.defaultConfig ?? {};
  const allKeys = new Set(Object.keys(defaultConfig));
  if (transport === "tcp" || transport === "udp") {
    allKeys.add("host");
    allKeys.add("port");
  } else {
    allKeys.add("path");
    allKeys.add("baudRate");
  }

  return (
    <div className="space-y-3">
      {/* Transport selector */}
      {manifest.supportedTransports.length > 1 && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400">Transport</span>
          <select
            className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            value={transport}
            onChange={(e) => onTransportChange(e.target.value as "tcp" | "serial" | "udp")}
          >
            {manifest.supportedTransports.map((t) => (
              <option key={t} value={t}>{t.toUpperCase()}</option>
            ))}
          </select>
        </label>
      )}

      {/* Simple field list */}
      <div className="space-y-3">
        {Array.from(allKeys).map((key) => {
          // Skip serial fields for tcp/udp and vice versa
          if (["path", "baudRate"].includes(key) && transport !== "serial") return null;
          if (["host", "port", "localPort"].includes(key) && transport === "serial") return null;

          const isBaudRate = key === "baudRate";
          const isSerialPort = key === "path";

          return (
            <label key={key} className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-slate-400">
                {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
              </span>
              {isSerialPort ? (
                <select
                  className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  value={draftConfig.path ?? ""}
                  onChange={(e) => handleFieldChange("path", e.target.value)}
                >
                  {serialPorts.length === 0 ? (
                    <option value="">No ports detected</option>
                  ) : (
                    serialPorts.map((port) => (
                      <option key={port.path} value={port.path}>
                        {port.path} · {port.friendlyName}
                      </option>
                    ))
                  )}
                </select>
              ) : isBaudRate ? (
                <select
                  className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  value={draftConfig.baudRate ?? ""}
                  onChange={(e) => handleFieldChange("baudRate", e.target.value)}
                >
                  {COMMON_BAUD_RATES.map((rate) => (
                    <option key={rate} value={rate}>{rate}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-500"
                  value={draftConfig[key] ?? ""}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  placeholder={String(defaultConfig[key] ?? "")}
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
