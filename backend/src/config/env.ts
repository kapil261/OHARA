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
  ML_HEALTH_TIMEOUT_MS: z.coerce.number().default(1500),

  BHASHINI_USER_ID: z.string().optional(),
  BHASHINI_API_KEY: z.string().optional(),
  BHASHINI_PIPELINE_ID: z.string().default('64392f96daac500b55c543cd'),

  // SMS via MSG91 (DLT-approved Flow templates). Blank = SMS disabled.
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
  MSG91_OTP_TEMPLATE_ID: z.string().optional(),
  MSG91_ALERT_TEMPLATE_ID: z.string().optional(),

  // Reminder escalation ladder, minutes after the reminder is due.
  REPEAT_AFTER_MIN: z.coerce.number().default(10),
  MISSED_AFTER_MIN: z.coerce.number().default(30),
  SMS_AFTER_MIN: z.coerce.number().default(45),
  EMAIL_AFTER_MIN: z.coerce.number().default(45),
  MAX_SNOOZES: z.coerce.number().int().min(0).default(2),
  // Raise a "phone offline" alert after this many hours without contact.
  DEVICE_SILENT_HOURS: z.coerce.number().default(48),
  // Days a deleted patient can be restored before everything is purged.
  DELETE_GRACE_DAYS: z.coerce.number().default(30),
  ENABLE_JOBS: bool(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

// Production must fail fast on unsafe config instead of running half-secured.
const prodErrors: string[] = [];
if (isProd) {
  if (env.JWT_SECRET.startsWith('dev-only') || env.JWT_SECRET.length < 32) prodErrors.push('JWT_SECRET must be set to at least 32 characters.');
  if (env.ML_URL && (!env.ML_API_KEY || env.ML_API_KEY.startsWith('dev-only'))) prodErrors.push('ML_API_KEY must be set when ML_URL is configured.');
  // Without a delivery channel nobody can receive a sign-in code, and the dev console fallback would leak codes into logs.
  if (!env.SMTP_HOST && !env.MSG91_AUTH_KEY) prodErrors.push('SMTP_HOST or MSG91_AUTH_KEY must be set in production (sign-in codes need a delivery channel).');
  if (!env.DATABASE_URL) prodErrors.push('DATABASE_URL must be set in production.');
}
if (prodErrors.length) {
  console.error(`Refusing to start in production:\n- ${prodErrors.join('\n- ')}`);
  process.exit(1);
}

export const features = {
  smtp: Boolean(env.SMTP_HOST),
  cloudinary: Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET),
  push: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  bhashini: Boolean(env.BHASHINI_USER_ID && env.BHASHINI_API_KEY),
  ml: Boolean(env.ML_URL),
  sms: Boolean(env.MSG91_AUTH_KEY && env.MSG91_OTP_TEMPLATE_ID),
};
