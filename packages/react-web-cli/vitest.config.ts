import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true, // Ensure globals like expect are available
    environment: 'jsdom', // Set up a JSDOM environment for React components
    setupFiles: ['./src/test-setup.ts'], // Reverted path to the setup file in src
    watch: false, // Disable watch mode so `vitest` exits after running tests
  },
  resolve: {
    alias: {
      'react': path.resolve(__dirname, '../../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
    },
  },
}); 