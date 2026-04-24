import { defineConfig } from '@prisma/config';

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || 'file:./dev.db',
  },
});
