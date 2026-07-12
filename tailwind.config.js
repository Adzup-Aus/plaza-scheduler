/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Plaza brand (Reference/Company brand guide).
        plaza: {
          bluish: "#2c4045",
          maroon: "#7d013d",
          ink: "#161616",
          paper: "#f6f4f0",
          gold: "#d1ac65",
        },
        stage: {
          pre_work: "#8a94a6", stripout: "#b45309", rough_in: "#0369a1",
          carpentry: "#7c5e10", waterproofing: "#0e7490", tile_prep: "#4d7c0f",
          tiling: "#15803d", painting: "#7e22ce", fixture_install: "#1d4ed8",
          glass: "#0891b2", clean: "#4b5563", final_check: "#7d013d", cure: "#a1a1aa",
        },
      },
      fontFamily: {
        head: ['"Libre Baskerville"', "Georgia", "serif"],
        body: ['"Open Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
