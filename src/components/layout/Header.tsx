import React from "react";
import { Sun, Moon } from "lucide-react";
import type { SessionState } from "../../../packages/shared-types";
import { Badge } from "../ui";

interface HeaderProps {
  sessions: SessionState[];
  banner: string;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}

export default function Header({ sessions, banner, theme, onToggleTheme }: HeaderProps) {
  const connectedCount = sessions.filter((s) => s.status === "connected").length;
  const errorCount = sessions.filter((s) => s.status === "error").length;

  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
          <span className="text-white font-bold text-sm">DP</span>
        </div>
        <h1 className="text-base font-bold text-foreground tracking-tight m-0">
          DeepProtocolAnalyzer
        </h1>
      </div>

      {/* Status indicators + Theme toggle */}
      <div className="flex items-center gap-3">
        {sessions.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="info" dot={connectedCount > 0} pulse={connectedCount > 0}>
              {connectedCount} connected
            </Badge>
            {errorCount > 0 && (
              <Badge variant="danger" dot>
                {errorCount} error
              </Badge>
            )}
            <Badge variant="neutral">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        )}
        {banner && (
          <span className="text-xs text-muted-foreground max-w-md truncate" title={banner}>
            {banner}
          </span>
        )}

        {/* Theme toggle */}
        <button
          type="button"
          onClick={onToggleTheme}
          className="flex items-center justify-center w-9 h-9 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          data-testid="theme-toggle"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
