/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0a0a0a",
        surface: "#111111",
        "surface-2": "#1a1a1a",
        border: "#1e1e1e",
        "border-2": "#2a2a2a",
        "text-1": "#ededed",
        "text-2": "#888888",
        "text-3": "#444444",
        accent: "#4f6ef7",
      },
      fontFamily: {
        mono: ["'Geist Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
