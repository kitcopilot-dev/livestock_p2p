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

/**
 * exe.dev email — the VM POSTs to a link-local gateway
 * (http://169.254.169.254/gateway/email/send). Plain text only, and
 * recipients are restricted to the VM owner, team members, and people who
 * have logged into a shared VM. Failures are logged but never thrown, so a
 * disallowed recipient or a down gateway can't turn a sign-in/reset request
 * into a 500 — the enumeration-safe "check your email" contract holds.
 */
export class ExeEmailProvider implements EmailProvider {
  private async send(to: string, subject: string, body: string): Promise<void> {
    try {
      const res = await fetch("http://169.254.169.254/gateway/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || json.error) {
        console.error(`[exe-email] delivery failed for ${to}: ${json.error ?? res.status}`);
        return;
      }
      console.log(`[exe-email] sent to ${to}: ${subject}`);
    } catch (err) {
      console.error(`[exe-email] send error for ${to}: ${(err as Error).message}`);
    }
  }

  async sendMagicLink(to: string, token: string, baseUrl: string): Promise<void> {
    const url = `${baseUrl}/auth/verify/${token}`;
    await this.send(
      to,
      "Sign in to Livestock P2P",
      `Click this link to sign in to Livestock P2P. It expires in 15 minutes:\n\n${url}`,
    );
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    await this.send(
      to,
      "Welcome to Livestock P2P",
      `Hi ${name || "there"},\n\nWelcome to Livestock P2P — your account is ready. Sign in at ${process.env.APP_URL ?? "https://livestock-p2p.exe.xyz"}.`,
    );
  }

  async sendPasswordReset(to: string, token: string, baseUrl: string): Promise<void> {
    const url = `${baseUrl}/reset-password?token=${token}`;
    await this.send(
      to,
      "Reset your Livestock P2P password",
      `Click this link to set a new password for your Livestock P2P account. It expires in 1 hour:\n\n${url}`,
    );
  }
}

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  const kind = process.env.EMAIL_PROVIDER ?? "console";
  if (kind === "resend") provider = new ResendEmailProvider();
  else if (kind === "exe") provider = new ExeEmailProvider();
  else provider = new ConsoleEmailProvider();
  return provider;
}
