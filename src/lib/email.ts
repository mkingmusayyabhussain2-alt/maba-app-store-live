/**
 * Verification emails via the owner's own Gmail (SMTP, nodemailer).
 *
 * Why Gmail SMTP: no paid email service, no verified domain needed — the mail
 * goes out from the owner's Gmail, so it carries Google's SPF/DKIM and is far
 * less likely to land in spam than mail from an unknown sender. The Gmail
 * account needs a 16-character App Password (see README.md) — never the
 * normal Google password, and never typed into chat.
 *
 * Security rules:
 * - The code is NEVER returned by any API response and NEVER logged in
 *   production.
 * - DEV-ONLY fallback: when NODE_ENV !== 'production' and SMTP credentials
 *   are missing, the code is written to the console and appended to
 *   .dev-email-log.json (gitignored) so local development works without a
 *   real Gmail account. In production, missing SMTP config is a hard error.
 */
import nodemailer from 'nodemailer';
import { appendFileSync } from 'fs';
import { join } from 'path';

const DEV_LOG_FILE = '.dev-email-log.json';

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Send the 6-digit verification code. Subject carries the code, like
 * Google/Microsoft ("123456 is your ... verification code") so the user can
 * see it in the inbox preview. Body is plain: store name, big code, expiry —
 * no links, no attachments, no sales words (keeps it out of spam).
 */
export async function sendVerificationCode(email: string, code: string): Promise<void> {
  if (!smtpConfigured()) {
    if (isProduction()) {
      throw new Error('SMTP is not configured (SMTP_USER / SMTP_PASS missing).');
    }
    // DEV-ONLY fallback — clearly marked, never active in production.
    console.log(`[DEV ONLY — no SMTP configured] Verification code for ${email}: ${code}`);
    try {
      const entry = { email, code, created_at: new Date().toISOString() };
      appendFileSync(
        join(process.cwd(), DEV_LOG_FILE),
        JSON.stringify(entry) + '\n',
        'utf8',
      );
      console.log(`[DEV ONLY] Code also appended to ${DEV_LOG_FILE}`);
    } catch (e) {
      console.error(`[DEV ONLY] Could not write ${DEV_LOG_FILE}:`, e);
    }
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || '';
  const subject = `${code} is your MABA App Store verification code`;

  await transporter.sendMail({
    from,
    to: email,
    subject,
    text:
      `Assalamu alaikum,\n\n` +
      `Aap ka MABA App Store verification code hai:\n\n${code}\n\n` +
      `Ye code 10 minute ke liye valid hai. Ye code kisi se share na karen.\n\n` +
      `— MABA App Store`,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;line-height:1.6;margin:0;padding:24px;">
<p style="margin:0 0 12px;">Assalamu alaikum,</p>
<p style="margin:0 0 8px;">Aap ka <strong>MABA App Store</strong> verification code hai:</p>
<p style="font-size:36px;font-weight:700;letter-spacing:6px;margin:16px 0;color:#111;">${code}</p>
<p style="margin:0 0 8px;">Ye code <strong>10 minute</strong> ke liye valid hai. Ye code kisi se share na karen.</p>
<p style="margin:24px 0 0;color:#666;">— MABA App Store</p>
</body></html>`,
  });
}
