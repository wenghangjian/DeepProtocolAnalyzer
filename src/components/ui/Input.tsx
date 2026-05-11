import React, { useId } from "react";

type InputType = "text" | "number" | "select";

interface BaseInputProps {
  label?: string;
  helperText?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

interface TextInputProps extends BaseInputProps, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  type?: "text" | "number";
}

interface SelectInputProps extends BaseInputProps, Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "type"> {
  type: "select";
  children: React.ReactNode;
}

type InputProps = TextInputProps | SelectInputProps;

export default function Input(props: InputProps) {
  const { label, helperText, error, disabled, className = "", ...rest } = props;
  const id = useId();
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  const baseClasses = [
    "w-full px-3 py-2.5 rounded-xl border text-sm text-slate-100 bg-slate-900 outline-none",
    "transition-all duration-150",
    "focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500",
    "placeholder:text-slate-500",
    error
      ? "border-red-500/50 focus:ring-red-500/20 focus:border-red-500"
      : "border-slate-600",
    disabled ? "opacity-50 cursor-not-allowed bg-slate-800" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const describedBy = [error ? errorId : null, helperText ? helperId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <label className="flex flex-col gap-1.5" htmlFor={label ? id : undefined}>
      {label && (
        <span className="text-xs font-semibold text-slate-400">{label}</span>
      )}

      {props.type === "select" ? (
        <select
          id={id}
          className={baseClasses}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          aria-disabled={disabled}
          {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
        >
          {(props as SelectInputProps).children}
        </select>
      ) : (
        <input
          id={id}
          className={baseClasses}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          aria-disabled={disabled}
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )}

      {error && (
        <span id={errorId} className="text-xs text-red-400" role="alert">
          {error}
        </span>
      )}
      {helperText && !error && (
        <span id={helperId} className="text-xs text-slate-500">
          {helperText}
        </span>
      )}
    </label>
  );
}
