import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

await build({
  entryPoints: [join(appRoot, "src", "server.ts")],
  outfile: join(appRoot, "dist", "server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  // Keep native and Google Cloud packages in node_modules. In particular,
  // Sharp resolves its platform-specific libvips binary at runtime.
  external: ["@google-cloud/*", "@google/genai", "google-auth-library", "googleapis", "sharp"],
});
