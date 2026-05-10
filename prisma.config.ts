import { defineConfig } from '@prisma/config';
import { config } from 'dotenv';

config({ path: '.env.local', override: true });

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL || process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5432/opsiq_dev?schema=public',
  },
});
