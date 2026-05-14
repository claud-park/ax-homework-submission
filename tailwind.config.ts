import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        'surface-primary': 'var(--surface-primary)',
        'surface-secondary': 'var(--surface-secondary)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-disabled': 'var(--text-disabled)',
        'blue-accent': 'var(--blue-600)',
        'border-subtle': 'var(--border-subtle)',
        error: 'var(--error)',
        success: 'var(--success)',
      },
      fontFamily: {
        sans: ['Pretendard', 'Apple SD Gothic Neo', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
