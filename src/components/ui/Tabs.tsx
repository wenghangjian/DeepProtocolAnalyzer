import React, { useState, useRef, useCallback } from "react";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeId?: string;
  onChange?: (id: string) => void;
  className?: string;
}

export default function Tabs({ tabs, activeId, onChange, className = "" }: TabsProps) {
  const [internalActive, setInternalActive] = useState(tabs[0]?.id ?? "");
  const active = activeId ?? internalActive;
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleChange = useCallback(
    (id: string) => {
      if (onChange) {
        onChange(id);
      } else {
        setInternalActive(id);
      }
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = tabs.findIndex((t) => t.id === active);
      let nextIndex = currentIndex;

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (e.key === "Home") {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        nextIndex = tabs.length - 1;
      } else {
        return;
      }

      const nextTab = tabs[nextIndex];
      handleChange(nextTab.id);
      tabRefs.current.get(nextTab.id)?.focus();
    },
    [active, tabs, handleChange]
  );

  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className={className}>
      {/* Tab list */}
      <div
        role="tablist"
        className="flex gap-1 border-b border-slate-700/50 mb-3"
        onKeyDown={handleKeyDown}
        aria-orientation="horizontal"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleChange(tab.id)}
              className={[
                "px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-1 rounded-t",
                isActive
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-500",
              ].join(" ")}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab panel */}
      {activeTab && (
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab.id}`}
          aria-labelledby={`tab-${activeTab.id}`}
          tabIndex={0}
        >
          {activeTab.content}
        </div>
      )}
    </div>
  );
}
