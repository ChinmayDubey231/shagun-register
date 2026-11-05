import { Platform } from 'react-native';
import { ApiError } from './api';

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

/** Dev-only email sign-in (the API must also have DEV_LOGIN=true). Never in a release build, whatever .env says. */
export const DEV_LOGIN = __DEV__ && (process.env.EXPO_PUBLIC_DEV_LOGIN === '1' || process.env.EXPO_PUBLIC_DEV_LOGIN === 'true');

/** Google sign-in needs the native module, so it works in development and release builds, not Expo Go or web. */
export const googleSignInAvailable = Platform.OS !== 'web' && WEB_CLIENT_ID.length > 0;

let configured = false;

/**
 * Shows Google's account picker and returns an ID token for POST /auth/google,
 * or null if the user backed out. The token's audience is the *web* client ID,
 * which is what the server checks.
 */
export async function getGoogleIdToken(): Promise<string | null> {
  if (!googleSignInAvailable) throw new ApiError('NOT_CONFIGURED', 'Google sign-in is not set up in this build');
  let mod: typeof import('@react-native-google-signin/google-signin');
  try {
    // Loaded lazily: in Expo Go the native module is missing and importing it would crash at startup.
    mod = await import('@react-native-google-signin/google-signin');
  } catch {
    throw new ApiError('NOT_CONFIGURED', 'Google sign-in needs the development build, not Expo Go');
  }
  const { GoogleSignin, isSuccessResponse } = mod;
  if (!configured) {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
    configured = true;
  }
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (!isSuccessResponse(res)) return null;
  if (!res.data.idToken) throw new ApiError('UNAUTHENTICATED', 'Google did not return an ID token. Check the web client ID.');
  return res.data.idToken;
}

/** After deleting an account: withdraws the access Google granted this app. Best effort. */
export async function googleRevokeAccess(): Promise<void> {
  if (!googleSignInAvailable) return;
  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    await GoogleSignin.revokeAccess();
  } catch {
    // not signed in with Google, or module missing
  }
}

/** Lets the next sign-in pick a different Google account. */
export async function googleSignOut(): Promise<void> {
  if (!googleSignInAvailable) return;
  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch {
    // not signed in with Google, or module missing
  }
}
