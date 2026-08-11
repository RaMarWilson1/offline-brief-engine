import type { Config } from 'tailwindcss';

/**
 * Tokens mirror docs/DESIGN.md, sampled from the live site.
 * Three greens on warm grey paper. Do not add a fourth hue.
 */
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#DDDCD8',
        card: '#EFEEEA',
        forest: { DEFAULT: '#0D3221', hover: '#123F2A' },
        emerald: { DEFAULT: '#0AA96F', hover: '#0BBC7C' },
        moss: '#2C6249',
        chalk: '#F8FAFA',
      },
      borderColor: { hairline: 'rgb(13 50 33 / 0.14)' },
      fontFamily: {
        display: ['ConferenceEF', 'Figtree', 'system-ui', 'sans-serif'],
        body: ['ConferenceEF', 'Figtree', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '18px', tile: '12px' },
      // No shadow scale on purpose. Depth comes from the paper/card value step.
      boxShadow: { none: 'none' },
    },
  },
  plugins: [],
} satisfies Config;
