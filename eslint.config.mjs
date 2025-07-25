// @ts-check

import { globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  globalIgnores(["dist/"]),
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["eslint.config.mjs", "lint-staged.config.mjs", "vite.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
