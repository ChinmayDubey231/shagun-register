import { defineConfig } from 'vitest/config';

// Unit tests for code that runs the same in Node and on the phone (the database layer).
// Screen tests would use jest-expo; they are not part of week 1.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
