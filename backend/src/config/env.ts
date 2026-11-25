import 'dotenv/config';
import { z } from 'zod';

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  APP_URL: z.string().default('http://localhost:5173'),
  DEFAULT_TIMEZONE: z.string().default('Asia/Kolkata'),

  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),

  JWT_SECRET: z.string().default('dev-only-insecure-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().default(30),
  DEVICE_TOKEN_DAYS: z.coerce.number().default(180),
  OTP_TTL_MIN: z.coerce.number().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('OHARA <no-reply@example.com>'),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('ohara'),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),

  // Blank = ML service not deployed; the backend uses its local heuristics.
  ML_URL: z.string().optional(),
  ML_TIMEOUT_MS: z.coerce.number().default(3000),
  ML_API_KEY: z.string().optional(),

  BHASHINI_USER_ID: z.string().optional(),
  BHASHINI_API_KEY: z.string().optional(),
  BHASHINI_PIPELINE_ID: z.string().default('64392f96daac500b55c543cd'),

  MISSED_AFTER_MIN: z.coerce.number().default(15),
  EMAIL_AFTER_MIN: z.coerce.number().default(30),
  ENABLE_JOBS: bool(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

if (isProd && env.JWT_SECRET.startsWith('dev-only')) {
  console.error('JWT_SECRET must be set in production.');
  process.exit(1);
}

if (isProd && Boolean(env.ML_URL) && (!env.ML_API_KEY || env.ML_API_KEY.startsWith('dev-only'))) {
  console.error('ML_API_KEY must be set in production when ML_URL is configured.');
  process.exit(1);
}

export const features = {
  smtp: Boolean(env.SMTP_HOST),
  cloudinary: Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
  push: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  bhashini: Boolean(env.BHASHINI_USER_ID && env.BHASHINI_API_KEY),
  ml: Boolean(env.ML_URL),
};
