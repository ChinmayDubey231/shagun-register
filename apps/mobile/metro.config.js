// Expo's Metro config detects the npm workspace, so packages/shared resolves without extra setup.
const http = require('node:http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle migrations are imported as .sql files.
config.resolver.sourceExts.push('sql');

// Web preview only: expo-sqlite runs SQLite as WebAssembly and needs SharedArrayBuffer,
// which requires these cross-origin isolation headers. Android is unaffected.
// They're added where the dev server is created, not in server.enhanceMiddleware: Expo serves
// the root page ("/") from its own middleware ahead of that hook, so the preview opened at
// http://localhost:8081 would load without them and fail to open the database.
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm');
const createServer = http.createServer;
http.createServer = function (...args) {
  const server = createServer.apply(this, args);
  server.prependListener('request', (_req, res) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  });
  return server;
};

module.exports = config;
