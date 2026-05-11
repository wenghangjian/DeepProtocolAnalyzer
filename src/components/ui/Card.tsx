import React from "react";

interface CardProps {
  title?: string;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** ARIA role for the card container */
  role?: string;
  /** ARIA label for the card */
  ariaLabel?: string;
}

export default function Card({
  title,
  actions,
  footer,
  children,
  className = "",
  role,
  ariaLabel,
}: CardProps) {
  return (
    <div
      className={[
        "rounded-xl border border-slate-700/50 bg-slate-800 shadow-lg overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role={role}
      aria-label={ariaLabel}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
          {title && (
            <h3 className="m-0 text-sm font-bold text-slate-100 tracking-tight">{title}</h3>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className="p-4">{children}</div>

      {footer && (
        <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/50">{footer}</div>
      )}
    </div>
  );
}
