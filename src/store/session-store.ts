import { create } from "zustand";
import type { SessionEvent, SessionState, TrafficEvent } from "../../packages/shared-types";

interface PersistedSessionConfig {
  sessionId: string;
  protocolId: string;
  transport: "tcp" | "serial" | "udp";
  config: Record<string, string | number | boolean>;
}

interface SessionStore {
  sessions: SessionState[];
  traffic: TrafficEvent[];
  sessionEvents: Record<string, SessionEvent[]>;
  selectedSessionId: string | null;
  addSession: (session: SessionState) => void;
  upsertSession: (session: SessionState) => void;
  selectSession: (sessionId: string | null) => void;
  updateStatus: (sessionId: string, status: SessionState["status"], lastError?: string) => void;
  addTrafficBatch: (events: TrafficEvent[]) => void;
  addSessionEvent: (event: SessionEvent) => void;
  clearTraffic: (sessionId: string) => void;
  saveSession: (session: SessionState) => Promise<void>;
  loadPersistedSessions: () => Promise<PersistedSessionConfig[]>;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  traffic: [],
  sessionEvents: {},
  selectedSessionId: null,
  addSession: (session) => set((state) => ({
    sessions: state.sessions.concat(session),
    selectedSessionId: state.selectedSessionId ?? session.sessionId
  })),
  upsertSession: (session) => set((state) => {
    const existing = state.sessions.some((item) => item.sessionId === session.sessionId);
    return {
      sessions: existing
        ? state.sessions.map((item) => item.sessionId === session.sessionId ? session : item)
        : state.sessions.concat(session),
      selectedSessionId: state.selectedSessionId ?? session.sessionId
    };
  }),
  selectSession: (sessionId) => set({ selectedSessionId: sessionId }),
  updateStatus: (sessionId, status, lastError) => set((state) => ({
    sessions: state.sessions.map((session) => (
      session.sessionId === sessionId
        ? { ...session, status, lastError }
        : session
    ))
  })),
  addTrafficBatch: (events) => set((state) => {
    const nextTraffic = state.traffic.concat(events);
    if (nextTraffic.length <= 10000) {
      return { traffic: nextTraffic };
    }

    return { traffic: nextTraffic.slice(nextTraffic.length - 10000) };
  }),
  addSessionEvent: (event) => set((state) => {
    const currentEvents = state.sessionEvents[event.sessionId] ?? [];
    const nextEvents = currentEvents.concat(event).slice(-100);
    return {
      sessionEvents: {
        ...state.sessionEvents,
        [event.sessionId]: nextEvents
      }
    };
  }),
  clearTraffic: (sessionId) => set((state) => ({
    traffic: state.traffic.filter((event) => event.sessionId !== sessionId),
    sessionEvents: {
      ...state.sessionEvents,
      [sessionId]: []
    }
  })),
  saveSession: async (session) => {
    const persisted: PersistedSessionConfig = {
      sessionId: session.sessionId,
      protocolId: session.protocolId,
      transport: session.transport,
      config: session.config as Record<string, string | number | boolean>
    };
    try {
      await window.configApi.set(`session:${session.sessionId}`, persisted);
      // Also update the sessions index
      const existing = (await window.configApi.get("sessions") as PersistedSessionConfig[] | null) ?? [];
      const index = existing.findIndex((item) => item.sessionId === session.sessionId);
      const next = index >= 0
        ? existing.map((item) => item.sessionId === session.sessionId ? persisted : item)
        : existing.concat(persisted);
      await window.configApi.set("sessions", next);
    } catch {
      // Silently fail - persistence is best-effort
    }
  },
  loadPersistedSessions: async () => {
    try {
      const stored = await window.configApi.get("sessions");
      if (Array.isArray(stored)) {
        return stored as PersistedSessionConfig[];
      }
      return [];
    } catch {
      return [];
    }
  }
}));
