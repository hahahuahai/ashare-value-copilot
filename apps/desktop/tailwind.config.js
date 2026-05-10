/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stage: "var(--color-stage)",
        panel: "var(--color-panel)",
        panel2: "var(--color-panel2)",
        line: "var(--color-line)",
        ink: "var(--color-ink)",
        mute: "var(--color-mute)",
        red: {
          DEFAULT: "var(--color-red)",
          soft: "var(--color-red-soft)",
        },
        gold: "var(--color-gold)",
        jade: "var(--color-jade)",
        amber: "var(--color-amber)",
      },
    },
  },
  plugins: [],
};
