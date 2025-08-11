/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        black: "#000000",
        yellow: {
          DEFAULT: "#FFD600",
          400: "#FFD600",
          500: "#FFC400"
        },
        lightblue: {
          DEFAULT: "#B3E5FC"
        },
        golfgreen: {
          DEFAULT: "#2E7D32"
        }
      }
    },
  },
  plugins: [],
}

