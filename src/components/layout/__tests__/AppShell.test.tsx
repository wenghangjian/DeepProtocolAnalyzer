import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppShell from "../AppShell";
import type { ProtocolManifest, SerialPortInfo, SessionState, SessionEvent, TrafficEvent } from "../../../../packages/shared-types";

// Minimal mock props for AppShell
const baseProps = {
  manifests: [] as ProtocolManifest[],
  sessions: [] as SessionState[],
  serialPorts: [] as SerialPortInfo[],
  selectedProtocolId: "",
  selectedSessionId: null as string | null,
  selectedSession: null as SessionState | null,
  activeManifest: null as ProtocolManifest | null,
  filteredTraffic: [] as TrafficEvent[],
  selectedSessionEvents: [] as SessionEvent[],
  banner: "",
  lastResult: "",
  trafficQuery: "",
  pollManagerOpen: false,
  canOperate: false,
  busy: false,
  refreshingPorts: false,
  transport: "tcp" as const,
  draftConfig: {},
  modbusForm: { address: "", length: "", functionCode: "", unitId: "", timeoutMs: "", writeHex: "" },
  rawForm: { payload: "", timeoutMs: "" },
  pollForm: { intervalMs: "" },
  detailPanelVisible: true,
  theme: "dark" as const,
  onToggleTheme: vi.fn(),
  onSelectProtocol: vi.fn(),
  onSelectSession: vi.fn(),
  onCreateSession: vi.fn(),
  onRefreshPorts: vi.fn(),
  onOpenTemplates: vi.fn(),
  onOpenPerformance: vi.fn(),
  onTransportChange: vi.fn(),
  onDraftConfigChange: vi.fn(),
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  onClearTraffic: vi.fn(),
  onTogglePollManager: vi.fn(),
  onModbusFormChange: vi.fn(),
  onRawFormChange: vi.fn(),
  onPollFormChange: vi.fn(),
  onModbusRead: vi.fn(),
  onModbusWrite: vi.fn(),
  onSendRawFrame: vi.fn(),
  onWaitForFrame: vi.fn(),
  onStartPolling: vi.fn(),
  onStopPolling: vi.fn(),
  onInvokeCapability: vi.fn(),
  onTrafficQueryChange: vi.fn(),
  onBanner: vi.fn(),
};

describe("AppShell", () => {
  it("renders the header", () => {
    render(<AppShell {...baseProps} />);
    expect(screen.getByText("DeepProtocolAnalyzer")).toBeInTheDocument();
  });

  it("renders theme toggle", () => {
    render(<AppShell {...baseProps} />);
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("renders left sidebar toggle button", () => {
    render(<AppShell {...baseProps} />);
    expect(screen.getByTestId("toggle-left-sidebar")).toBeInTheDocument();
  });

  it("renders right sidebar toggle button when detail panel visible", () => {
    render(<AppShell {...baseProps} detailPanelVisible={true} />);
    expect(screen.getByTestId("toggle-right-sidebar")).toBeInTheDocument();
  });

  it("hides right sidebar toggle when detail panel not visible", () => {
    render(<AppShell {...baseProps} detailPanelVisible={false} />);
    expect(screen.queryByTestId("toggle-right-sidebar")).not.toBeInTheDocument();
  });

  it("collapses left sidebar on toggle click", async () => {
    const user = userEvent.setup();
    render(<AppShell {...baseProps} />);
    const toggle = screen.getByTestId("toggle-left-sidebar");
    expect(toggle).toHaveAttribute("aria-label", "Collapse left sidebar");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-label", "Expand left sidebar");
  });

  it("collapses right sidebar on toggle click", async () => {
    const user = userEvent.setup();
    render(<AppShell {...baseProps} detailPanelVisible={true} />);
    const toggle = screen.getByTestId("toggle-right-sidebar");
    expect(toggle).toHaveAttribute("aria-label", "Collapse right panel");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-label", "Expand right panel");
  });

  it("uses bg-background class for theme support", () => {
    const { container } = render(<AppShell {...baseProps} />);
    const root = container.firstChild as HTMLElement;
    expect(root.className).toContain("bg-background");
    expect(root.className).toContain("text-foreground");
  });
});
