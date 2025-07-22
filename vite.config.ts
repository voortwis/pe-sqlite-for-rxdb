import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { nodePolyfills } from "vite-plugin-node-polyfills";

type ModuleFormat = "es" | "cjs" | "umd" | "iife";

const libEntry = resolve(__dirname, "src/lib.ts");
const storageImplBetterSQLite3Entry = resolve(
  __dirname,
  "src/storage-impl-better-sqlite3.ts",
);

export default defineConfig({
  build: {
    lib: {
      entry: [libEntry, storageImplBetterSQLite3Entry],
      name: "pe-sqlite-for-rxdb",
      formats: ["es"],
      fileName: (format: ModuleFormat, entryName: string): string => {
        return `${entryName}.js`;
      },
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
