import globals from 'globals';
// import tseslint from 'typescript-eslint'; // No longer need the combined import
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import eslintPluginN from 'eslint-plugin-n';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslint from '@eslint/js'; // Import base eslint config

export default [
  {
    // Globally ignores files
    ignores: ['dist/*', 'node_modules/*', 'coverage/*', '*.config.js', 'oclif.manifest.json', 'tmp/*'], // Added tmp/*
  },
  {
    // Base configuration for all JS/TS files
    files: ['**/*.{js,mjs,cjs,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node, // Use Node.js globals
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
        project: './tsconfig.json',
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
  // Prettier config must be last
  eslintConfigPrettier,
]; 