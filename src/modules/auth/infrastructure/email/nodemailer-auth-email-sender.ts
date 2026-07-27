import type { Transporter } from "nodemailer";
import type {
  AuthEmailSender,
  PasswordChangedEmail,
  PasswordResetEmail,
  VerificationEmail,
} from "../../application/ports/auth-email-sender.js";

export interface NodemailerAuthEmailSenderConfig {
  transporter: Transporter;
  from: string;
  productName: string;
  verificationUrl(token: string): string;
  passwordResetUrl(token: string): string;
}

export class NodemailerAuthEmailSender implements AuthEmailSender {
  constructor(private readonly config: NodemailerAuthEmailSenderConfig) {}

  async sendVerificationEmail(message: VerificationEmail): Promise<void> {
    const actionUrl = this.config.verificationUrl(message.token);

    await this.config.transporter.sendMail({
      from: this.config.from,
      to: message.email,
      subject: `Verify your ${this.config.productName} email`,
      text: [
        `Hello ${message.name},`,
        "",
        `Verify your email address by opening this link: ${actionUrl}`,
        `This link expires at ${message.expiresAt.toISOString()}.`,
        "",
        "If you did not create this account, you can ignore this message.",
      ].join("\n"),
      html: renderActionEmail({
        heading: "Verify your email address",
        greetingName: message.name,
        explanation: `Complete your ${this.config.productName} registration by verifying your email address.`,
        actionLabel: "Verify email",
        actionUrl,
        expiresAt: message.expiresAt,
        ignoredMessage: "If you did not create this account, you can ignore this message.",
      }),
    });
  }

  async sendPasswordResetEmail(message: PasswordResetEmail): Promise<void> {
    const actionUrl = this.config.passwordResetUrl(message.token);

    await this.config.transporter.sendMail({
      from: this.config.from,
      to: message.email,
      subject: `Reset your ${this.config.productName} password`,
      text: [
        `Hello ${message.name},`,
        "",
        `Reset your password by opening this link: ${actionUrl}`,
        `This link expires at ${message.expiresAt.toISOString()}.`,
        "",
        "If you did not request a password reset, you can ignore this message.",
      ].join("\n"),
      html: renderActionEmail({
        heading: "Reset your password",
        greetingName: message.name,
        explanation: `A password reset was requested for your ${this.config.productName} account.`,
        actionLabel: "Reset password",
        actionUrl,
        expiresAt: message.expiresAt,
        ignoredMessage: "If you did not request a password reset, you can ignore this message.",
      }),
    });
  }

  async sendPasswordChangedEmail(message: PasswordChangedEmail): Promise<void> {
    await this.config.transporter.sendMail({
      from: this.config.from,
      to: message.email,
      subject: `Your ${this.config.productName} password was changed`,
      text: [
        `Hello ${message.name},`,
        "",
        `Your password was changed at ${message.changedAt.toISOString()}.`,
        "All existing sessions have been signed out.",
        "",
        "If you did not make this change, contact support immediately.",
      ].join("\n"),
      html: renderNotificationEmail(message, this.config.productName),
    });
  }
}

interface ActionEmailTemplate {
  heading: string;
  greetingName: string;
  explanation: string;
  actionLabel: string;
  actionUrl: string;
  expiresAt: Date;
  ignoredMessage: string;
}

function renderActionEmail(template: ActionEmailTemplate): string {
  const safeUrl = escapeHtml(template.actionUrl);

  return `<!doctype html>
<html lang="en">
  <body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937">
    <main style="max-width:600px;margin:0 auto;padding:24px">
      <h1>${escapeHtml(template.heading)}</h1>
      <p>Hello ${escapeHtml(template.greetingName)},</p>
      <p>${escapeHtml(template.explanation)}</p>
      <p>
        <a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#fff;text-decoration:none;border-radius:6px">
          ${escapeHtml(template.actionLabel)}
        </a>
      </p>
      <p>This link expires at ${escapeHtml(template.expiresAt.toISOString())}.</p>
      <p>${escapeHtml(template.ignoredMessage)}</p>
      <p style="font-size:12px;color:#6b7280">If the button does not work, copy this URL: ${safeUrl}</p>
    </main>
  </body>
</html>`;
}

function renderNotificationEmail(message: PasswordChangedEmail, productName: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1f2937">
    <main style="max-width:600px;margin:0 auto;padding:24px">
      <h1>Password changed</h1>
      <p>Hello ${escapeHtml(message.name)},</p>
      <p>Your ${escapeHtml(productName)} password was changed at ${escapeHtml(message.changedAt.toISOString())}.</p>
      <p>All existing sessions have been signed out.</p>
      <p>If you did not make this change, contact support immediately.</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}
