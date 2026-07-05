import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the same build works locally and on GitHub Pages.
  base: "./",
  server: { port: 5173 },
});
