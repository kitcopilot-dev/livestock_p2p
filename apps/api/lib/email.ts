/**
 * Pluggable email provider for magic link delivery.
 *
 * AUTH_METHOD=magic_link activates this. In dev/demo, ConsoleEmailProvider
 * logs the link to stdout. In production, swap to ResendEmailProvider.
 */

export interface EmailProvider {
  sendMagicLink(to: string, token: string, baseUrl: string): Promise<void>;
  sendWelcome(to: string, name: string): Promise<void>;
  sendPasswordReset(to: string, token: string, baseUrl: string): Promise<void>;
}

/**
 * Logs the magic link to stdout — zero-dependency, ideal for dev and the demo
 * console where no SMTP relay is available.
 */
export class ConsoleEmailProvider implements EmailProvider {
  async sendMagicLink(to: string, token: string, baseUrl: string): Promise<void> {
    const url = `${baseUrl}/auth/verify/${token}`;
    console.log("\n" + "=".repeat(60));
    console.log(`  MAGIC LINK for ${to}`);
    console.log(`  ${url}`);
    console.log("=".repeat(60) + "\n");
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    console.log(`[Email] Welcome email sent to ${to} (name=${name})`);
  }

  async sendPasswordReset(to: string, token: string, baseUrl: string): Promise<void> {
    const url = `${baseUrl}/reset-password?token=${token}`;
    console.log("\n" + "=".repeat(60));
    console.log(`  PASSWORD RESET for ${to}`);
    console.log(`  ${url}`);
    console.log("=".repeat(60) + "\n");
  }
}

/**
 * Production provider — add `resend` package when deploying.
 * import { Resend } from "resend";
 * const resend = new Resend(process.env.RESEND_API_KEY);
 */
export class ResendEmailProvider implements EmailProvider {
  async sendMagicLink(to: string, token: string, baseUrl: string): Promise<void> {
    const url = `${baseUrl}/auth/verify/${token}`;
    // TODO: Replace with real Resend call when deploying:
    // await resend.emails.send({
    //   from: "noreply@livestockp2p.com",
    //   to,
    //   subject: "Sign in to Livestock P2P",
    //   html: `<p>Click <a href="${url}">here</a> to sign in. Link expires in 15 minutes.</p>`,
    // });
    console.log(`[Resend] Magic link email queued for ${to}: ${url}`);
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    console.log(`[Resend] Welcome email queued for ${to} (${name})`);
  }

  async sendPasswordReset(to: string, token: string, baseUrl: string): Promise<void> {
    const url = `${baseUrl}/reset-password?token=${token}`;
    // TODO: Replace with real Resend call when deploying:
    // await resend.emails.send({
    //   from: "noreply@livestockp2p.com",
    //   to,
    //   subject: "Reset your Livestock P2P password",
    //   html: `<p>Click <a href="${url}">here</a> to set a new password. Link expires in 1 hour.</p>`,
    // });
    console.log(`[Resend] Password reset email queued for ${to}: ${url}`);
  }
}

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  const kind = process.env.EMAIL_PROVIDER ?? "console";
  provider = kind === "resend" ? new ResendEmailProvider() : new ConsoleEmailProvider();
  return provider;
}
