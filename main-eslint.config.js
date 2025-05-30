import globals from "globals";
// import tseslint from 'typescript-eslint'; // No longer need the combined import
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import eslintPluginN from "eslint-plugin-n";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import eslintConfigPrettier from "eslint-config-prettier";
import eslint from "@eslint/js"; // Import base eslint config
// import mochaGlobals from 'eslint-plugin-mocha/lib/configs/globals.js'; // Import mocha globals
import eslintPluginMocha from "eslint-plugin-mocha"; // Import the plugin

export default [
  {
    // Globally ignores files
    ignores: [
      "**/dist/**",
      "**/lib/**",
      "**/node_modules/**",
      "**/coverage/**",
      "*.config.js",
      "examples/**", // Ignore all files in examples directory
      "docs/workplans/resources/**", // Ignore resource TSX used for documentation
      "oclif.manifest.json",
      "**/tmp/**",
      "**/.nyc_output/**",
      "**/tsconfig.tsbuildinfo",
      "**/*.d.ts",
      "scripts/postinstall-welcome.ts",
      "node_modules/xterm/**",
      "packages/react-web-cli/dist/index.js",
      "packages/react-web-cli/dist/index.mjs",
      "bin/", // Added from .eslintrc.cjs
    ], // Updated to match all ignorePatterns from .eslintrc.json
  },
  {
    // Base configuration for all JS/TS files
    files: ["**/*.{js,mjs,cjs,ts}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node, // Use Node.js globals
        // Add NodeJS global for scripts that might need it (though prefer importing types)
        NodeJS: "readonly",
      },
    },
    plugins: {
      n: eslintPluginN,
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      // Base ESLint recommended rules
      ...eslint.configs.recommended.rules,
      // Node plugin recommended rules
      ...eslintPluginN.configs["flat/recommended-module"].rules,
      // Unicorn plugin recommended rules
      ...eslintPluginUnicorn.configs.recommended.rules,
      // Disable noisy stylistic rules for now
      "unicorn/no-null": "off",
      "unicorn/no-array-for-each": "off",
      "unicorn/no-for-loop": "off",
      "unicorn/prefer-string-raw": "off",
      "unicorn/no-object-as-default-parameter": "off",
      "unicorn/import-style": "off",
      "unicorn/prefer-ternary": "off",
      // Rules from .eslintrc.json
      "unicorn/no-process-exit": "off",
      "n/no-process-exit": "off",
      "n/no-unsupported-features/node-builtins": "off",
    },
  },
  {
    // Configuration specific to TypeScript files
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tsPlugin, // Use the imported plugin object
    },
    languageOptions: {
      parser: tsParser, // Use the imported parser object
      parserOptions: {
        project: "./tsconfig.eslint.json",
      },
    },
    rules: {
      // Use rules from the imported plugin object
      ...tsPlugin.configs.recommended.rules,
      // Your custom rules from .eslintrc.json
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Add other TS specific rules or overrides here
      "unicorn/prefer-module": "off",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/numeric-separators-style": "off",
    },
  },
  {
    // Configuration for React Web CLI package
    files: ["packages/react-web-cli/**/*"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "unicorn/prefer-module": "off",
      "unicorn/no-negated-condition": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
  {
    // Configuration for the standalone terminal-server script (large, experimental – allow relaxed typing)
    files: ["scripts/terminal-server.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "unicorn/prefer-optional-catch-binding": "off",
    },
  },
  {
    // Configuration specific to test files
    files: ["test/**/*.test.ts"],
    plugins: {
      mocha: eslintPluginMocha,
    },
    languageOptions: {
      globals: {
        ...globals.mocha,
        describe: "readonly",
        it: "readonly",
        before: "readonly",
        after: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
    rules: {
      // Apply recommended mocha rules which include globals
      ...eslintPluginMocha.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "mocha/no-exclusive-tests": "error",
      "mocha/no-skipped-tests": "warn",
    },
  },
  // Configuration for MCP files with ModelContextProtocol SDK imports
  {
    files: ["src/mcp/**/*.ts"],
    rules: {
      "n/no-missing-import": "off"
    }
  },
  // Prettier config must be last
  eslintConfigPrettier,
  {
    // Playwright browser E2E tests – allow browser globals and silence node-specific rules
    files: ["test/e2e/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "unicorn/prefer-global-this": "off",
      "no-undef": "off",
      "unicorn/prefer-optional-catch-binding": "off",
      "unicorn/catch-error-name": "off",
      "n/no-missing-import": "off",
    },
  },
];
