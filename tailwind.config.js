/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        ink: { 900: '#0b1020', 800: '#121830', 700: '#1c2442' },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,24,40,.04), 0 8px 24px -8px rgba(16,24,40,.10)',
        glow: '0 0 0 1px rgba(99,102,241,.25), 0 12px 40px -8px rgba(99,102,241,.45)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        'pulse-ring': { '0%': { transform: 'scale(1)', opacity: 0.5 }, '100%': { transform: 'scale(1.6)', opacity: 0 } },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        'pulse-ring': 'pulse-ring 1.8s ease-out infinite',
      },
    },
  },
  plugins: [],
};
