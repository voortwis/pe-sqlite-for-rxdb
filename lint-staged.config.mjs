// @ts-check

export default {
  "*.js": ["prettier --write"],
  "*.json": ["prettier --write"],
  "*.md": ["prettier --write"],
  "*.mjs": ["eslint", "prettier --write"],
  "*.ts": ["eslint", "prettier --write", "tsc --noEmit"],
  "*.yaml": ["prettier --write"],
};
