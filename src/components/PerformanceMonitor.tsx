import { useCallback, useEffect, useRef, useState } from "react";
import { Zap, BarChart3, Rocket, ClipboardList, X, CheckCircle, XCircle, ShieldCheck } from "lucide-react";
import type {
  ThroughputResult,
  MemoryResult,
  ConcurrencyResult,
  SystemMetrics,
  SpecValidation
} from "../../packages/benchmark";

interface BenchmarkHistoryEntry {
  id: string;
  type: "throughput" | "memory" | "concurrency";
  timestamp: number;
  result: ThroughputResult | MemoryResult | ConcurrencyResult;
  validation?: SpecValidation;
}

interface PerformanceMonitorProps {
  isOpen: boolean;
  onClose: () => void;
  onBanner: (message: string) => void;
}

const panelStyles = `
  .perf-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(6px);
  }
  .perf-panel {
    width: 960px;
    max-height: 90vh;
    overflow-y: auto;
    border-radius: 22px;
    background: #1e293b;
    border: 1px solid rgba(51, 65, 85, 0.5);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
    padding: 28px;
  }
  .perf-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .perf-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #e2e8f0;
  }
  .perf-close {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid rgba(51, 65, 85, 0.5);
    background: #0f172a;
    color: #94a3b8;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .perf-close:hover {
    background: #334155;
  }
  .perf-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 20px;
  }
  .perf-card {
    padding: 16px;
    border-radius: 16px;
    border: 1px solid rgba(51, 65, 85, 0.5);
    background: #0f172a;
  }
  .perf-card h3 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 700;
    color: #e2e8f0;
  }
  .perf-metric {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    font-size: 13px;
  }
  .perf-metric-label {
    color: #94a3b8;
  }
  .perf-metric-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: #e2e8f0;
  }
  .perf-pass {
    color: #4ade80;
  }
  .perf-fail {
    color: #f87171;
  }
  .perf-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }
  .perf-badge-pass {
    background: rgba(22, 163, 74, 0.15);
    color: #4ade80;
  }
  .perf-badge-fail {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
  }
  .perf-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 20px;
  }
  .perf-btn {
    height: 38px;
    padding: 0 16px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, #2563eb 0%, #0f766e 100%);
    color: #fff;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    transition: opacity 120ms;
  }
  .perf-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .perf-btn.secondary {
    background: rgba(59, 130, 246, 0.15);
    color: #93c5fd;
  }
  .perf-btn.ghost {
    background: #0f172a;
    color: #94a3b8;
    border: 1px solid rgba(51, 65, 85, 0.5);
  }
  .perf-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .perf-table th {
    text-align: left;
    padding: 8px 10px;
    border-bottom: 2px solid rgba(51, 65, 85, 0.5);
    color: #64748b;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .perf-table td {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(51, 65, 85, 0.3);
    color: #e2e8f0;
    font-variant-numeric: tabular-nums;
  }
  .perf-table tr:hover td {
    background: rgba(51, 65, 85, 0.3);
  }
  .perf-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(51, 65, 85, 0.5);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: perf-spin 0.6s linear infinite;
  }
  @keyframes perf-spin {
    to { transform: rotate(360deg); }
  }
  .perf-input {
    width: 80px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid rgba(51, 65, 85, 0.5);
    background: #1e293b;
    color: #e2e8f0;
    font-size: 12px;
    text-align: center;
  }
  .perf-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
  }
  .perf-param-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #94a3b8;
  }
  .perf-param-row label {
    min-width: 100px;
  }
`;

export default function PerformanceMonitor({ isOpen, onClose, onBanner }: PerformanceMonitorProps) {
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [systemValidation, setSystemValidation] = useState<SpecValidation | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [history, setHistory] = useState<BenchmarkHistoryEntry[]>([]);

  // Benchmark parameters
  const [throughputDuration, setThroughputDuration] = useState(10);
  const [throughputTarget, setThroughputTarget] = useState(500);
  const [memoryDuration, setMemoryDuration] = useState(30);
  const [concurrencySessions, setConcurrencySessions] = useState(20);
  const [concurrencyDuration, setConcurrencyDuration] = useState(15);

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshSystemMetrics = useCallback(async () => {
    try {
      const response = await window.benchmarkApi.system();
      if (response.success && response.metrics) {
        setSystemMetrics(response.metrics);
        setSystemValidation(response.validation ?? null);
      }
    } catch {
      // Silently fail on metric refresh
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    void refreshSystemMetrics();
    refreshTimerRef.current = setInterval(() => {
      void refreshSystemMetrics();
    }, 2000);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [isOpen, refreshSystemMetrics]);

  if (!isOpen) return null;

  async function runThroughputBenchmark() {
    setRunning("throughput");
    try {
      const response = await window.benchmarkApi.throughput({
        durationMs: throughputDuration * 1000,
        targetMsgPerSec: throughputTarget,
        messageSize: 100,
        concurrent: 1
      });

      if (response.success && response.result) {
        const entry: BenchmarkHistoryEntry = {
          id: `tp-${Date.now()}`,
          type: "throughput",
          timestamp: Date.now(),
          result: response.result
        };
        setHistory((prev) => [entry, ...prev].slice(0, 50));
        onBanner(`Throughput: ${response.result.messagesPerSecond.toFixed(1)} msg/sec`);
      } else {
        onBanner(`Throughput benchmark failed: ${response.error}`);
      }
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Throughput benchmark error");
    } finally {
      setRunning(null);
    }
  }

  async function runMemoryBenchmark() {
    setRunning("memory");
    try {
      const response = await window.benchmarkApi.memory({
        durationMs: memoryDuration * 1000,
        sampleIntervalMs: 1000
      });

      if (response.success && response.result) {
        const entry: BenchmarkHistoryEntry = {
          id: `mem-${Date.now()}`,
          type: "memory",
          timestamp: Date.now(),
          result: response.result
        };
        setHistory((prev) => [entry, ...prev].slice(0, 50));
        onBanner(`Memory: Δ${response.result.deltaHeapMB.toFixed(2)} MB over ${(response.result.durationMs / 1000).toFixed(0)}s`);
      } else {
        onBanner(`Memory benchmark failed: ${response.error}`);
      }
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Memory benchmark error");
    } finally {
      setRunning(null);
    }
  }

  async function runConcurrencyBenchmark() {
    setRunning("concurrency");
    try {
      const response = await window.benchmarkApi.concurrency({
        sessionCount: concurrencySessions,
        durationMs: concurrencyDuration * 1000,
        targetMsgPerSec: 500
      });

      if (response.success && response.result) {
        const entry: BenchmarkHistoryEntry = {
          id: `con-${Date.now()}`,
          type: "concurrency",
          timestamp: Date.now(),
          result: response.result
        };
        setHistory((prev) => [entry, ...prev].slice(0, 50));
        onBanner(`Concurrency: ${response.result.sessionCount} sessions, ${response.result.avgMessagesPerSec.toFixed(1)} msg/sec avg`);
      } else {
        onBanner(`Concurrency benchmark failed: ${response.error}`);
      }
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Concurrency benchmark error");
    } finally {
      setRunning(null);
    }
  }

  function formatTimestamp(ts: number) {
    return new Date(ts).toLocaleTimeString();
  }

  return (
    <>
      <style>{panelStyles}</style>
      <div className="perf-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Performance Benchmark" data-testid="performance-panel">
        <div className="perf-panel" onClick={(e) => e.stopPropagation()}>
          <div className="perf-header">
            <h2 className="flex items-center gap-2"><Zap size={20} /> Performance Benchmark</h2>
            <button type="button" className="perf-close" onClick={onClose} aria-label="Close performance benchmark panel" data-testid="perf-close-btn"><X size={18} /></button>
          </div>

          {/* System Metrics */}
          <div className="perf-grid">
            <div className="perf-card" role="region" aria-label="System metrics" aria-live="polite" data-testid="perf-system-metrics">
              <h3 className="flex items-center gap-2"><BarChart3 size={16} /> System Metrics</h3>
              {systemMetrics ? (
                <>
                  <div className="perf-metric">
                    <span className="perf-metric-label">Heap Used</span>
                    <span className="perf-metric-value">{systemMetrics.heapUsedMB.toFixed(2)} MB</span>
                  </div>
                  <div className="perf-metric">
                    <span className="perf-metric-label">Heap Total</span>
                    <span className="perf-metric-value">{systemMetrics.heapTotalMB.toFixed(2)} MB</span>
                  </div>
                  <div className="perf-metric">
                    <span className="perf-metric-label">RSS</span>
                    <span className="perf-metric-value">{systemMetrics.rssMB.toFixed(2)} MB</span>
                  </div>
                  <div className="perf-metric">
                    <span className="perf-metric-label">CPU Usage</span>
                    <span className={`perf-metric-value ${systemMetrics.cpuPercent < 5 ? "perf-pass" : "perf-fail"}`}>
                      {systemMetrics.cpuPercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="perf-metric">
                    <span className="perf-metric-label">Uptime</span>
                    <span className="perf-metric-value">{(systemMetrics.uptimeSeconds / 60).toFixed(1)} min</span>
                  </div>
                </>
              ) : (
                <div className="perf-metric">
                  <span className="perf-metric-label">Loading...</span>
                  <span className="perf-spinner" />
                </div>
              )}
            </div>

            <div className="perf-card" role="region" aria-label="Spec compliance status" data-testid="perf-spec-compliance">
              <h3 className="flex items-center gap-2"><ShieldCheck size={16} /> Spec Compliance (§16)</h3>
              {systemValidation ? (
                <>
                  <div className="perf-metric">
                    <span className="perf-metric-label">Throughput ≥ 500 msg/sec</span>
                    <span className={`perf-badge ${systemValidation.throughputPass ? "perf-badge-pass" : "perf-badge-fail"}`}>
                      {systemValidation.throughputPass ? "PASS" : "FAIL"}
                    </span>
                  </div>
                  <div className="perf-metric">
                    <span className="perf-metric-label">{"Memory < 50 MB/hr"}</span>
                    <span className={`perf-badge ${systemValidation.memoryPass ? "perf-badge-pass" : "perf-badge-fail"}`}>
                      {systemValidation.memoryPass ? "PASS" : "FAIL"}
                    </span>
                  </div>
                  <div className="perf-metric">
                    <span className="perf-metric-label">{"CPU < 5%"}</span>
                    <span className={`perf-badge ${systemValidation.cpuPass ? "perf-badge-pass" : "perf-badge-fail"}`}>
                      {systemValidation.cpuPass ? "PASS" : "FAIL"}
                    </span>
                  </div>
                  <div className="perf-metric">
                    <span className="perf-metric-label">20 Concurrent Sessions</span>
                    <span className={`perf-badge ${systemValidation.concurrencyPass ? "perf-badge-pass" : "perf-badge-fail"}`}>
                      {systemValidation.concurrencyPass ? "PASS" : "FAIL"}
                    </span>
                  </div>
                </>
              ) : (
                <div className="perf-metric">
                  <span className="perf-metric-label">Run benchmarks to validate</span>
                </div>
              )}
            </div>
          </div>

          {/* Benchmark Controls */}
          <div className="perf-card" style={{ marginBottom: 16 }}>
            <h3 className="flex items-center gap-2"><Rocket size={16} /> Run Benchmarks</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {/* Throughput */}
              <div>
                <div className="perf-param-row" style={{ marginBottom: 8 }}>
                  <label>Duration (s)</label>
                  <input
                    className="perf-input"
                    type="number"
                    min={1}
                    max={300}
                    value={throughputDuration}
                    onChange={(e) => setThroughputDuration(Number(e.target.value) || 10)}
                  />
                </div>
                <div className="perf-param-row" style={{ marginBottom: 8 }}>
                  <label>Target msg/s</label>
                  <input
                    className="perf-input"
                    type="number"
                    min={1}
                    max={10000}
                    value={throughputTarget}
                    onChange={(e) => setThroughputTarget(Number(e.target.value) || 500)}
                  />
                </div>
                <button
                  type="button"
                  className="perf-btn"
                  onClick={() => void runThroughputBenchmark()}
                  disabled={running !== null}
                  aria-label={running === "throughput" ? "Running throughput benchmark..." : "Run throughput benchmark"}
                  style={{ width: "100%" }}
                  data-testid="perf-throughput-btn"
                >
                  {running === "throughput" ? <><span className="perf-spinner" /> Running...</> : "Throughput Test"}
                </button>
              </div>

              {/* Memory */}
              <div>
                <div className="perf-param-row" style={{ marginBottom: 8 }}>
                  <label>Duration (s)</label>
                  <input
                    className="perf-input"
                    type="number"
                    min={5}
                    max={600}
                    value={memoryDuration}
                    onChange={(e) => setMemoryDuration(Number(e.target.value) || 30)}
                  />
                </div>
                <div style={{ height: 36 }} />
                <button
                  type="button"
                  className="perf-btn"
                  onClick={() => void runMemoryBenchmark()}
                  disabled={running !== null}
                  aria-label={running === "memory" ? "Running memory benchmark..." : "Run memory benchmark"}
                  style={{ width: "100%" }}
                  data-testid="perf-memory-btn"
                >
                  {running === "memory" ? <><span className="perf-spinner" /> Running...</> : "Memory Test"}
                </button>
              </div>

              {/* Concurrency */}
              <div>
                <div className="perf-param-row" style={{ marginBottom: 8 }}>
                  <label>Sessions</label>
                  <input
                    className="perf-input"
                    type="number"
                    min={1}
                    max={100}
                    value={concurrencySessions}
                    onChange={(e) => setConcurrencySessions(Number(e.target.value) || 20)}
                  />
                </div>
                <div className="perf-param-row" style={{ marginBottom: 8 }}>
                  <label>Duration (s)</label>
                  <input
                    className="perf-input"
                    type="number"
                    min={5}
                    max={300}
                    value={concurrencyDuration}
                    onChange={(e) => setConcurrencyDuration(Number(e.target.value) || 15)}
                  />
                </div>
                <button
                  type="button"
                  className="perf-btn"
                  onClick={() => void runConcurrencyBenchmark()}
                  disabled={running !== null}
                  aria-label={running === "concurrency" ? "Running concurrency benchmark..." : "Run concurrency benchmark"}
                  style={{ width: "100%" }}
                  data-testid="perf-concurrency-btn"
                >
                  {running === "concurrency" ? <><span className="perf-spinner" /> Running...</> : "Concurrency Test"}
                </button>
              </div>
            </div>
          </div>

          {/* History */}
          <div className="perf-card" data-testid="perf-history">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }} className="flex items-center gap-2"><ClipboardList size={16} /> Benchmark History</h3>
              {history.length > 0 && (
                <button
                  type="button"
                  className="perf-btn ghost"
                  onClick={() => setHistory([])}
                  style={{ height: 28, fontSize: 11, padding: "0 10px" }}
                  data-testid="perf-history-clear"
                >
                  Clear
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div style={{ padding: "20px 0", textAlign: "center", color: "#64748b", fontSize: 13 }} data-testid="perf-history-empty">
                No benchmark results yet. Run a benchmark above to see results here.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="perf-table" data-testid="perf-history-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Key Metric</th>
                      <th>Details</th>
                      <th>Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatTimestamp(entry.timestamp)}</td>
                        <td>
                          <span className="perf-badge" style={{
                            background: entry.type === "throughput" ? "rgba(59, 130, 246, 0.15)" : entry.type === "memory" ? "rgba(234, 179, 8, 0.15)" : "rgba(22, 163, 74, 0.15)",
                            color: entry.type === "throughput" ? "#93c5fd" : entry.type === "memory" ? "#fbbf24" : "#4ade80"
                          }}>
                            {entry.type}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {entry.type === "throughput" && `${(entry.result as ThroughputResult).messagesPerSecond.toFixed(1)} msg/s`}
                          {entry.type === "memory" && `Δ${(entry.result as MemoryResult).deltaHeapMB.toFixed(2)} MB`}
                          {entry.type === "concurrency" && `${(entry.result as ConcurrencyResult).sessionCount} sessions`}
                        </td>
                        <td style={{ fontSize: 11, color: "#64748b" }}>
                          {entry.type === "throughput" && (
                            <>p50={((entry.result as ThroughputResult).p50LatencyMs).toFixed(2)}ms p99={((entry.result as ThroughputResult).p99LatencyMs).toFixed(2)}ms</>
                          )}
                          {entry.type === "memory" && (
                            <>peak={((entry.result as MemoryResult).peakHeapMB).toFixed(2)}MB dur={(((entry.result as MemoryResult).durationMs) / 1000).toFixed(0)}s</>
                          )}
                          {entry.type === "concurrency" && (
                            <>avg={((entry.result as ConcurrencyResult).avgMessagesPerSec).toFixed(1)}msg/s lat={((entry.result as ConcurrencyResult).avgLatencyMs).toFixed(2)}ms</>
                          )}
                        </td>
                        <td>
                          {(() => {
                            const errors = entry.type === "throughput"
                              ? (entry.result as ThroughputResult).errors
                              : entry.type === "concurrency"
                                ? (entry.result as ConcurrencyResult).errors
                                : 0;
                            return (
                              <span className={errors === 0 ? "perf-pass" : "perf-fail"}>
                                {errors}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
