import mongoose from 'mongoose';
import { createApp } from './app.js';
import { createGoogleVerifier } from './auth/google.js';
import { loadConfig } from './config.js';
import { syncIndexes } from './models.js';
import { ensureSyncIndexes } from './sync.js';

const config = loadConfig();

await mongoose.connect(config.mongodbUri);
await syncIndexes();
await ensureSyncIndexes();

const app = createApp({
  accessSecret: config.jwtAccessSecret,
  verifyGoogle: createGoogleVerifier(config.googleClientIds),
  devLogin: config.devLogin,
  corsOrigins: config.corsOrigins,
  log: config.env === 'test' ? undefined : (line) => console.log(line),
});

const server = app.listen(config.port, () => {
  console.log(`Shagun Register API on :${config.port} (${config.env}${config.devLogin ? ', dev login ON' : ''})`);
});

const shutdown = async () => {
  server.close();
  await mongoose.disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
