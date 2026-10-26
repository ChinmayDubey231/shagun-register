// Expo's Metro config detects the npm workspace, so packages/shared resolves without extra setup.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle migrations are imported as .sql files.
config.resolver.sourceExts.push('sql');

// Web preview only: expo-sqlite runs SQLite as WebAssembly and needs SharedArrayBuffer,
// which requires these cross-origin isolation headers. Android is unaffected.
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm');
const enhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const enhanced = enhanceMiddleware ? enhanceMiddleware(middleware, metroServer) : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return enhanced(req, res, next);
  };
};

module.exports = config;
