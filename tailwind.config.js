/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#FFD60A', dark: '#FFC300', soft: 'rgb(var(--c-brand-soft) / <alpha-value>)' },
        // Tema renkleri CSS değişkenlerinden gelir (src/index.css)
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        card: 'rgb(var(--c-card) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          soft: 'rgb(var(--c-ink-soft) / <alpha-value>)',
          muted: 'rgb(var(--c-ink-muted) / <alpha-value>)',
        },
        /** Sarı/açık zemin üzerindeki metin: temadan bağımsız koyu */
        onbrand: '#1A1A1A',
        /** Her iki temada da koyu kalan yüzeyler (bildirim, admin menüsü) */
        night: '#1A1A1A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        float: '0 6px 20px -4px rgba(26,26,26,0.22)',
        sheet: '0 -10px 40px -10px rgba(26,26,26,0.25)',
      },
      keyframes: {
        'slide-up': { from: { transform: 'translateY(16px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        'slide-down': { from: { transform: 'translateY(-16px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'drawer-in': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'sheet-in': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
      },
      animation: {
        'slide-up': 'slide-up .25s ease-out',
        'slide-down': 'slide-down .3s cubic-bezier(.2,.9,.3,1.2)',
        'fade-in': 'fade-in .2s ease-out',
        'drawer-in': 'drawer-in .28s cubic-bezier(.2,.8,.2,1)',
        'sheet-in': 'sheet-in .3s cubic-bezier(.2,.8,.2,1)',
      },
    },
  },
  plugins: [],
};
