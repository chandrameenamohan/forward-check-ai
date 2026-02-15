import { z } from "zod";
import dotenv from "dotenv";

export const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  GOOGLE_FACTCHECK_API_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_REPO_OWNER: z.string().default("chandrameenamohan"),
  GITHUB_REPO_NAME: z.string().default("forward-check-ai"),
  BASE_URL: z.string().optional(),
  PORT: z
    .string()
    .default("3000")
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  DATABASE_PATH: z.string().default("./data/forwardcheck.db"),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Load and validate environment configuration.
 * Pass a custom env record for testing; otherwise reads from process.env after loading .env file.
 */
export function loadEnv(env?: Record<string, string | undefined>): EnvConfig {
  if (!env) {
    dotenv.config();
  }
  const result = envSchema.parse(env ?? process.env);
  return result;
}
