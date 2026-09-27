import { defineConfig } from 'drizzle-kit'
import { DEV_DATABASE_URL } from './src/config'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? DEV_DATABASE_URL,
  },
})
