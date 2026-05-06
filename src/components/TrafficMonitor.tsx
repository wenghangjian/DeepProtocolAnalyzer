import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { FixedSizeList } from "react-window";

type ViewMode = "HEX" | "BIN" | "ASCII" | "STRUCTURED";
type DirectionFilter = "all" | "tx" | "rx";

type TrafficEvent = {
  id: string;
  direction: "tx" | "rx";
  timestamp: number;
  rawBytes: Uint8Array;
  length: number;
  isError: boolean;
  protocolId?: string;
  parsedFields?: Record<string, unknown>;
};

interface StructuredField {
  label: string;
  value: string;
  offset: number;
}

/* ── shared styles ─────────────────────────────────────────────── */

const panelStyle: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  borderRadius: 16,
  overflow: "hidden",
  border: "1px solid #d7e3f4",
  background: "#f8fbff"
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "8px 12px",
  borderBottom: "1px solid #d7e3f4",
  background: "#ffffff",
  alignItems: "center",
  flexWrap: "wrap"
};

const btnBase: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid #d7e3f4",
  background: "#ffffff",
  color: "#475569",
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #93c5fd",
  background: "#e8f0ff",
  color: "#1d4ed8"
};

const inputStyle: React.CSSProperties = {
  height: 28,
  padding: "0 8px",
  borderRadius: 6,
  border: "1px solid #d7e3f4",
  fontSize: 11,
  fontFamily: "Consolas, 'SFMono-Regular', monospace",
  outline: "none",
  minWidth: 140
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  minWidth: 100
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 20,
  padding: "0 6px",
  borderRadius: 999,
  background: "#ef4444",
  color: "#ffffff",
  fontSize: 10,
  fontWeight: 700
};

const separatorStyle: React.CSSProperties = {
  width: 1,
  height: 20,
  background: "#d7e3f4",
  margin: "0 4px"
};

const copyBtnStyle: React.CSSProperties = {
  position: "absolute",
  right: 8,
  top: 4,
  height: 22,
  padding: "0 6px",
  borderRadius: 4,
  border: "1px solid #d7e3f4",
  background: "#ffffff",
  color: "#475569",
  fontSize: 10,
  fontWeight: 600,
  cursor: "pointer",
  opacity: 0,
  transition: "opacity 0.15s"
};

/* ── Modbus function code names ────────────────────────────────── */

const MODBUS_FC_NAMES: Record<number, string> = {
  0x01: "Read Coils",
  0x02: "Read Discrete Inputs",
  0x03: "Read Holding Registers",
  0x04: "Read Input Registers",
  0x05: "Write Single Coil",
  0x06: "Write Single Register",
  0x0f: "Write Multiple Coils",
  0x10: "Write Multiple Registers"
};

/* ── helpers ───────────────────────────────────────────────────── */

function toHex(bytes: Uint8Array) {
  return Array.from(bytes).map((v) => v.toString(16).padStart(2, "0")).join(" ");
}

function toBin(bytes: Uint8Array) {
  return Array.from(bytes).map((v) => v.toString(2).padStart(8, "0")).join(" ");
}

function toAscii(bytes: Uint8Array) {
  return Array.from(bytes).map((v) => (v >= 32 && v <= 126 ? String.fromCharCode(v) : ".")).join("");
}

/**
 * Compute CRC-16/Modbus (polynomial 0xA001, init 0xFFFF).
 */
function crc16Modbus(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1;
    }
  }
  return crc;
}

/**
 * Compute LRC (Longitudinal Redundancy Check) — sum of bytes mod 256, two's complement.
 */
function lrc(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) & 0xff;
  }
  return (~sum + 1) & 0xff;
}

/**
 * Attempt to decode a Modbus TCP frame (MBAP header + PDU).
 * Returns structured fields or null if not a valid Modbus TCP frame.
 */
function decodeModbusTcp(bytes: Uint8Array): StructuredField[] | null {
  // Modbus TCP minimum: 7 bytes MBAP header + 1 byte unitId + 1 byte FC = 9
  if (bytes.length < 9) return null;

  const transactionId = (bytes[0] << 8) | bytes[1];
  const protocolId = (bytes[2] << 8) | bytes[3];
  const length = (bytes[4] << 8) | bytes[5];
  const unitId = bytes[6];
  const functionCode = bytes[7];

  // Protocol ID must be 0x0000 for Modbus
  if (protocolId !== 0x0000) return null;
  // Length field should match remaining bytes
  if (length !== bytes.length - 6) return null;

  const fields: StructuredField[] = [
    { label: "Transaction ID", value: `0x${transactionId.toString(16).padStart(4, "0")}`, offset: 0 },
    { label: "Protocol ID", value: `0x${protocolId.toString(16).padStart(4, "0")} (Modbus)`, offset: 2 },
    { label: "Length", value: `${length} bytes`, offset: 4 },
    { label: "Unit ID", value: `${unitId}`, offset: 6 },
    { label: "Function Code", value: `0x${functionCode.toString(16).padStart(2, "0")} (${MODBUS_FC_NAMES[functionCode] ?? "Unknown"})`, offset: 7 }
  ];

  const isException = functionCode >= 0x80;
  if (isException) {
    const excCode = bytes.length > 8 ? bytes[8] : 0;
    fields.push({ label: "Exception Code", value: `${excCode}`, offset: 8 });
    return fields;
  }

  // Parse data based on function code
  if (functionCode <= 0x04 && bytes.length > 9) {
    const byteCount = bytes[8];
    fields.push({ label: "Byte Count", value: `${byteCount}`, offset: 8 });
    if (functionCode <= 0x02) {
      // Bit-packed data
      const bitData = bytes.slice(9, 9 + byteCount);
      fields.push({ label: "Bit Data", value: toHex(bitData), offset: 9 });
    } else {
      // Register data
      const regData = bytes.slice(9, 9 + byteCount);
      const registers: number[] = [];
      for (let i = 0; i + 1 < regData.length; i += 2) {
        registers.push((regData[i] << 8) | regData[i + 1]);
      }
      fields.push({ label: "Registers", value: `[${registers.join(", ")}]`, offset: 9 });
    }
  } else if ((functionCode === 0x05 || functionCode === 0x06) && bytes.length >= 12) {
    const address = (bytes[8] << 8) | bytes[9];
    const value = (bytes[10] << 8) | bytes[11];
    fields.push({ label: "Address", value: `${address}`, offset: 8 });
    fields.push({ label: "Value", value: `0x${value.toString(16).padStart(4, "0")} (${value})`, offset: 10 });
  } else if ((functionCode === 0x0f || functionCode === 0x10) && bytes.length >= 12) {
    const address = (bytes[8] << 8) | bytes[9];
    const quantity = (bytes[10] << 8) | bytes[11];
    fields.push({ label: "Address", value: `${address}`, offset: 8 });
    fields.push({ label: "Quantity", value: `${quantity}`, offset: 10 });
    if (bytes.length > 12) {
      const byteCount = bytes[12];
      fields.push({ label: "Byte Count", value: `${byteCount}`, offset: 12 });
      if (bytes.length > 13) {
        const data = bytes.slice(13, 13 + byteCount);
        fields.push({ label: "Data", value: toHex(data), offset: 13 });
      }
    }
  }

  return fields;
}

/**
 * Attempt to decode a Modbus RTU frame (Unit ID + PDU + CRC16).
 */
function decodeModbusRtu(bytes: Uint8Array): StructuredField[] | null {
  // Modbus RTU minimum: 1 unitId + 1 FC + 2 CRC = 4
  if (bytes.length < 4) return null;

  const unitId = bytes[0];
  const functionCode = bytes[1];

  // Validate CRC
  const frameCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
  const computedCrc = crc16Modbus(bytes.slice(0, bytes.length - 2));
  const crcValid = frameCrc === computedCrc;

  const fields: StructuredField[] = [
    { label: "Unit ID", value: `${unitId}`, offset: 0 },
    { label: "Function Code", value: `0x${functionCode.toString(16).padStart(2, "0")} (${MODBUS_FC_NAMES[functionCode] ?? "Unknown"})`, offset: 1 },
    { label: "CRC-16", value: `0x${frameCrc.toString(16).padStart(4, "0")} ${crcValid ? "✓ Valid" : "✗ Invalid"}`, offset: bytes.length - 2 }
  ];

  const isException = functionCode >= 0x80;
  if (isException) {
    const excCode = bytes.length > 2 ? bytes[2] : 0;
    fields.push({ label: "Exception Code", value: `${excCode}`, offset: 2 });
    return fields;
  }

  // Parse data based on function code
  if (functionCode <= 0x04 && bytes.length > 3) {
    const byteCount = bytes[2];
    fields.push({ label: "Byte Count", value: `${byteCount}`, offset: 2 });
    if (functionCode <= 0x02) {
      const bitData = bytes.slice(3, 3 + byteCount);
      fields.push({ label: "Bit Data", value: toHex(bitData), offset: 3 });
    } else {
      const regData = bytes.slice(3, 3 + byteCount);
      const registers: number[] = [];
      for (let i = 0; i + 1 < regData.length; i += 2) {
        registers.push((regData[i] << 8) | regData[i + 1]);
      }
      fields.push({ label: "Registers", value: `[${registers.join(", ")}]`, offset: 3 });
    }
  } else if ((functionCode === 0x05 || functionCode === 0x06) && bytes.length >= 8) {
    const address = (bytes[2] << 8) | bytes[3];
    const value = (bytes[4] << 8) | bytes[5];
    fields.push({ label: "Address", value: `${address}`, offset: 2 });
    fields.push({ label: "Value", value: `0x${value.toString(16).padStart(4, "0")} (${value})`, offset: 4 });
  } else if ((functionCode === 0x0f || functionCode === 0x10) && bytes.length >= 9) {
    const address = (bytes[2] << 8) | bytes[3];
    const quantity = (bytes[4] << 8) | bytes[5];
    const byteCount = bytes[6];
    fields.push({ label: "Address", value: `${address}`, offset: 2 });
    fields.push({ label: "Quantity", value: `${quantity}`, offset: 4 });
    fields.push({ label: "Byte Count", value: `${byteCount}`, offset: 6 });
    if (bytes.length > 7) {
      const data = bytes.slice(7, 7 + byteCount);
      fields.push({ label: "Data", value: toHex(data), offset: 7 });
    }
  }

  return fields;
}

/**
 * Decode raw frame with CRC/LRC annotations.
 */
function decodeRawWithChecksum(bytes: Uint8Array): StructuredField[] {
  const fields: StructuredField[] = [];

  if (bytes.length === 0) {
    fields.push({ label: "Info", value: "Empty frame", offset: 0 });
    return fields;
  }

  fields.push({ label: "Length", value: `${bytes.length} bytes`, offset: 0 });
  fields.push({ label: "Hex", value: toHex(bytes), offset: 0 });

  // Try CRC-16 (last 2 bytes)
  if (bytes.length >= 3) {
    const frameCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
    const computedCrc = crc16Modbus(bytes.slice(0, bytes.length - 2));
    fields.push({
      label: "CRC-16 (Modbus)",
      value: `Frame: 0x${frameCrc.toString(16).padStart(4, "0")} | Computed: 0x${computedCrc.toString(16).padStart(4, "0")} ${frameCrc === computedCrc ? "✓ Match" : "✗ Mismatch"}`,
      offset: bytes.length - 2
    });
  }

  // Try LRC (last byte)
  if (bytes.length >= 2) {
    const frameLrc = bytes[bytes.length - 1];
    const computedLrc = lrc(bytes.slice(0, bytes.length - 1));
    fields.push({
      label: "LRC",
      value: `Frame: 0x${frameLrc.toString(16).padStart(2, "0")} | Computed: 0x${computedLrc.toString(16).padStart(2, "0")} ${frameLrc === computedLrc ? "✓ Match" : "✗ Mismatch"}`,
      offset: bytes.length - 1
    });
  }

  return fields;
}

/**
 * Main structured decoder: tries Modbus TCP, Modbus RTU, then raw with checksums.
 */
function decodeStructured(item: TrafficEvent): StructuredField[] {
  const bytes = item.rawBytes;
  const protocolId = item.protocolId?.toLowerCase() ?? "";

  // If we have parsedFields from the protocol engine, use them first
  if (item.parsedFields && Object.keys(item.parsedFields).length > 0) {
    const fields: StructuredField[] = [];
    let offset = 0;
    for (const [key, val] of Object.entries(item.parsedFields)) {
      const displayVal = typeof val === "object" ? JSON.stringify(val) : String(val);
      fields.push({ label: key, value: displayVal, offset });
      offset++;
    }
    // Also show raw hex at the end
    fields.push({ label: "Raw Hex", value: toHex(bytes), offset: 0 });
    return fields;
  }

  // Try protocol-specific decoding
  if (protocolId.includes("modbus-tcp")) {
    const result = decodeModbusTcp(bytes);
    if (result) return result;
  }

  if (protocolId.includes("modbus-rtu")) {
    const result = decodeModbusRtu(bytes);
    if (result) return result;
  }

  // Try Modbus TCP heuristic (protocol ID 0x0000)
  if (bytes.length >= 9) {
    const protoId = (bytes[2] << 8) | bytes[3];
    if (protoId === 0x0000) {
      const result = decodeModbusTcp(bytes);
      if (result) return result;
    }
  }

  // Try Modbus RTU heuristic (valid CRC)
  if (bytes.length >= 4) {
    const frameCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
    const computedCrc = crc16Modbus(bytes.slice(0, bytes.length - 2));
    if (frameCrc === computedCrc) {
      const result = decodeModbusRtu(bytes);
      if (result) return result;
    }
  }

  // Fallback: raw with checksum annotations
  return decodeRawWithChecksum(bytes);
}

function matchesSearch(item: TrafficEvent, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  // search hex bytes
  if (toHex(item.rawBytes).toLowerCase().includes(q)) return true;
  // search direction
  if (item.direction.toLowerCase().includes(q)) return true;
  // search parsed fields
  if (item.parsedFields) {
    for (const val of Object.values(item.parsedFields)) {
      if (String(val).toLowerCase().includes(q)) return true;
    }
  }
  return false;
}

/* ── Keyboard shortcut label map ───────────────────────────────── */

const VIEW_MODE_SHORTCUTS: Record<ViewMode, string> = {
  HEX: "H",
  BIN: "B",
  ASCII: "A",
  STRUCTURED: "S"
};

/* ── component ─────────────────────────────────────────────────── */

export default function TrafficMonitor({ traffic }: { traffic: TrafficEvent[] }) {
  const [mode, setMode] = useState<ViewMode>("HEX");
  const [searchQuery, setSearchQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [protocolFilter, setProtocolFilter] = useState<string>("all");
  const [paused, setPaused] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const listRef = useRef<FixedSizeList>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const pausedCountRef = useRef(0);
  const [pausedCount, setPausedCount] = useState(0);

  /* ── keyboard shortcuts ──────────────────────────────────────── */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      switch (e.key.toLowerCase()) {
        case "h":
          setMode("HEX");
          break;
        case "b":
          setMode("BIN");
          break;
        case "a":
          setMode("ASCII");
          break;
        case "s":
          setMode("STRUCTURED");
          break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  /* ── derived: unique protocols ──────────────────────────────── */

  const protocols = useMemo(() => {
    const set = new Set<string>();
    for (const t of traffic) {
      if (t.protocolId) set.add(t.protocolId);
    }
    return Array.from(set).sort();
  }, [traffic]);

  /* ── filtered list ──────────────────────────────────────────── */

  const filtered = useMemo(() => {
    return traffic.filter((item) => {
      if (directionFilter !== "all" && item.direction !== directionFilter) return false;
      if (errorsOnly && !item.isError) return false;
      if (protocolFilter !== "all" && item.protocolId !== protocolFilter) return false;
      if (!matchesSearch(item, searchQuery)) return false;
      return true;
    });
  }, [traffic, directionFilter, errorsOnly, protocolFilter, searchQuery]);

  /* ── auto-scroll & pause tracking ───────────────────────────── */

  const prevFilteredLen = useRef(filtered.length);

  useEffect(() => {
    if (paused) {
      // count new items that arrived while paused
      const delta = filtered.length - prevFilteredLen.current;
      if (delta > 0) {
        pausedCountRef.current += delta;
        setPausedCount(pausedCountRef.current);
      }
    } else {
      // resumed → scroll to bottom & reset count
      pausedCountRef.current = 0;
      setPausedCount(0);
      if (listRef.current && filtered.length > 0) {
        listRef.current.scrollToItem(filtered.length - 1, "end");
      }
    }
    prevFilteredLen.current = filtered.length;
  }, [filtered.length, paused]);

  /* ── close export dropdown on outside click ─────────────────── */

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  /* ── copy to clipboard ──────────────────────────────────────── */

  const handleCopy = useCallback((item: TrafficEvent) => {
    const hex = toHex(item.rawBytes);
    navigator.clipboard.writeText(hex).then(() => {
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }, []);

  /* ── export helpers ─────────────────────────────────────────── */

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const exportTxt = useCallback(() => {
    const lines = filtered.map((item) => {
      const ts = new Date(item.timestamp).toISOString();
      const dir = item.direction.toUpperCase();
      const hex = toHex(item.rawBytes);
      const err = item.isError ? " [ERROR]" : "";
      return `[${ts}] ${dir} ${item.length}B${err}: ${hex}`;
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    downloadBlob(blob, `traffic-export-${Date.now()}.txt`);
    setExportOpen(false);
  }, [filtered, downloadBlob]);

  const exportBin = useCallback(() => {
    // concatenate all raw bytes with a simple header per frame:
    // [4-byte length LE][raw bytes]
    const parts: Uint8Array[] = [];
    for (const item of filtered) {
      const header = new ArrayBuffer(4);
      new DataView(header).setUint32(0, item.rawBytes.length, true);
      parts.push(new Uint8Array(header));
      parts.push(item.rawBytes);
    }
    const totalLen = parts.reduce((s, p) => s + p.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const p of parts) {
      result.set(p, offset);
      offset += p.length;
    }
    const blob = new Blob([result], { type: "application/octet-stream" });
    downloadBlob(blob, `traffic-export-${Date.now()}.bin`);
    setExportOpen(false);
  }, [filtered, downloadBlob]);

  /* ── row renderer ───────────────────────────────────────────── */

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const item = filtered[index];
      if (!item) return null;
      const accent = item.direction === "tx" ? "#2563eb" : "#0f766e";

      // ── HEX view ──────────────────────────────────────────────
      if (mode === "HEX") {
        const content = toHex(item.rawBytes);
        return (
          <div
            style={{
              ...style,
              padding: "6px 12px",
              paddingRight: 60,
              borderLeft: `4px solid ${accent}`,
              background: item.isError ? "#fff1f2" : index % 2 === 0 ? "#ffffff" : "#f8fbff",
              fontFamily: "Consolas, 'SFMono-Regular', monospace",
              fontSize: 11,
              color: "#1e293b",
              position: "relative",
              lineHeight: "22px"
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget.querySelector<HTMLButtonElement>("[data-copy]");
              if (btn) btn.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget.querySelector<HTMLButtonElement>("[data-copy]");
              if (btn) btn.style.opacity = "0";
            }}
          >
            <span style={{ color: "#64748b" }}>
              [{new Date(item.timestamp).toLocaleTimeString()}]
            </span>{" "}
            {item.direction.toUpperCase()} {item.length}B: {content}
            <button
              data-copy
              type="button"
              onClick={() => handleCopy(item)}
              style={copyBtnStyle}
              title="Copy hex to clipboard"
            >
              {copiedId === item.id ? "✓ Copied" : "Copy"}
            </button>
          </div>
        );
      }

      // ── BIN view ──────────────────────────────────────────────
      if (mode === "BIN") {
        const bytes = Array.from(item.rawBytes);
        return (
          <div
            style={{
              ...style,
              padding: "6px 12px",
              paddingRight: 60,
              borderLeft: `4px solid ${accent}`,
              background: item.isError ? "#fff1f2" : index % 2 === 0 ? "#ffffff" : "#f8fbff",
              fontFamily: "Consolas, 'SFMono-Regular', monospace",
              fontSize: 11,
              color: "#1e293b",
              position: "relative",
              lineHeight: "22px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget.querySelector<HTMLButtonElement>("[data-copy]");
              if (btn) btn.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget.querySelector<HTMLButtonElement>("[data-copy]");
              if (btn) btn.style.opacity = "0";
            }}
          >
            <span style={{ color: "#64748b" }}>
              [{new Date(item.timestamp).toLocaleTimeString()}]
            </span>{" "}
            {item.direction.toUpperCase()} {item.length}B:{" "}
            {bytes.map((v, i) => {
              const bin = v.toString(2).padStart(8, "0");
              return (
                <span key={i} style={{ marginRight: 4 }}>
                  <span style={{ color: "#6366f1" }}>{bin.slice(0, 4)}</span>
                  <span style={{ color: "#0891b2" }}>{bin.slice(4)}</span>
                </span>
              );
            })}
            <button
              data-copy
              type="button"
              onClick={() => handleCopy(item)}
              style={copyBtnStyle}
              title="Copy hex to clipboard"
            >
              {copiedId === item.id ? "✓ Copied" : "Copy"}
            </button>
          </div>
        );
      }

      // ── ASCII view (hex editor style: hex | ascii side-by-side) ─
      if (mode === "ASCII") {
        const bytes = Array.from(item.rawBytes);
        // Build hex columns (16 bytes per row)
        const ROW_SIZE = 16;
        const rows: Array<{ hex: string[]; ascii: string[] }> = [];
        for (let r = 0; r < bytes.length; r += ROW_SIZE) {
          const slice = bytes.slice(r, r + ROW_SIZE);
          rows.push({
            hex: slice.map((v) => v.toString(16).padStart(2, "0")),
            ascii: slice.map((v) => (v >= 0x20 && v <= 0x7e ? String.fromCharCode(v) : "."))
          });
        }

        return (
          <div
            style={{
              ...style,
              padding: "6px 12px",
              paddingRight: 60,
              borderLeft: `4px solid ${accent}`,
              background: item.isError ? "#fff1f2" : index % 2 === 0 ? "#ffffff" : "#f8fbff",
              fontFamily: "Consolas, 'SFMono-Regular', monospace",
              fontSize: 11,
              color: "#1e293b",
              position: "relative",
              lineHeight: "18px"
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget.querySelector<HTMLButtonElement>("[data-copy]");
              if (btn) btn.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget.querySelector<HTMLButtonElement>("[data-copy]");
              if (btn) btn.style.opacity = "0";
            }}
          >
            <span style={{ color: "#64748b" }}>
              [{new Date(item.timestamp).toLocaleTimeString()}]
            </span>{" "}
            {item.direction.toUpperCase()} {item.length}B
            {rows.map((row, ri) => (
              <div key={ri} style={{ display: "flex", gap: 12 }}>
                {/* Offset */}
                <span style={{ color: "#94a3b8", minWidth: 40, textAlign: "right" }}>
                  {(ri * ROW_SIZE).toString(16).padStart(4, "0")}
                </span>
                {/* Hex bytes */}
                <span style={{ minWidth: ROW_SIZE * 24 }}>
                  {row.hex.map((h, hi) => (
                    <span key={hi} style={{ marginRight: 4, color: "#475569" }}>{h}</span>
                  ))}
                  {/* Pad if last row is short */}
                  {row.hex.length < ROW_SIZE && (
                    <span style={{ color: "#cbd5e1" }}>
                      {"   ".repeat(ROW_SIZE - row.hex.length)}
                    </span>
                  )}
                </span>
                {/* ASCII */}
                <span>
                  {row.ascii.map((ch, ci) => (
                    <span
                      key={ci}
                      style={{
                        color: ch === "." ? "#cbd5e1" : "#0f766e",
                        fontWeight: ch === "." ? 400 : 600
                      }}
                    >
                      {ch}
                    </span>
                  ))}
                </span>
              </div>
            ))}
            <button
              data-copy
              type="button"
              onClick={() => handleCopy(item)}
              style={copyBtnStyle}
              title="Copy hex to clipboard"
            >
              {copiedId === item.id ? "✓ Copied" : "Copy"}
            </button>
          </div>
        );
      }

      // ── STRUCTURED view ───────────────────────────────────────
      const fields = decodeStructured(item);
      return (
        <div
          style={{
            ...style,
            padding: "6px 12px",
            paddingRight: 60,
            borderLeft: `4px solid ${accent}`,
            background: item.isError ? "#fff1f2" : index % 2 === 0 ? "#ffffff" : "#f8fbff",
            fontFamily: "Consolas, 'SFMono-Regular', monospace",
            fontSize: 11,
            color: "#1e293b",
            position: "relative",
            lineHeight: "18px"
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget.querySelector<HTMLButtonElement>("[data-copy]");
            if (btn) btn.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget.querySelector<HTMLButtonElement>("[data-copy]");
            if (btn) btn.style.opacity = "0";
          }}
        >
          <span style={{ color: "#64748b" }}>
            [{new Date(item.timestamp).toLocaleTimeString()}]
          </span>{" "}
          {item.direction.toUpperCase()} {item.length}B
          <div style={{ marginTop: 2 }}>
            {fields.map((field, fi) => (
              <span key={fi} style={{ marginRight: 12 }}>
                <span style={{ color: "#6366f1", fontWeight: 600 }}>{field.label}:</span>{" "}
                <span style={{ color: "#0f172a" }}>{field.value}</span>
              </span>
            ))}
          </div>
          <button
            data-copy
            type="button"
            onClick={() => handleCopy(item)}
            style={copyBtnStyle}
            title="Copy hex to clipboard"
          >
            {copiedId === item.id ? "✓ Copied" : "Copy"}
          </button>
        </div>
      );
    },
    [filtered, mode, copiedId, handleCopy]
  );

  /* ── render ─────────────────────────────────────────────────── */

  return (
    <div style={panelStyle} data-testid="traffic-monitor" role="region" aria-label="Traffic monitor">
      {/* ── Filter toolbar ────────────────────────────────────── */}
      <div style={toolbarStyle} role="toolbar" aria-label="Traffic filter controls">
        {/* text search */}
        <input
          type="text"
          data-testid="traffic-search"
          aria-label="Search traffic by hex, direction, or fields"
          placeholder="Search hex / direction / fields…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 160px", maxWidth: 260 }}
        />

        {/* direction filter */}
        <select
          data-testid="traffic-direction-filter"
          aria-label="Filter traffic by direction"
          value={directionFilter}
          onChange={(e) => setDirectionFilter(e.target.value as DirectionFilter)}
          style={selectStyle}
        >
          <option value="all">All Dir</option>
          <option value="tx">TX Only</option>
          <option value="rx">RX Only</option>
        </select>

        {/* error toggle */}
        <button
          type="button"
          data-testid="traffic-errors-toggle"
          aria-label={errorsOnly ? "Show all frames" : "Show errors only"}
          aria-pressed={errorsOnly}
          onClick={() => setErrorsOnly((v) => !v)}
          style={errorsOnly ? btnActive : btnBase}
          title="Toggle errors-only filter"
        >
          {errorsOnly ? "⚠ Errors Only" : "All Frames"}
        </button>

        {/* protocol filter (only shown when multiple protocols exist) */}
        {protocols.length > 1 && (
          <select
            value={protocolFilter}
            aria-label="Filter traffic by protocol"
            onChange={(e) => setProtocolFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="all">All Protocols</option>
            {protocols.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}

        <div style={separatorStyle} />

        {/* view mode buttons with keyboard shortcut hints */}
        {(["HEX", "BIN", "ASCII", "STRUCTURED"] as ViewMode[]).map((item) => (
          <button
            key={item}
            type="button"
            data-testid={`view-mode-${item.toLowerCase()}`}
            aria-label={`Switch to ${item} view`}
            aria-pressed={mode === item}
            onClick={() => setMode(item)}
            style={mode === item ? btnActive : btnBase}
            title={`Switch to ${item} view (${VIEW_MODE_SHORTCUTS[item]})`}
          >
            {item}
            <span
              style={{
                marginLeft: 4,
                fontSize: 9,
                opacity: 0.5,
                fontWeight: 400
              }}
            >
              {VIEW_MODE_SHORTCUTS[item]}
            </span>
          </button>
        ))}

        <div style={separatorStyle} />

        {/* pause / resume */}
        <button
          type="button"
          data-testid="traffic-pause"
          aria-label={paused ? "Resume traffic capture" : "Pause traffic capture"}
          aria-pressed={paused}
          onClick={() => setPaused((v) => !v)}
          style={{
            ...(paused ? { ...btnBase, background: "#fef3c7", borderColor: "#f59e0b", color: "#92400e" } : btnBase),
            position: "relative"
          }}
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
          {paused && pausedCount > 0 && (
            <span style={{ ...badgeStyle, marginLeft: 6 }}>{pausedCount}</span>
          )}
        </button>

        {/* export dropdown */}
        <div ref={exportRef} style={{ position: "relative" }}>
          <button
            type="button"
            data-testid="traffic-export"
            onClick={() => setExportOpen((v) => !v)}
            style={btnBase}
          >
            ⬇ Export
          </button>
          {exportOpen && (
            <div
              data-testid="traffic-export-menu"
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 4,
                background: "#ffffff",
                border: "1px solid #d7e3f4",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                zIndex: 10,
                minWidth: 160,
                overflow: "hidden"
              }}
            >
              <button
                type="button"
                data-testid="export-txt"
                onClick={exportTxt}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  fontSize: 12,
                  cursor: "pointer",
                  color: "#1e293b"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                📄 Export as .txt (hex dump)
              </button>
              <button
                type="button"
                data-testid="export-bin"
                onClick={exportBin}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  background: "transparent",
                  textAlign: "left",
                  fontSize: 12,
                  cursor: "pointer",
                  color: "#1e293b"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                💾 Export as .bin (raw bytes)
              </button>
            </div>
          )}
        </div>

        <div style={separatorStyle} />

        {/* frame counts */}
        <span data-testid="traffic-frame-count" style={{ fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>
          {filtered.length === traffic.length
            ? `${traffic.length} frames`
            : `${filtered.length} / ${traffic.length} frames`}
        </span>
      </div>

      {/* ── Virtual list ──────────────────────────────────────── */}
      <div role="log" aria-label="Traffic event list" aria-live="polite">
        <FixedSizeList
          ref={listRef}
          height={280}
          itemCount={filtered.length}
          itemSize={mode === "ASCII" || mode === "STRUCTURED" ? 56 : 34}
          width="100%"
        >
          {Row}
        </FixedSizeList>
      </div>
    </div>
  );
}
