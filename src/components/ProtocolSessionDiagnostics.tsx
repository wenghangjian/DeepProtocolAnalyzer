import type { SessionEvent, SessionState } from "../../packages/shared-types";

function formatEvent(event: SessionEvent) {
  if (event.type === "connection-state") {
    return `State -> ${event.state}${event.reason ? ` (${event.reason})` : ""}`;
  }
  if (event.type === "handshake") {
    return `${event.handshakeId}/${event.stepId} -> ${event.status}${event.detail ? ` (${event.detail})` : ""}`;
  }
  if (event.type === "transaction") {
    return `${event.transactionType}/${event.transactionId} -> ${event.state}${event.phase ? ` @ ${event.phase}` : ""}${event.error ? ` (${event.error})` : ""}`;
  }
  return `${event.direction.toUpperCase()} ${event.length}B ${event.classification ?? "traffic"}`;
}

export default function ProtocolSessionDiagnostics({
  session,
  events
}: {
  session: SessionState | null;
  events: SessionEvent[];
}) {
  if (!session) {
    return <div className="empty">Connection diagnostics will appear once a session is selected.</div>;
  }

  return (
    <section className="section" aria-label="Protocol Session Diagnostics">
      <h3>Protocol Session Diagnostics</h3>
      <div className="pill-row" style={{ marginBottom: 12 }} role="status" aria-live="polite" aria-label="Session state indicators">
        <span className="pill">connection: {session.connectionState ?? "idle"}</span>
        <span className="pill">handshake: {session.handshakePhase ?? "n/a"}</span>
        <span className="pill">transaction: {session.activeTransactionId ?? "idle"}</span>
      </div>
      {events.length === 0 ? (
        <div className="empty">No session lifecycle events recorded yet.</div>
      ) : (
        <div className="protocol-grid">
          {events.slice().reverse().map((event) => (
            <div key={`${event.type}-${event.timestamp}-${"transactionId" in event ? event.transactionId : ""}`} className="protocol-card" style={{ cursor: "default" }}>
              <div className="card-head">
                <p className="card-title">{event.type}</p>
                <span className="pill">{new Date(event.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="card-copy">{formatEvent(event)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
