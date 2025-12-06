/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          850: '#1f2937',
          950: '#0d1117',
        },
        cyber: {
          black: '#050505',
          dark: '#0a0a0f',
          gray: '#13131f',
          slate: '#1a1a2e',
        },
        neon: {
          blue: '#00f3ff',
          pink: '#ff00ff',
          purple: '#9d00ff',
          green: '#00ff9d',
        }
      },
      boxShadow: {
        'neon-blue': '0 0 5px theme("colors.neon.blue"), 0 0 20px theme("colors.neon.blue")',
        'neon-pink': '0 0 5px theme("colors.neon.pink"), 0 0 20px theme("colors.neon.pink")',
        'neon-purple': '0 0 5px theme("colors.neon.purple"), 0 0 20px theme("colors.neon.purple")',
        'glass': '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
      },
      backgroundImage: {
        'cyber-gradient': 'linear-gradient(to right bottom, #0a0a0f, #13131f)',
        'neon-gradient': 'linear-gradient(to right, #00f3ff, #9d00ff)',
      }
    },
  },
  plugins: [],
}
