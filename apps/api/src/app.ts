import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import type { GoogleVerifier } from './auth/google.js';
import { AppError, errorBody } from './errors.js';
import { cors } from './middleware.js';
import { authRoutes } from './routes/auth.js';
import { familyRoutes } from './routes/families.js';

export interface AppOptions {
  accessSecret: string;
  verifyGoogle: GoogleVerifier;
  devLogin?: boolean;
  corsOrigins?: string[];
  /** Off in tests that make many requests. */
  rateLimits?: boolean;
  /** Request log: method, path, status, time. Never bodies, which carry names and amounts. */
  log?: (line: string) => void;
}

/**
 * Builds the Express app without listening, so tests can drive it with supertest.
 * Week 4 adds /sync/push and /sync/pull.
 */
export function createApp(opts: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  // Render (and most hosts) sit behind one proxy; needed for per-IP rate limits.
  app.set('trust proxy', 1);
  app.use(cors(opts.corsOrigins ?? []));
  app.use(express.json({ limit: '1mb' }));

  if (opts.log) {
    const log = opts.log;
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`));
      next();
    });
  }

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'shagun-register-api' });
  });

  const rateLimits = opts.rateLimits ?? true;
  app.use(authRoutes({ accessSecret: opts.accessSecret, verifyGoogle: opts.verifyGoogle, devLogin: !!opts.devLogin, rateLimits }));
  app.use(familyRoutes({ accessSecret: opts.accessSecret, rateLimits }));

  const notFound: RequestHandler = (req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
  };
  app.use(notFound);

  // Every error leaves the API in one shape: { error: { code, message } }.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.status).json(errorBody(err.code, err.message));
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json(errorBody('BAD_JSON', 'Request body is not valid JSON'));
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json(errorBody('VALIDATION', 'Request body is too large'));
      return;
    }
    console.error('Unhandled error:', err instanceof Error ? `${err.name}: ${err.message}` : 'unknown');
    res.status(500).json(errorBody('INTERNAL', 'Something went wrong'));
  };
  app.use(onError);

  return app;
}
