import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-base",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-blue-600 to-teal-700 text-white hover:from-blue-700 hover:to-teal-800 focus-visible:ring-blue-500",
  secondary:
    "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 focus-visible:ring-blue-400",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
  ghost:
    "bg-white text-slate-700 border border-gray-200 hover:bg-gray-50 focus-visible:ring-gray-400",
};

const spinnerStyle: React.CSSProperties = {
  display: "inline-block",
  width: 14,
  height: 14,
  border: "2px solid currentColor",
  borderTopColor: "transparent",
  borderRadius: "50%",
  animation: "btn-spin 0.6s linear infinite",
};

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  iconLeft,
  iconRight,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <>
      <style>{`@keyframes btn-spin { to { transform: rotate(360deg); } }`}</style>
      <button
        type="button"
        className={[
          "inline-flex items-center justify-center gap-1.5 rounded-xl font-bold cursor-pointer",
          "transition-all duration-150 ease-in-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900",
          sizeClasses[size],
          variantClasses[variant],
          isDisabled ? "opacity-50 cursor-not-allowed pointer-events-none" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        {...rest}
      >
        {loading ? (
          <span style={spinnerStyle} aria-hidden="true" />
        ) : (
          iconLeft && <span className="inline-flex shrink-0" aria-hidden="true">{iconLeft}</span>
        )}
        {children}
        {iconRight && !loading && (
          <span className="inline-flex shrink-0" aria-hidden="true">{iconRight}</span>
        )}
      </button>
    </>
  );
}
