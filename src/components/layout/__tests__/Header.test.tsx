import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Header from "../Header";
import type { SessionState } from "../../../../packages/shared-types";

const mockSessions: SessionState[] = [
  { sessionId: "1", protocolId: "modbus-tcp", status: "connected", config: {} } as SessionState,
  { sessionId: "2", protocolId: "dnp3", status: "error", config: {} } as SessionState,
  { sessionId: "3", protocolId: "modbus-rtu", status: "disconnected", config: {} } as SessionState,
];

describe("Header", () => {
  const defaultProps = {
    sessions: mockSessions,
    banner: "Test banner",
    theme: "dark" as const,
    onToggleTheme: vi.fn(),
  };

  it("renders brand name", () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText("DeepProtocolAnalyzer")).toBeInTheDocument();
  });

  it("shows connected session count", () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText("1 connected")).toBeInTheDocument();
  });

  it("shows error session count", () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText("1 error")).toBeInTheDocument();
  });

  it("shows total session count", () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText("3 sessions")).toBeInTheDocument();
  });

  it("shows banner text", () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText("Test banner")).toBeInTheDocument();
  });

  it("renders theme toggle button", () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument();
  });

  it("shows sun icon in dark mode", () => {
    render(<Header {...defaultProps} theme="dark" />);
    const toggle = screen.getByTestId("theme-toggle");
    expect(toggle.querySelector("svg")).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-label", "Switch to light mode");
  });

  it("shows moon icon in light mode", () => {
    render(<Header {...defaultProps} theme="light" />);
    const toggle = screen.getByTestId("theme-toggle");
    expect(toggle).toHaveAttribute("aria-label", "Switch to dark mode");
  });

  it("calls onToggleTheme when clicked", async () => {
    const user = userEvent.setup();
    const onToggleTheme = vi.fn();
    render(<Header {...defaultProps} onToggleTheme={onToggleTheme} />);
    await user.click(screen.getByTestId("theme-toggle"));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it("hides session badges when no sessions", () => {
    render(<Header {...defaultProps} sessions={[]} />);
    expect(screen.queryByText(/connected/)).not.toBeInTheDocument();
    expect(screen.queryByText(/session/)).not.toBeInTheDocument();
  });

  it("hides error badge when no errors", () => {
    const noErrors = [{ sessionId: "1", protocolId: "modbus-tcp", status: "connected", config: {} } as SessionState];
    render(<Header {...defaultProps} sessions={noErrors} />);
    expect(screen.queryByText(/error/)).not.toBeInTheDocument();
  });
});
