import { defineConfig } from "vitest/config";
import * as path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Map the bare `obsidian` specifier to a local stub so test runs don't
      // try to load the upstream package (which ships only .d.ts, no runtime).
      // The real obsidian module is injected by Obsidian itself at plugin
      // load time; esbuild marks it `external` for production builds.
      obsidian: path.resolve(__dirname, "tests/__mocks__/obsidian.cjs"),
    },
  },
});
