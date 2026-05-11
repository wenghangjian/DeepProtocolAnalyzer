/**
 * Centralized design tokens for the DeepProtocolAnalyzer dark industrial theme.
 * All components should reference these tokens for consistency.
 */
export const theme = {
  colors: {
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    cyan: '#06b6d4',
    cyanHover: '#0891b2',
    success: '#22c55e',
    warning: '#eab308',
    danger: '#ef4444',
    info: '#3b82f6',
    bg: {
      app: '#0f172a',
      panel: '#1e293b',
      card: '#1e293b',
      cardHover: '#263548',
      elevated: '#334155',
      input: '#0f172a',
    },
    text: {
      primary: '#f8fafc',
      secondary: '#94a3b8',
      muted: '#64748b',
      accent: '#3b82f6',
    },
    border: {
      subtle: 'rgba(148, 163, 184, 0.1)',
      default: 'rgba(148, 163, 184, 0.15)',
      active: '#3b82f6',
    },
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
