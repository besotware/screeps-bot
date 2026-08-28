/**
 * Bundle src/main.ts into the single dist/main.js the Screeps API expects.
 *
 * Screeps loads main.js as CommonJS and calls module.exports.loop() once per
 * tick, so the output format is cjs regardless of how the sources are written.
 */

import { build } from "esbuild";
import { readFile, stat } from "node:fs/promises";

const OUTFILE = "dist/main.js";

const result = await build({
  entryPoints: ["src/main.ts"],
  outfile: OUTFILE,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  // Screeps charges CPU for parsing, and the in-game editor is unusable on
  // minified code. Keep it readable; the bundle is small either way.
  minify: false,
  sourcemap: false,
  treeShaking: true,
  logLevel: "info",
  metafile: true,
});

const { size } = await stat(OUTFILE);
const source = await readFile(OUTFILE, "utf8");

// A bundle Screeps cannot call is a build failure, not a warning. Catching it
// here means the CI job fails on a broken contract rather than the private
// server failing silently ten minutes later.
if (!/module\.exports\b/.test(source) || !/\bloop\b/.test(source)) {
  console.error(`ERROR: ${OUTFILE} does not export a loop symbol.`);
  process.exit(1);
}

const inputCount = Object.keys(result.metafile.inputs).length;
console.log(`\n${OUTFILE}: ${size} bytes from ${inputCount} modules`);
