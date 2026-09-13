const tseslint = require("typescript-eslint");

module.exports = tseslint.config({
  files: ["**/*.ts", "**/*.tsx"],
  ignores: ["node_modules/**", ".next/**", "next-env.d.ts"],
  extends: [...tseslint.configs.recommended],
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
});