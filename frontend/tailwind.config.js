/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          from: '#89dba8',
          to: '#a8d97a',
          50: '#f0fdf4',
          100: '#89dba8',
          200: '#a8d97a',
          300: '#6bcf94',
          400: '#89dba8',
          500: '#3db87a',
          600: '#2d9b60',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(to right, #89dba8, #a8d97a)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
