import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export const CURRENT_UNIT_INCLUDE = ["tests/**/*.test.{ts,tsx}"] as const;

export const RETIRED_UNIT_SUITES = [
  "tests/rpg-npc-glb-renderer.test.ts",
  "tests/rpg-town-scene-instancing.test.ts",
  "tests/rpg-town-details.test.ts",
  "tests/rpg-town-architecture.test.ts",
  "tests/rpg-town-draw-budget.test.ts",
  "tests/npc-patrol-motion.test.ts",
  "tests/rpg-bus-motion.test.ts",
  "tests/rpg-camera-collision.test.ts",
  "tests/rpg-town-scene-layout.test.ts",
  "tests/rpg-town-street-life.test.ts"
] as const;

export const ACTIVE_UNIT_EXCLUDES = [
  "tests/rpg-npc-glb-renderer.test.ts",
  "tests/npc-patrol-motion.test.ts",
  "tests/rpg-bus-motion.test.ts"
] as const;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: [...CURRENT_UNIT_INCLUDE],
    exclude: [...configDefaults.exclude, ...ACTIVE_UNIT_EXCLUDES],
    restoreMocks: true,
    clearMocks: true
  }
});
