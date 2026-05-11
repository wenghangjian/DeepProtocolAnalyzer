module.exports = {
  content: ["./index.html", "./src/**/*.{html,tsx,ts}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
        },
        cyan: {
          DEFAULT: '#06b6d4',
          hover: '#0891b2',
        },
        success: '#22c55e',
        warning: '#eab308',
        danger: '#ef4444',
        info: '#3b82f6',
        surface: {
          app: '#0f172a',
          panel: '#1e293b',
          card: '#1e293b',
          'card-hover': '#263548',
          elevated: '#334155',
          input: '#0f172a',
        },
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
