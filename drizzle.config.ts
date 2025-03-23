import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({
  path: '.env.local',
});

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: 'sqlite.db', // This is the default SQLite database file
  },
});
