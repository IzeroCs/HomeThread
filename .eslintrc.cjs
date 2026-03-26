module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
    browser: true,
  },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  settings: {
    "import/resolver": {
      typescript: {
        project: ["./frontend/tsconfig.json", "./backend/tsconfig.json"],
      },
    },
  },
  ignorePatterns: ["**/dist/**", "**/node_modules/**", "data/**"],
  overrides: [
    {
      files: ["frontend/src/**/*.{ts,tsx}"],
      parserOptions: {
        project: "./frontend/tsconfig.json",
        tsconfigRootDir: __dirname,
        sourceType: "module",
      },
      rules: {
        semi: ["error", "always"],
        indent: ["error", 2, { SwitchCase: 1 }],
        "import/order": [
          "error",
          {
            groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
            alphabetize: { order: "asc", caseInsensitive: true },
            "newlines-between": "always",
          },
        ],
        "no-restricted-imports": [
          "error",
          {
            patterns: ["../../*", "../../../*", "../../../../*"],
          },
        ],
      },
    },
    {
      files: ["backend/src/**/*.ts"],
      parserOptions: {
        project: "./backend/tsconfig.json",
        tsconfigRootDir: __dirname,
        sourceType: "module",
      },
      rules: {
        semi: ["error", "always"],
        indent: ["error", 2, { SwitchCase: 1 }],
        "import/order": [
          "error",
          {
            groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
            alphabetize: { order: "asc", caseInsensitive: true },
            "newlines-between": "always",
          },
        ],
        "no-restricted-imports": [
          "error",
          {
            patterns: ["../../*", "../../../*", "../../../../*"],
          },
        ],
      },
    },
  ],
};
