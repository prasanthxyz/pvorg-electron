import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Tests share /tmp scratch folders and chmod them; keep files isolated but sequential.
    fileParallelism: false
  }
})
