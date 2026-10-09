/** Tailwind is compiled locally by the CLI (no runtime CDN). Colours are CSS variables so themes switch without a rebuild. */
module.exports = {
  content: ['./tools/build/**/*.mjs', './tools/lib/**/*.mjs', './src/**/*.{js,html}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        brand: 'var(--brand)',
        'brand-ink': 'var(--brand-ink)',
        accent: 'var(--accent)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      maxWidth: { prose: '46rem', page: '72rem' },
    },
  },
  plugins: [],
};
