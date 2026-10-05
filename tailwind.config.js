/** @type {import('tailwindcss').Config} */
export default {
  // Thème choisi dans Paramètres > Apparence (classe « dark » sur <html>)
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}