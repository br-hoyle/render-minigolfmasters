/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        forest: '#135D40',
        emerald: '#079E78',
        silver: '#E0E1E5',
        cream: '#F3F4EE',
        yellow: '#FBF50D',
        red: '#CC0131',
      },
      fontFamily: {
        display: ['"League Spartan"', 'sans-serif'],
        body: ['Montserrat', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
