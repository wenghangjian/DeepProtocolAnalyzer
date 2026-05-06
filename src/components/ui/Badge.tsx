import React from "react";

type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  success: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  warning: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  danger: { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  info: { bg: "bg-cyan-50", text: "text-cyan-700", dot: "bg-cyan-500" },
  neutral: { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" },
};

export default function Badge({
  variant = "neutral",
  dot = false,
  pulse = false,
  children,
  className = "",
}: BadgeProps) {
  const styles = variantStyles[variant];

  return (
    <>
      {pulse && (
        <style>{`
          @keyframes badge-pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      )}
      <span
        className={[
          "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold",
          styles.bg,
          styles.text,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {dot && (
          <span
            className={[
              "w-2 h-2 rounded-full shrink-0",
              styles.dot,
              pulse ? "animate-pulse" : "",
            ].join(" ")}
            style={pulse ? { animation: "badge-pulse 1.5s ease-in-out infinite" } : undefined}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    </>
  );
}
