import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  /** Signs the 15-minute access tokens. At least 32 random characters. */
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  /**
   * OAuth client IDs whose ID tokens we accept, comma-separated. For Android this is the
   * *web* client ID passed to GoogleSignin.configure({ webClientId }), because that is the
   * audience Google puts in the token. Add the iOS client ID when iOS ships.
   */
  GOOGLE_CLIENT_IDS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  /** Origins allowed to call the API from a browser (the Expo web preview). Native apps don't need this. */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)),
  /** Email-only sign-in for local development and emulators. Refused in production. */
  DEV_LOGIN: z
    .string()
    .default('false')
    .transform((s) => s === 'true' || s === '1'),
});

export type Config = {
  env: 'development' | 'test' | 'production';
  port: number;
  mongodbUri: string;
  jwtAccessSecret: string;
  googleClientIds: string[];
  corsOrigins: string[];
  devLogin: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${lines}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production' && e.DEV_LOGIN) {
    throw new Error('DEV_LOGIN must not be enabled in production');
  }
  if (e.NODE_ENV === 'production' && e.GOOGLE_CLIENT_IDS.length === 0) {
    throw new Error('GOOGLE_CLIENT_IDS is required in production');
  }
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    mongodbUri: e.MONGODB_URI,
    jwtAccessSecret: e.JWT_ACCESS_SECRET,
    googleClientIds: e.GOOGLE_CLIENT_IDS,
    corsOrigins: e.CORS_ORIGINS,
    devLogin: e.DEV_LOGIN,
  };
}
