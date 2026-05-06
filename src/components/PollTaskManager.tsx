import { useCallback, useEffect, useMemo, useState } from "react";
import type { PollTask, SessionState } from "../../packages/shared-types";

/* ── Interval presets ──────────────────────────────────────────── */

const INTERVAL_PRESETS = [
  { label: "100ms", value: 100 },
  { label: "500ms", value: 500 },
  { label: "1s", value: 1000 },
  { label: "5s", value: 5000 },
  { label: "10s", value: 10000 },
  { label: "30s", value: 30000 },
  { label: "60s", value: 60000 }
];

/* ── Types ─────────────────────────────────────────────────────── */

interface TaskRecord {
  task: PollTask;
  sessionId: string;
  protocolId: string;
  status: "running" | "stopped";
  createdAt: number;
  lastPollAt?: number;
  successCount: number;
  failureCount: number;
  lastResult?: string;
  lastError?: string;
}

interface PollTaskManagerProps {
  sessions: SessionState[];
  onBanner: (message: string) => void;
}

/* ── Helpers ───────────────────────────────────────────────────── */

function formatInterval(ms: number): string {
  if (ms >= 60000) return `${ms / 60000}s`;
  if (ms >= 1000) return `${ms / 1000}s`;
  return `${ms}ms`;
}

function formatTimestamp(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString();
}

/* ── Component ─────────────────────────────────────────────────── */

export default function PollTaskManager({ sessions, onBanner }: PollTaskManagerProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [intervalMs, setIntervalMs] = useState(1000);
  const [customInterval, setCustomInterval] = useState("");
  const [address, setAddress] = useState("0");
  const [length, setLength] = useState("2");
  const [functionCode, setFunctionCode] = useState("3");
  const [unitId, setUnitId] = useState("1");
  const [maxIterations, setMaxIterations] = useState("0");
  const [busy, setBusy] = useState(false);
  const [historyLimit] = useState(20);

  const connectedSessions = useMemo(
    () => sessions.filter((s) => s.status === "connected"),
    [sessions]
  );

  /* ── Sync tasks from all sessions ──────────────────────────── */

  const refreshAllTasks = useCallback(async () => {
    const records: TaskRecord[] = [];
    for (const session of sessions) {
      try {
        const sessionTasks = await window.taskApi.list(session.sessionId);
        for (const task of sessionTasks) {
          const existing = tasks.find(
            (t) => t.task.taskId === task.taskId && t.sessionId === session.sessionId
          );
          records.push({
            task,
            sessionId: session.sessionId,
            protocolId: session.protocolId,
            status: "running",
            createdAt: existing?.createdAt ?? Date.now(),
            lastPollAt: existing?.lastPollAt,
            successCount: existing?.successCount ?? 0,
            failureCount: existing?.failureCount ?? 0,
            lastResult: existing?.lastResult,
            lastError: existing?.lastError
          });
        }
      } catch {
        // Session may not exist or worker may be down
      }
    }
    setTasks(records);
  }, [sessions, tasks]);

  useEffect(() => {
    void refreshAllTasks();
    const interval = setInterval(() => void refreshAllTasks(), 3000);
    return () => clearInterval(interval);
  }, [sessions.length]);

  /* ── Task actions ──────────────────────────────────────────── */

  async function createTask() {
    const session = sessions.find((s) => s.sessionId === selectedSessionId);
    if (!session) {
      onBanner("Select a connected session first.");
      return;
    }
    if (session.status !== "connected") {
      onBanner("Session must be connected to start polling.");
      return;
    }

    const effectiveInterval = customInterval ? Number(customInterval) : intervalMs;
    if (!effectiveInterval || effectiveInterval < 10) {
      onBanner("Poll interval must be at least 10ms.");
      return;
    }

    const taskId = `poll-${session.sessionId}-${Date.now()}`;
    setBusy(true);
    try {
      const response = await window.taskApi.start(session.sessionId, {
        taskId,
        address,
        length: Number(length) || 1,
        intervalMs: effectiveInterval,
        functionCode: functionCode ? Number(functionCode) : undefined,
        unitId: unitId ? Number(unitId) : undefined
      });

      if (!response.success) {
        onBanner("Failed to start polling task.");
        return;
      }

      const newRecord: TaskRecord = {
        task: {
          taskId,
          address,
          length: Number(length) || 1,
          intervalMs: effectiveInterval,
          functionCode: functionCode ? Number(functionCode) : undefined,
          unitId: unitId ? Number(unitId) : undefined
        },
        sessionId: session.sessionId,
        protocolId: session.protocolId,
        status: "running",
        createdAt: Date.now(),
        successCount: 0,
        failureCount: 0
      };
      setTasks((current) => [...current, newRecord]);
      setCreateFormOpen(false);
      onBanner(`Polling task ${taskId} started.`);
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Failed to create task.");
    } finally {
      setBusy(false);
    }
  }

  async function stopTask(sessionId: string, taskId: string) {
    try {
      const response = await window.taskApi.stop(sessionId, taskId);
      if (!response.success) {
        onBanner(`Failed to stop task ${taskId}.`);
        return;
      }
      setTasks((current) =>
        current.map((t) =>
          t.task.taskId === taskId && t.sessionId === sessionId
            ? { ...t, status: "stopped" as const }
            : t
        )
      );
      onBanner(`Stopped task ${taskId}.`);
    } catch (error) {
      onBanner(error instanceof Error ? error.message : "Failed to stop task.");
    }
  }

  async function stopAllTasks() {
    const runningTasks = tasks.filter((t) => t.status === "running");
    for (const record of runningTasks) {
      await stopTask(record.sessionId, record.task.taskId);
    }
  }

  function clearCompleted() {
    setTasks((current) => current.filter((t) => t.status !== "stopped"));
  }

  /* ── Statistics ────────────────────────────────────────────── */

  const stats = useMemo(() => {
    const running = tasks.filter((t) => t.status === "running").length;
    const totalPolls = tasks.reduce((sum, t) => sum + t.successCount + t.failureCount, 0);
    const totalSuccess = tasks.reduce((sum, t) => sum + t.successCount, 0);
    const totalFailures = tasks.reduce((sum, t) => sum + t.failureCount, 0);
    const errorRate = totalPolls > 0 ? ((totalFailures / totalPolls) * 100).toFixed(1) : "0.0";
    return { running, totalPolls, totalSuccess, totalFailures, errorRate };
  }, [tasks]);

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <section className="section" aria-label="Poll Task Manager" data-testid="poll-task-manager">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>Poll Task Manager</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="button ghost"
            style={{ height: 32, fontSize: 12 }}
            aria-label={createFormOpen ? "Cancel task creation" : "Create new poll task"}
            aria-expanded={createFormOpen}
            onClick={() => setCreateFormOpen((v) => !v)}
            data-testid="poll-new-task-btn"
          >
            {createFormOpen ? "Cancel" : "+ New Task"}
          </button>
          <button
            type="button"
            className="button ghost"
            style={{ height: 32, fontSize: 12 }}
            aria-label="Stop all running poll tasks"
            onClick={() => void stopAllTasks()}
            disabled={stats.running === 0}
            data-testid="poll-stop-all-btn"
          >
            Stop All
          </button>
          <button
            type="button"
            className="button ghost"
            style={{ height: 32, fontSize: 12 }}
            aria-label="Clear completed poll tasks"
            onClick={clearCompleted}
            disabled={!tasks.some((t) => t.status === "stopped")}
            data-testid="poll-clear-completed-btn"
          >
            Clear Completed
          </button>
        </div>
      </div>

      {/* ── Statistics bar ─────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 14
        }}
      >
        <div style={{ padding: "10px 12px", borderRadius: 12, background: "#eff6ff", textAlign: "center" }} role="status" aria-label={`${stats.running} running tasks`} data-testid="poll-stat-running">
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1d4ed8" }}>{stats.running}</div>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>Running</div>
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 12, background: "#ecfdf3", textAlign: "center" }} role="status" aria-label={`${stats.totalPolls} total polls`} data-testid="poll-stat-total">
          <div style={{ fontSize: 20, fontWeight: 700, color: "#15803d" }}>{stats.totalPolls}</div>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>Total Polls</div>
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 12, background: "#f0fdf4", textAlign: "center" }} role="status" aria-label={`${stats.totalSuccess} successful polls`} data-testid="poll-stat-success">
          <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>{stats.totalSuccess}</div>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>Success</div>
        </div>
        <div style={{ padding: "10px 12px", borderRadius: 12, background: "#fef2f2", textAlign: "center" }} role="status" aria-label={`${stats.errorRate}% error rate`} data-testid="poll-stat-error-rate">
          <div style={{ fontSize: 20, fontWeight: 700, color: "#b91c1c" }}>{stats.errorRate}%</div>
          <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>Error Rate</div>
        </div>
      </div>

      {/* ── Create task form ───────────────────────────────────── */}
      {createFormOpen ? (
        <div
          style={{
            padding: 16,
            borderRadius: 16,
            border: "1px solid rgba(59, 130, 246, 0.3)",
            background: "linear-gradient(180deg, #ffffff 0%, #f0f7ff 100%)",
            marginBottom: 14
          }}
          data-testid="poll-create-form"
        >
          <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Create Poll Task</h3>
          <div className="form-grid">
            <label className="field">
              <span>Session</span>
              <select
                className="input"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                data-testid="poll-session-select"
              >
                <option value="">Select session...</option>
                {connectedSessions.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {s.sessionId} ({s.protocolId})
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Poll Interval</span>
              <select
                className="input"
                value={intervalMs}
                onChange={(e) => {
                  setIntervalMs(Number(e.target.value));
                  setCustomInterval("");
                }}
                data-testid="poll-interval-select"
              >
                {INTERVAL_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
                <option value={0}>Custom</option>
              </select>
            </label>

            {intervalMs === 0 ? (
              <label className="field">
                <span>Custom Interval (ms)</span>
                <input
                  className="input"
                  type="number"
                  min={10}
                  value={customInterval}
                  onChange={(e) => setCustomInterval(e.target.value)}
                  placeholder="e.g. 2500"
                />
              </label>
            ) : null}

            <label className="field">
              <span>Address</span>
              <input
                className="input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0"
              />
            </label>

            <label className="field">
              <span>Quantity</span>
              <input
                className="input"
                type="number"
                min={1}
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Function Code</span>
              <input
                className="input"
                type="number"
                min={1}
                max={255}
                value={functionCode}
                onChange={(e) => setFunctionCode(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Unit ID</span>
              <input
                className="input"
                type="number"
                min={1}
                max={247}
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Max Iterations (0 = ∞)</span>
              <input
                className="input"
                type="number"
                min={0}
                value={maxIterations}
                onChange={(e) => setMaxIterations(e.target.value)}
              />
            </label>
          </div>

          <div className="action-row">
            <button
              type="button"
              className="button"
              style={{ height: 36, fontSize: 13 }}
              onClick={() => void createTask()}
              disabled={busy || !selectedSessionId}
              data-testid="poll-start-btn"
            >
              {busy ? "Starting..." : "Start Polling"}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Task list ──────────────────────────────────────────── */}
      {tasks.length === 0 ? (
        <div className="empty" data-testid="poll-empty">No poll tasks. Click "+ New Task" to create one.</div>
      ) : (
        <div className="protocol-grid" data-testid="poll-task-list">
          {tasks.map((record) => (
            <div
              key={`${record.sessionId}-${record.task.taskId}`}
              className="protocol-card"
              style={{
                cursor: "default",
                borderLeft: record.status === "running"
                  ? "3px solid #22c55e"
                  : "3px solid #94a3b8"
              }}
            >
              <div className="card-head">
                <p className="card-title" style={{ fontSize: 13 }}>
                  {record.task.taskId}
                </p>
                <span
                  className={`status-pill ${record.status === "running" ? "status-connected" : "status-disconnected"}`}
                  role="status"
                  aria-label={`Task status: ${record.status}`}
                >
                  {record.status}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginTop: 8 }}>
                <p className="card-copy" style={{ margin: 0 }}>
                  <strong>Session:</strong> {record.sessionId}
                </p>
                <p className="card-copy" style={{ margin: 0 }}>
                  <strong>Protocol:</strong> {record.protocolId}
                </p>
                <p className="card-copy" style={{ margin: 0 }}>
                  <strong>Interval:</strong> {formatInterval(record.task.intervalMs)}
                </p>
                <p className="card-copy" style={{ margin: 0 }}>
                  <strong>Address:</strong> {record.task.address} × {record.task.length}
                </p>
                {record.task.functionCode ? (
                  <p className="card-copy" style={{ margin: 0 }}>
                    <strong>FC:</strong> {record.task.functionCode}
                  </p>
                ) : null}
                {record.task.unitId ? (
                  <p className="card-copy" style={{ margin: 0 }}>
                    <strong>Unit:</strong> {record.task.unitId}
                  </p>
                ) : null}
                <p className="card-copy" style={{ margin: 0 }}>
                  <strong>Last Poll:</strong> {formatTimestamp(record.lastPollAt)}
                </p>
                <p className="card-copy" style={{ margin: 0 }}>
                  <strong>Success/Fail:</strong>{" "}
                  <span style={{ color: "#15803d" }}>{record.successCount}</span>
                  {" / "}
                  <span style={{ color: record.failureCount > 0 ? "#b91c1c" : "#475569" }}>
                    {record.failureCount}
                  </span>
                </p>
              </div>

              {record.lastError ? (
                <p className="card-copy" style={{ color: "#b91c1c", marginTop: 6 }}>
                  {record.lastError}
                </p>
              ) : null}

              {record.lastResult ? (
                <pre
                  style={{
                    marginTop: 6,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: "#0f172a",
                    color: "#dbeafe",
                    fontSize: 11,
                    lineHeight: 1.5,
                    overflow: "auto",
                    maxHeight: 60
                  }}
                >
                  {record.lastResult}
                </pre>
              ) : null}

              <div className="action-row" style={{ marginTop: 10 }}>
                {record.status === "running" ? (
                  <button
                    type="button"
                    className="button ghost"
                    style={{ height: 30, fontSize: 11 }}
                    aria-label={`Stop poll task ${record.task.taskId}`}
                    onClick={() => void stopTask(record.sessionId, record.task.taskId)}
                    data-testid={`poll-stop-${record.task.taskId}`}
                  >
                    Stop
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>Stopped</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Task history mini-table ────────────────────────────── */}
      {tasks.some((t) => t.lastResult || t.lastError) ? (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Recent Poll Results</h3>
          <div
            style={{
              borderRadius: 12,
              border: "1px solid #d7e3f4",
              overflow: "hidden"
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#475569" }}>Task</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#475569" }}>Session</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#475569" }}>Last Poll</th>
                  <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#475569" }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {tasks
                  .filter((t) => t.lastResult || t.lastError)
                  .slice(-historyLimit)
                  .map((record) => (
                    <tr
                      key={`hist-${record.sessionId}-${record.task.taskId}`}
                      style={{
                        borderTop: "1px solid #e2e8f0",
                        background: record.lastError ? "#fef2f2" : "transparent"
                      }}
                    >
                      <td style={{ padding: "6px 10px", fontFamily: "Consolas, monospace" }}>
                        {record.task.taskId}
                      </td>
                      <td style={{ padding: "6px 10px" }}>{record.sessionId}</td>
                      <td style={{ padding: "6px 10px" }}>{formatTimestamp(record.lastPollAt)}</td>
                      <td
                        style={{
                          padding: "6px 10px",
                          fontFamily: "Consolas, monospace",
                          color: record.lastError ? "#b91c1c" : "#15803d",
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {record.lastError ?? record.lastResult ?? "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
