import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/components/ui/**/*.{ts,tsx}"],
      exclude: ["src/components/ui/index.ts", "src/components/ui/Modal.tsx", "src/components/ui/Toast.tsx", "src/components/ui/Badge.tsx"],
    },
  },
});
