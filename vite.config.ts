import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/lib.ts"),
      name: "sqlite-for-rxdb",
      formats: ["es"],
      fileName: "sqlite-for-rxdb",
    },
  },
  plugins: [dts({ rollupTypes: true })],
});
