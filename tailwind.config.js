/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#FFD60A', dark: '#FFC300', soft: '#FFF6C7' },
        ink: { DEFAULT: '#1A1A1A', soft: '#4A4A4A', muted: '#8A8A8A' },
        card: '#F8F9FA',
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
