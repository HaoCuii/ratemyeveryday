import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // relative asset paths so the build works on any host or sub-path (e.g. GitHub Pages)
  base: "./",
  plugins: [tailwindcss()],
});
