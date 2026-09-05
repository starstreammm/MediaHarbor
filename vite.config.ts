import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    watch: {
      ignored: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/api/**"],
    },
    port: 8888,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:38888",
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ""),
      },
    },
  },
});
