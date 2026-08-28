import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Screeps' console.log is the only logging channel there is.
      "no-console": "off",

      // Supply-chain relevant: these are the primitives that turn a data-only
      // dependency into code execution. Never wanted in this codebase.
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",

      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",
      eqeqeq: ["error", "always"],
    },
  },

  {
    // Tests deliberately construct partial fakes and cast through unknown, and
    // the runtime globals are untyped by design. Relaxing these here keeps the
    // rules meaningful in src/ instead of being switched off globally.
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  {
    // Build and config scripts run in Node, not in the Screeps sandbox.
    files: ["**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      // These files sit outside tsconfig's project graph; type-aware linting
      // would fail to resolve them.
      parserOptions: { projectService: false, project: false, program: null },
      globals: { console: "readonly", process: "readonly" },
    },
    rules: {
      // Must spread disableTypeChecked's rules, not replace them: a bare
      // `rules` key here shadows the ones the spread above turned off, and the
      // type-aware rules come back on for files with no type information.
      ...tseslint.configs.disableTypeChecked.rules,
      // A TypeScript rule applied to plain JavaScript, where there is no
      // annotation syntax to satisfy it.
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
);
