import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.ts'], env: { NODE_ENV: 'test', ADMIN_API_KEY: 'test-key', DB_PATH: ':memory:' } } })
