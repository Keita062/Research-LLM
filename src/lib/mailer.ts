import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const EMAIL_MODE = process.env.EMAIL_MODE ?? "console";

let gmailTransport: Transporter | null = null;
function getGmailTransport(): Transporter {
  if (!gmailTransport) {
    gmailTransport = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return gmailTransport;
}

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  consoleLabel: string;
};

/**
 * Sends an email respecting EMAIL_MODE. In "console" mode it just logs the content
 * (used for local dev without Gmail credentials). In "gmail" mode it sends via Gmail
 * SMTP with a small retry helper. Never throws — failures are logged only, per NFR-04,
 * so the calling Server Action still succeeds.
 */
async function sendEmail({ to, subject, html, consoleLabel }: SendArgs): Promise<void> {
  if (EMAIL_MODE !== "gmail") {
    console.log(`[mailer] (console mode) ${consoleLabel} -> ${to}`);
    console.log(html);
    return;
  }

  const maxAttempts = 3; // initial attempt + 2 retries
  const backoffMs = [250, 750];
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await getGmailTransport().sendMail({
        from: process.env.GMAIL_FROM_EMAIL ?? process.env.GMAIL_USER,
        to,
        subject,
        html,
      });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
      }
    }
  }

  console.error(
    `[mailer] failed to send "${consoleLabel}" to ${to} after ${maxAttempts} attempts:`,
    lastError
  );
}

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const url = `${APP_URL}/verify-email?token=${token}`;
  console.log(`[mailer] verification link: ${url}`);

  const html = `
    <div style="font-family: sans-serif; line-height: 1.6;">
      <h2>研究室LLMチャットボット - メールアドレスの確認</h2>
      <p>アカウント作成ありがとうございます。以下のリンクをクリックしてメールアドレスの確認を完了してください。</p>
      <p><a href="${url}">${url}</a></p>
      <p>このリンクの有効期限は24時間です。心当たりがない場合は、このメールを破棄してください。</p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: "【研究室LLMチャットボット】メールアドレスの確認",
    html,
    consoleLabel: `verification link: ${url}`,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  const url = `${APP_URL}/reset-password?token=${token}`;
  console.log(`[mailer] password reset link: ${url}`);

  const html = `
    <div style="font-family: sans-serif; line-height: 1.6;">
      <h2>研究室LLMチャットボット - パスワード再設定</h2>
      <p>パスワード再設定のリクエストを受け付けました。以下のリンクから新しいパスワードを設定してください。</p>
      <p><a href="${url}">${url}</a></p>
      <p>このリンクの有効期限は1時間です。心当たりがない場合は、このメールを破棄してください。</p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: "【研究室LLMチャットボット】パスワード再設定",
    html,
    consoleLabel: `password reset link: ${url}`,
  });
}

export async function sendPasswordChangedEmail(email: string): Promise<void> {
  console.log(`[mailer] password changed notification -> ${email}`);

  const html = `
    <div style="font-family: sans-serif; line-height: 1.6;">
      <h2>研究室LLMチャットボット - パスワード変更完了</h2>
      <p>アカウント（${email}）のパスワードが変更されました。</p>
      <p>心当たりがない場合は、至急管理者にご連絡ください。</p>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: "【研究室LLMチャットボット】パスワードが変更されました",
    html,
    consoleLabel: "password changed notification",
  });
}
