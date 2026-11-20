/** @type {import('tailwindcss').Config} */
// Colours are CSS custom properties (src/ui/tokens.css) so the look changes in one place.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ohara: {
          bg: token('bg'),
          surface: token('surface'),
          sunken: token('sunken'),
          line: token('line'),
          'line-strong': token('line-strong'),
          ink: token('ink'),
          muted: token('muted'),
          night: token('night'),
          'night-2': token('night-2'),
          ind: token('ind'),
          'ind-hover': token('ind-hover'),
          'ind-soft': token('ind-soft'),
          'ind-ink': token('ind-ink'),
          lime: token('lime'),
          'lime-soft': token('lime-soft'),
          'lime-ink': token('lime-ink'),
          sky: token('sky'),
          'sky-ink': token('sky-ink'),
          tea: token('tea'),
          'tea-soft': token('tea-soft'),
          'tea-ink': token('tea-ink'),
          amb: token('amb'),
          'amb-soft': token('amb-soft'),
          'amb-ink': token('amb-ink'),
          rose: token('rose'),
          'rose-soft': token('rose-soft'),
          'rose-ink': token('rose-ink'),
          cri: token('cri'),
          'cri-soft': token('cri-soft'),
          'cri-ink': token('cri-ink'),
          'cri-line': token('cri-line'),
        },
      },
      fontFamily: {
        sans: ['var(--ui-font)'],
      },
      spacing: {
        control: 'var(--ui-control)',
      },
      minHeight: {
        control: 'var(--ui-control)',
      },
      borderRadius: {
        sm: 'var(--ui-r-sm)',
        md: 'var(--ui-r-md)',
        lg: 'var(--ui-r-lg)',
        xl: 'var(--ui-r-xl)',
        '2xl': 'var(--ui-r-2xl)',
        pill: 'var(--ui-r-pill)',
      },
      fontSize: {
        xs: ['var(--text-xs)', { lineHeight: '1.4' }],
        sm: ['var(--text-sm)', { lineHeight: '1.4' }],
        base: ['var(--text-base)', { lineHeight: '1.45' }],
        lg: ['var(--text-lg)', { lineHeight: '1.35' }],
        xl: ['var(--text-xl)', { lineHeight: '1.3' }],
        '2xl': ['var(--text-2xl)', { lineHeight: '1.2' }],
        '3xl': ['var(--text-3xl)', { lineHeight: '1.15' }],
        '4xl': ['var(--text-4xl)', { lineHeight: '1.05' }],
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 16 16 / 0.04), 0 8px 24px -12px rgb(16 16 16 / 0.10)',
        lift: '0 2px 4px rgb(16 16 16 / 0.05), 0 16px 32px -12px rgb(16 16 16 / 0.16)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise var(--ui-enter) var(--ui-ease) both',
      },
    },
  },
  plugins: [],
};
