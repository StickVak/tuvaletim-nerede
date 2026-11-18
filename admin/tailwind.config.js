import base from '../tailwind.config.js';

/** Ana uygulamanın teması; içerik taraması admin/ ve paylaşılan bileşenler */
export default {
  ...base,
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{ts,tsx}', '../src/components/**/*.{ts,tsx}', '../src/lib/**/*.ts'],
  },
};
