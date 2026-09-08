import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

/**
 * Configure Passport with Google OAuth 2.0 strategy.
 * Only initializes if Google credentials are provided.
 */
export function configurePassport() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
          scope: ['profile', 'email'],
        },
        // Verification callback — we pass the profile through directly
        // and handle user creation/lookup in our controller
        (accessToken, refreshToken, profile, done) => {
          done(null, profile);
        }
      )
    );
  } else {
    console.warn('⚠️  Google OAuth not configured (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
  }

  // We're using JWTs in cookies, so passport serialization isn't needed,
  // but passport requires these to be defined
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((user, done) => done(null, user));
}

export default passport;
