import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/lib.ts"),
      name: "pe-sqlite-for-rxdb",
      formats: ["es"],
      fileName: "pe-sqlite-for-rxdb",
    },
    rollupOptions: {
      external: [
        // better-sqlite3 does not play well with the compiler.
        // Instead, include it as a dependency in your project.
        "better-sqlite3",
      ],
    },
  },
  plugins: [dts({ rollupTypes: true }), nodePolyfills()],
});
