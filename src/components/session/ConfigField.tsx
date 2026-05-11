import React from "react";

interface ConfigFieldSchema {
  type: string;
  default?: string | number | boolean;
  description?: string;
  required?: boolean;
  min?: number;
  max?: number;
  enum?: Array<string | number>;
}

interface ConfigFieldProps {
  fieldKey: string;
  schema: ConfigFieldSchema;
  value: string;
  onChange: (key: string, value: string) => void;
  showDescription: boolean;
  serialPorts?: Array<{ path: string; friendlyName: string; isMappedPhysical: boolean }>;
  baudRates?: string[];
}

function getFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    host: "Host",
    port: "Port",
    localPort: "Local Port",
    bindAddress: "Bind Address",
    path: "Serial Port",
    baudRate: "Baud Rate",
    unitId: "Unit ID",
    connectTimeoutMs: "Connect Timeout (ms)",
    readTimeoutMs: "Read Timeout (ms)",
    writeTimeoutMs: "Write Timeout (ms)",
    timeoutMs: "Timeout (ms)",
    responseTimeoutMs: "Response Timeout (ms)",
    dataBits: "Data Bits",
    stopBits: "Stop Bits",
    commonAddress: "Common Address",
    originatorAddress: "Originator Address",
    giOnConnect: "GI on Connect",
    maxUnack: "Max Unack (k)",
    t1Ms: "t1 Timeout (ms)",
    t2Ms: "t2 Timeout (ms)",
    t3Ms: "t3 Timeout (ms)",
    maxRegistersPerRead: "Max Registers/Read",
    endpointUrl: "Endpoint URL",
    securityPolicy: "Security Policy",
    securityMode: "Security Mode",
    sessionTimeoutMs: "Session Timeout (ms)",
    requestedPublishingInterval: "Publishing Interval (ms)",
    defaultSendMode: "Send Mode",
    autoReconnect: "Auto Reconnect",
    deviceId: "Device ID",
    networkNumber: "Network Number",
    maxApduLength: "Max APDU Length",
    segmentationSupported: "Segmentation",
    foreignDevice: "Foreign Device",
  };
  return labels[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

export default function ConfigField({
  fieldKey,
  schema,
  value,
  onChange,
  showDescription,
  serialPorts,
  baudRates,
}: ConfigFieldProps) {
  const label = getFieldLabel(fieldKey);

  // Boolean field → checkbox
  if (schema.type === "boolean") {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value === "true"}
          onChange={(e) => onChange(fieldKey, e.target.checked ? "true" : "false")}
          className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500/30"
        />
        <span className="text-xs font-semibold text-slate-400">{label}</span>
        {showDescription && schema.description && (
          <span className="text-2xs text-slate-500 ml-1">{schema.description}</span>
        )}
      </label>
    );
  }

  // Enum field → select
  if (schema.enum && schema.enum.length > 0) {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-400">{label}</span>
        <select
          className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
        >
          {schema.enum.map((opt) => (
            <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
          ))}
        </select>
        {showDescription && schema.description && (
          <span className="text-2xs text-slate-500">{schema.description}</span>
        )}
      </label>
    );
  }

  // Serial port field → select from detected ports
  if (fieldKey === "path" && serialPorts) {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-400">{label}</span>
        <select
          className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
        >
          {serialPorts.length === 0 ? (
            <option value="">No ports detected</option>
          ) : (
            serialPorts.map((port) => (
              <option key={port.path} value={port.path}>
                {port.path} · {port.friendlyName} {port.isMappedPhysical ? "(physical)" : "(virtual)"}
              </option>
            ))
          )}
        </select>
        {showDescription && schema.description && (
          <span className="text-2xs text-slate-500">{schema.description}</span>
        )}
      </label>
    );
  }

  // Baud rate field → select
  if (fieldKey === "baudRate" && baudRates) {
    return (
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-400">{label}</span>
        <select
          className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          value={value}
          onChange={(e) => onChange(fieldKey, e.target.value)}
        >
          {baudRates.map((rate) => (
            <option key={rate} value={rate}>{rate}</option>
          ))}
        </select>
      </label>
    );
  }

  // Number or string field → input
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-400">
        {label}
        {schema.required && <span className="text-red-400 ml-1">*</span>}
      </span>
      <input
        type={schema.type === "number" ? "number" : "text"}
        className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 placeholder:text-slate-500"
        value={value}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        placeholder={schema.default !== undefined ? String(schema.default) : ""}
        min={schema.min}
        max={schema.max}
      />
      {showDescription && schema.description && (
        <span className="text-2xs text-slate-500">{schema.description}</span>
      )}
    </label>
  );
}
