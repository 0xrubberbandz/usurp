import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: { colors: { paper: '#FAFAF7', ink: '#101014', muted: '#8A8A93' } } },
  plugins: []
} satisfies Config;
