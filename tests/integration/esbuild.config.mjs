import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["tests/integration/runner.ts"],
  bundle: true,
  outfile: "tests/integration/dist/runner.js",
  format: "cjs",
  platform: "node",
  target: "es2021",
  external: ["obsidian"],
  sourcemap: false,
  minify: false,
});

console.log("Integration test bundle built.");
