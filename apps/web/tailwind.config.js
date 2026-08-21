/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0A0A0A',
          card: '#141414',
          hover: '#1E1E1E',
          border: 'rgba(255, 255, 255, 0.08)',
        },
        electric: {
          blue: '#4F6EF7',
          emerald: '#00C48C',
          purple: '#8B5CF6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
