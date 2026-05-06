/**
 * Centralized design tokens for consistent UI across all components.
 * Follows a dark industrial theme suitable for SCADA/ICS tooling.
 */
export const theme = {
  colors: {
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#06b6d4',
    bg: {
      primary: '#111827',
      secondary: '#1f2937',
      tertiary: '#374151',
      card: '#1e293b',
    },
    text: {
      primary: '#f9fafb',
      secondary: '#9ca3af',
      muted: '#6b7280',
    },
    border: '#374151',
  },
  spacing: {
    panel: 'p-4',
    card: 'p-3',
    section: 'mb-4',
  },
  borderRadius: 'rounded-lg',
  fontSize: {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  },
} as const;

export type Theme = typeof theme;
