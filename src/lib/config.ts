import { z } from "zod/v4";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.url(),
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  NEXT_PUBLIC_APP_NAME: z.string().default("OpsIQ"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./uploads"),
  STORAGE_S3_BUCKET: z.string().optional(),
  STORAGE_S3_REGION: z.string().optional(),
  SCHEDULER_PROVIDER: z.enum(["in-memory", "redis", "database"]).default("in-memory"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof envSchema>;

let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (_config) return _config;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = z.prettifyError(result.error);
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  _config = result.data;
  return _config;
}

export function isProduction(): boolean {
  return getConfig().NODE_ENV === "production";
}

export function isStaging(): boolean {
  return getConfig().NODE_ENV === "staging";
}

export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === "development";
}
