import globals from 'globals';
// import tseslint from 'typescript-eslint'; // No longer need the combined import
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import eslintPluginN from 'eslint-plugin-n';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslint from '@eslint/js'; // Import base eslint config
// import mochaGlobals from 'eslint-plugin-mocha/lib/configs/globals.js'; // Import mocha globals
import eslintPluginMocha from 'eslint-plugin-mocha'; // Import the plugin

export default [
  {
    // Globally ignores files
    ignores: [
      '**/dist/**', 
      '**/lib/**',
      '**/node_modules/**', 
      '**/coverage/**', 
      '*.config.js',  
      'oclif.manifest.json', 
      '**/tmp/**',
      '**/.nyc_output/**',
      '**/tsconfig.tsbuildinfo',
      '**/*.d.ts',
      'node_modules/xterm/**',
      'packages/react-web-cli/dist/index.js',
      'packages/react-web-cli/dist/index.mjs'
    ], // Updated to match all ignorePatterns from .eslintrc.json
  },
  {
    // Base configuration for all JS/TS files
    files: ['**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node, // Use Node.js globals
        // Add NodeJS global for scripts that might need it (though prefer importing types)
        NodeJS: 'readonly', 
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
      ...eslintPluginN.configs['flat/recommended-module'].rules,
      // Unicorn plugin recommended rules
      ...eslintPluginUnicorn.configs.recommended.rules,
      // Disable noisy stylistic rules for now
      'unicorn/no-null': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-for-loop': 'off',
      'unicorn/prefer-string-raw': 'off',
      'unicorn/no-object-as-default-parameter': 'off',
      'unicorn/import-style': 'off',
      'unicorn/prefer-ternary': 'off',
      // Rules from .eslintrc.json
      'unicorn/no-process-exit': 'off',
      'n/no-process-exit': 'off',
      'n/no-unsupported-features/node-builtins': 'off'
    },
  },
  {
    // Configuration specific to TypeScript files
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tsPlugin, // Use the imported plugin object
    },
    languageOptions: {
      parser: tsParser, // Use the imported parser object
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
    },
    rules: {
      // Use rules from the imported plugin object
      ...tsPlugin.configs.recommended.rules,
      // Your custom rules from .eslintrc.json
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      // Add other TS specific rules or overrides here
      'unicorn/prefer-module': 'off', 
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/numeric-separators-style': 'off',
    },
  },
  {
    // Configuration for React Web CLI package
    files: ['packages/react-web-cli/**/*'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'unicorn/prefer-module': 'off',
    },
  },
  {
    // Configuration specific to test files
    files: ['test/**/*.test.ts'],
    plugins: {
      mocha: eslintPluginMocha,
    },
    languageOptions: {
      globals: {
        ...globals.mocha,
        describe: 'readonly',
        it: 'readonly',
        before: 'readonly',
        after: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    rules: {
      // Apply recommended mocha rules which include globals
      ...eslintPluginMocha.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'mocha/no-exclusive-tests': 'error',
      'mocha/no-skipped-tests': 'warn'
    }
  },
  // Prettier config must be last
  eslintConfigPrettier,
]; 