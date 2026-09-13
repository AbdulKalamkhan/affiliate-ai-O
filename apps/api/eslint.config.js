const tseslint = require("typescript-eslint");

module.exports = tseslint.config({
  files: ["**/*.ts"],
  ignores: ["dist/**", "node_modules/**", "coverage/**"],
  extends: [...tseslint.configs.recommended],
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
});