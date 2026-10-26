import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { AppError, errorBody } from './errors.js';

/**
 * Builds the Express app without listening, so tests can drive it with supertest.
 * Week 3 adds: /auth/google, /me, /families, /invites. Week 4 adds: /sync/push, /sync/pull.
 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'shagun-register-api' });
  });

  const notFound: RequestHandler = (req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
  };
  app.use(notFound);

  // Every error leaves the API in one shape: { error: { code, message } }.
  // Never log request bodies here: they can carry names and amounts.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.status).json(errorBody(err.code, err.message));
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json(errorBody('BAD_JSON', 'Request body is not valid JSON'));
      return;
    }
    console.error('Unhandled error:', err instanceof Error ? err.name + ': ' + err.message : 'unknown');
    res.status(500).json(errorBody('INTERNAL', 'Something went wrong'));
  };
  app.use(onError);

  return app;
}
