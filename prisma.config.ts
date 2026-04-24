import { defineConfig, env } from '@prisma/config';

export default defineConfig({
  datasource: {
    url: env('DATABASE_URL') || env('TEST_DATABASE_URL'),
  },
});
