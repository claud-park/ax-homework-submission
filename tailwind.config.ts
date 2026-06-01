import type { Config } from 'tailwindcss'

const config: Config = {
    darkMode: ['class'],
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',

  			/* FLO surface tokens */
  			'surface-primary': 'var(--surface-primary)',
  			'surface-secondary': 'var(--surface-secondary)',
  			'surface-tertiary': 'var(--surface-tertiary)',
  			'surface-minimal': 'var(--surface-minimal)',
  			'surface-alt': 'var(--surface-alt)',

  			/* FLO text tokens */
  			'text-primary': 'var(--text-primary)',
  			'text-secondary': 'var(--text-secondary)',
  			'text-tertiary': 'var(--text-tertiary)',
  			'text-disabled': 'var(--text-disabled)',
  			'text-inverse': 'var(--text-inverse)',

  			/* FLO icon tokens */
  			'icon-enabled': 'var(--icon-enabled)',
  			'icon-subtle': 'var(--icon-subtle)',
  			'icon-inactive': 'var(--icon-inactive)',
  			'icon-disabled': 'var(--icon-disabled)',

  			/* FLO interactive tokens */
  			'flo-accent': 'var(--accent)',
  			'static-accent': 'var(--static-accent)',
  			'blue-accent': 'var(--blue-600)',

  			/* FLO border tokens */
  			'border-flo': 'var(--border)',
  			'border-subtle': 'var(--border-subtle)',
  			'border-selected': 'var(--border-selected)',

  			/* FLO component tokens */
  			'button-neutral': 'var(--button-neutral)',
  			'modal-bg': 'var(--modal-background)',

  			/* FLO status tokens */
  			error: 'var(--error)',
  			info: 'var(--info)',
  			success: 'var(--success)',
  			amber: 'var(--amber)',

  			/* shadcn/ui tokens */
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		fontFamily: {
  			sans: [
  				'Pretendard',
  				'Apple SD Gothic Neo',
  				'system-ui',
  				'sans-serif'
  			]
  		},
  		/* FLO Typography Scale
  		 * h50(40/48) h100(28/36) h200(24/32) h300(20/28) h400(18/24)
  		 * body1(16/22) body2(14/20) caption1(12/18) caption2(10/12)
  		 */
  		fontSize: {
  			'flo-h50':      ['2.5rem',    { lineHeight: '3rem' }],
  			'flo-h100':     ['1.75rem',   { lineHeight: '2.25rem' }],
  			'flo-h200':     ['1.5rem',    { lineHeight: '2rem' }],
  			'flo-h300':     ['1.25rem',   { lineHeight: '1.75rem' }],
  			'flo-h400':     ['1.125rem',  { lineHeight: '1.5rem' }],
  			'flo-body1':    ['1rem',      { lineHeight: '1.375rem' }],
  			'flo-body2':    ['0.875rem',  { lineHeight: '1.25rem' }],
  			'flo-caption1': ['0.75rem',   { lineHeight: '1.125rem' }],
  			'flo-caption2': ['0.625rem',  { lineHeight: '0.75rem' }],
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		/* FLO Shadow Tokens */
  		boxShadow: {
  			'flo-s':  'var(--shadow-s)',
  			'flo-m':  'var(--shadow-m)',
  			'flo-l':  'var(--shadow-l)',
  			'flo-xl': 'var(--shadow-xl)',
  		},
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
export default config
