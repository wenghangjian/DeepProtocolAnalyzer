import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { FixedSizeList } from "react-window";
import { AlertTriangle, Play, Pause, Download, FileText, Save, Check, Copy } from "lucide-react";
import { toHex, toBin, toAscii, decodeStructured, matchesSearch } from "../lib/traffic-decoders";
import type { TrafficEvent } from "../lib/traffic-decoders";

type ViewMode = "HEX" | "BIN" | "ASCII" | "STRUCTURED";
type DirectionFilter = "all" | "tx" | "rx";

/* ── Keyboard shortcut label map ───────────────────────────────── */

const VIEW_MODE_SHORTCUTS: Record<ViewMode, string> = {
  HEX: "H",
  BIN: "B",
  ASCII: "A",
  STRUCTURED: "S"
};

/* ── shared styles ─────────────────────────────────────────────── */

const panelStyle: React.CSSProperties = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  borderRadius: 16,
  overflow: "hidden",
  border: "1px solid rgba(51, 65, 85, 0.5)",
  background: "#1e293b"
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "8px 12px",
  borderBottom: "1px solid rgba(51, 65, 85, 0.5)",
  background: "#0f172a",
  alignItems: "center",
  flexWrap: "wrap"
};

const btnBase: React.CSSProperties = {
  height: 28,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid rgba(51, 65, 85, 0.5)",
  background: "#0f172a",
  color: "#94a3b8",
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const btnActive: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #3b82f6",
  background: "rgba(59, 130, 246, 0.15)",
  color: "#93c5fd"
};

const inputStyle: React.CSSProperties = {
  height: 28,
  padding: "0 8px",
  borderRadius: 6,
  border: "1px solid rgba(51, 65, 85, 0.5)",
  background: "#0f172a",
  color: "#e2e8f0",
  fontSize: 11,
  fontFamily: "'JetBrains Mono', 'SFMono-Regular', monospace",
  outline: "none",
  minWidth: 140
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  minWidth: 100,
  appearance: "none" as const
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
  background: "rgba(51, 65, 85, 0.5)",
  margin: "0 4px"
};

const copyBtnStyle: React.CSSProperties = {
  position: "absolute",
  right: 8,
  top: 4,
  height: 22,
  padding: "0 6px",
  borderRadius: 4,
  border: "1px solid rgba(51, 65, 85, 0.5)",
  background: "#1e293b",
  color: "#94a3b8",
  fontSize: 10,
  fontWeight: 600,
  cursor: "pointer",
  opacity: 0,
  transition: "opacity 0.15s"
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
              background: item.isError ? "rgba(239, 68, 68, 0.15)" : index % 2 === 0 ? "#1e293b" : "#0f172a",
              fontFamily: "'JetBrains Mono', 'SFMono-Regular', monospace",
              fontSize: 11,
              color: "#e2e8f0",
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
              {copiedId === item.id ? <span className="flex items-center gap-1"><Check size={10} /> Copied</span> : <span className="flex items-center gap-1"><Copy size={10} /> Copy</span>}
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
              background: item.isError ? "rgba(239, 68, 68, 0.15)" : index % 2 === 0 ? "#1e293b" : "#0f172a",
              fontFamily: "'JetBrains Mono', 'SFMono-Regular', monospace",
              fontSize: 11,
              color: "#e2e8f0",
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
                  <span style={{ color: "#818cf8" }}>{bin.slice(0, 4)}</span>
                  <span style={{ color: "#22d3ee" }}>{bin.slice(4)}</span>
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
              {copiedId === item.id ? <span className="flex items-center gap-1"><Check size={10} /> Copied</span> : <span className="flex items-center gap-1"><Copy size={10} /> Copy</span>}
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
              background: item.isError ? "rgba(239, 68, 68, 0.15)" : index % 2 === 0 ? "#1e293b" : "#0f172a",
              fontFamily: "'JetBrains Mono', 'SFMono-Regular', monospace",
              fontSize: 11,
              color: "#e2e8f0",
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
                    <span key={hi} style={{ marginRight: 4, color: "#94a3b8" }}>{h}</span>
                  ))}
                  {/* Pad if last row is short */}
                  {row.hex.length < ROW_SIZE && (
                    <span style={{ color: "rgba(51, 65, 85, 0.5)" }}>
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
                        color: ch === "." ? "rgba(51, 65, 85, 0.5)" : "#2dd4bf",
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
              {copiedId === item.id ? <span className="flex items-center gap-1"><Check size={10} /> Copied</span> : <span className="flex items-center gap-1"><Copy size={10} /> Copy</span>}
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
            background: item.isError ? "rgba(239, 68, 68, 0.15)" : index % 2 === 0 ? "#1e293b" : "#0f172a",
            fontFamily: "'JetBrains Mono', 'SFMono-Regular', monospace",
            fontSize: 11,
            color: "#e2e8f0",
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
                <span style={{ color: "#818cf8", fontWeight: 600 }}>{field.label}:</span>{" "}
                <span style={{ color: "#e2e8f0" }}>{field.value}</span>
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
          {errorsOnly ? <span className="flex items-center gap-1"><AlertTriangle size={12} /> Errors Only</span> : "All Frames"}
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
            ...(paused ? { ...btnBase, background: "rgba(245, 158, 11, 0.15)", borderColor: "#f59e0b", color: "#fbbf24" } : btnBase),
            position: "relative"
          }}
        >
          {paused ? <span className="flex items-center gap-1"><Play size={12} /> Resume</span> : <span className="flex items-center gap-1"><Pause size={12} /> Pause</span>}
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
            <span className="flex items-center gap-1"><Download size={12} /> Export</span>
          </button>
          {exportOpen && (
            <div
              data-testid="traffic-export-menu"
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 4,
                background: "#1e293b",
                border: "1px solid rgba(51, 65, 85, 0.5)",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
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
                  color: "#e2e8f0"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#334155")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span className="flex items-center gap-2"><FileText size={14} /> Export as .txt (hex dump)</span>
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
                  color: "#e2e8f0"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#334155")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span className="flex items-center gap-2"><Save size={14} /> Export as .bin (raw bytes)</span>
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
