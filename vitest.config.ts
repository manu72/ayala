import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify('test') },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/config/GameConfig.ts'],
    },
  },
})
