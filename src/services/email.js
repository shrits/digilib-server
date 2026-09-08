/**
 * Email service with pluggable providers.
 * Defaults to console logging in development when no provider is configured.
 */

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'console';
const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'noreply@digilib.local';

/**
 * Send an email. Falls back to console.log in dev.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (EMAIL_PROVIDER === 'console' || process.env.NODE_ENV === 'development') {
    console.log('────────────────────────────────────');
    console.log('📧 EMAIL (console provider)');
    console.log(`   To: ${to}`);
    console.log(`   From: ${FROM_ADDRESS}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body: ${text || html}`);
    console.log('────────────────────────────────────');
    return { success: true, provider: 'console' };
  }

  // Future: implement real providers (resend, sendgrid, smtp)
  console.warn(`Email provider "${EMAIL_PROVIDER}" not yet implemented. Email not sent.`);
  return { success: false, provider: EMAIL_PROVIDER };
}

/**
 * Send a welcome email to a newly registered user.
 */
export async function sendWelcomeEmail(user) {
  return sendEmail({
    to: user.email,
    subject: 'Welcome to DigiLib! 📚',
    text: `Hi ${user.name},\n\nWelcome to DigiLib — your online digital library!\n\nStart exploring our catalog and find your next great read.\n\nHappy reading!`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Welcome to DigiLib! 📚</h2>
        <p>Hi ${user.name},</p>
        <p>Welcome to <strong>DigiLib</strong> — your online digital library!</p>
        <p>Start exploring our catalog and find your next great read.</p>
        <p style="color: #888;">Happy reading!</p>
      </div>
    `,
  });
}

/**
 * Send a password reset email with a reset link.
 */
export async function sendPasswordResetEmail(user, resetToken) {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

  return sendEmail({
    to: user.email,
    subject: 'Reset your DigiLib password',
    text: `Hi ${user.name},\n\nYou requested a password reset. Use this link (valid for 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Reset your password</h2>
        <p>Hi ${user.name},</p>
        <p>You requested a password reset. Click the button below (valid for 1 hour):</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${resetUrl}" style="background: #4F46E5; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Reset Password
          </a>
        </p>
        <p style="color: #888; font-size: 14px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}
