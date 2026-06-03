import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Co-located unit tests live next to the code under src/.
    include: ["src/**/*.test.{ts,tsx}"],
    // Playwright owns e2e/; keep build + deps out of the unit run.
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});
