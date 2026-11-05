import mongoose from 'mongoose';
import { createApp } from './app.js';
import { createGoogleVerifier } from './auth/google.js';
import { loadConfig } from './config.js';
import { purgeDeletedFamilies } from './deletion.js';
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

// Free hosts sleep when idle, so a timer alone might never fire: this also runs at every start.
const purge = () =>
  purgeDeletedFamilies().then(
    (count) => {
      if (count > 0) console.log(`Purged ${count} deleted ledger(s)`);
    },
    (e: unknown) => console.error('Purge failed:', e instanceof Error ? e.message : 'unknown'),
  );
void purge();
const purgeTimer = setInterval(() => void purge(), 24 * 60 * 60 * 1000);
purgeTimer.unref();

const shutdown = async () => {
  clearInterval(purgeTimer);
  server.close();
  await mongoose.disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
