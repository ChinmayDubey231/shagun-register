import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extends app.json. Google Sign-In on Android needs no config plugin: it uses the web
 * client ID at runtime (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) plus your app's SHA-1 registered
 * in Google Cloud. The plugin is only needed for iOS, so it's added when the iOS URL
 * scheme is set.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const plugins = [...(config.plugins ?? [])];
  const iosUrlScheme = process.env.GOOGLE_IOS_URL_SCHEME;
  if (iosUrlScheme) plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  return { ...(config as ExpoConfig), plugins };
};
