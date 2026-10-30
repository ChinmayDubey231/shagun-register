import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../errors.js';

export interface GoogleIdentity {
  googleId: string;
  email: string;
  name: string;
}

export type GoogleVerifier = (idToken: string) => Promise<GoogleIdentity>;

/**
 * Verifies a Google ID token from the phone: signature, expiry, issuer, and that
 * the audience is one of our client IDs. Tests inject a fake verifier instead.
 */
export function createGoogleVerifier(clientIds: string[]): GoogleVerifier {
  const client = new OAuth2Client();
  return async (idToken) => {
    if (clientIds.length === 0) throw new AppError(503, 'INTERNAL', 'Google sign-in is not configured on the server');
    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientIds });
      payload = ticket.getPayload();
    } catch {
      throw new AppError(401, 'UNAUTHENTICATED', 'Google sign-in failed. Try again.');
    }
    if (!payload?.sub || !payload.email || payload.email_verified === false) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Google account email is not verified');
    }
    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      name: payload.name?.trim() || payload.email.split('@')[0]!,
    };
  };
}
