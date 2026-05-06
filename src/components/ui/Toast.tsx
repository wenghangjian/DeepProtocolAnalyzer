import React, { useEffect, useState, useCallback, createContext, useContext, useRef } from "react";

/* ── Types ─────────────────────────────────────────────────────── */

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

/* ── Context ───────────────────────────────────────────────────── */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

/* ── Variant styles ────────────────────────────────────────────── */

const variantStyles: Record<ToastVariant, { bg: string; border: string; text: string; icon: string }> = {
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    icon: "✓",
  },
  error: {
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
    icon: "✕",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    icon: "⚠",
  },
  info: {
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    text: "text-cyan-800",
    icon: "ℹ",
  },
};

/* ── Single Toast ──────────────────────────────────────────────── */

function ToastMessage({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const styles = variantStyles[item.variant];

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(item.id), 300);
    }, item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        "flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg min-w-[280px] max-w-[420px]",
        "transition-all duration-300 ease-in-out",
        styles.bg,
        styles.border,
        styles.text,
        exiting ? "opacity-0 translate-x-5" : "opacity-100 translate-x-0",
      ].join(" ")}
    >
      <span className="text-base font-bold shrink-0" aria-hidden="true">
        {styles.icon}
      </span>
      <span className="flex-1 text-sm font-medium">{item.message}</span>
      <button
        type="button"
        onClick={() => {
          setExiting(true);
          setTimeout(() => onDismiss(item.id), 300);
        }}
        className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/5 transition-colors cursor-pointer text-xs"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}

/* ── Provider ──────────────────────────────────────────────────── */

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info", duration = 4000) => {
      const id = `toast-${++counterRef.current}`;
      setToasts((prev) => [...prev, { id, variant, message, duration }]);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div
        className="fixed top-5 right-5 z-[2000] flex flex-col gap-2.5"
        aria-label="Notifications"
      >
        {toasts.map((item) => (
          <ToastMessage key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ── Standalone component (for use without context) ────────────── */

interface StandaloneToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: StandaloneToastProps) {
  return (
    <div
      className="fixed top-5 right-5 z-[2000] flex flex-col gap-2.5"
      aria-label="Notifications"
    >
      {toasts.map((item) => (
        <ToastMessage key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

export type { ToastItem, ToastVariant };
