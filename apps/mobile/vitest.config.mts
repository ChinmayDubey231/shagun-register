import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit and integration tests for code that runs the same in Node and on the phone
// (database layer, sync engine). Screen tests would use jest-expo.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
