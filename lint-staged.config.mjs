// @ts-check

export default {
  "*.js": ["prettier --write"],
  "*.json": ["prettier --write"],
  "*.md": ["prettier --write"],
  "*.mjs": ["eslint", "prettier --write"],
  "*.ts": [
    "eslint",
    "prettier --write",
    // Call TypeScript compiler through a function to avoid getting a list of
    // files passed to it.
    // https://github.com/lint-staged/lint-staged/issues/825
    () => "tsc --noEmit",
  ],
  "*.yaml": ["prettier --write"],
};
