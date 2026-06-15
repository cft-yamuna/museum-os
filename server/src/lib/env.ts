import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3401'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRY: z.string().default('24h'),
  STORAGE_PATH: z.string().default('./storage'),
  MQTT_URL: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:3402'),
  WOL_BROADCASTS: z.string().optional(),
  WOL_PORT: z.coerce.number().int().min(1).max(65535).default(9),
  // S3-compatible storage (optional — if S3_ENDPOINT is set, all S3 vars required)
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
}).refine(
  (data) => {
    if (data.S3_ENDPOINT) {
      return data.S3_REGION && data.S3_BUCKET && data.S3_ACCESS_KEY_ID && data.S3_SECRET_ACCESS_KEY;
    }
    return true;
  },
  { message: 'When S3_ENDPOINT is set, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are all required' }
);

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  // Production security check: JWT_SECRET must be strong
  if (result.data.NODE_ENV === 'production') {
    if (result.data.JWT_SECRET === 'change-me-in-production' || result.data.JWT_SECRET.length < 32) {
      console.error('FATAL: JWT_SECRET must be set to a strong secret (32+ chars) in production');
      process.exit(1);
    }
  }

  return result.data;
}

export const env = loadEnv();
