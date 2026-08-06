/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ashara Mubaraka palette (from Figma mockup)
        forest: {
          900: '#0e2d21',
          800: '#15402f',
          700: '#1f5a44',
          600: '#2a6e54',
        },
        gold: {
          DEFAULT: '#c9a45c',
          light: '#e3cd96',
          dark: '#a8843e',
        },
        cream: {
          DEFAULT: '#fffdf8',
          50: '#f8f4ea',
          border: '#e7dfc9',
        },
        ink: {
          DEFAULT: '#313131',
          muted: '#5a6660',
          faint: '#8a938e',
        },
        // semantic status
        status: {
          green: '#2a6e54',
          amber: '#b9842e',
          blue: '#2f6db9',
        },
      },
      fontFamily: {
        serif: ['Marcellus', 'Georgia', 'serif'],
        sans: ['Mulish', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        btn: '0px 6px 18px -6px rgba(21,64,47,0.18), 0px 2px 6px 0px rgba(21,64,47,0.06)',
        card: '0 1px 3px rgba(21,64,47,0.06), 0 8px 24px -12px rgba(21,64,47,0.12)',
        sheet: '0 -8px 32px -8px rgba(14,45,33,0.25)',
      },
      backgroundImage: {
        'hero-forest': 'linear-gradient(180deg, #0e2d21 0%, #15402f 50%, #1f5a44 100%)',
        'btn-forest': 'linear-gradient(172deg, #1f5a44 0%, #15402f 100%)',
      },
      borderRadius: {
        card: '16px',
      },
    },
  },
  plugins: [],
}
