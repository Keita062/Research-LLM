"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from "@/lib/password";
import { generateSecureToken, hashToken } from "@/lib/tokens";
import { sendVerificationEmail } from "@/lib/mailer";
import { createSession } from "@/lib/session";
import { loginSchema, signupSchema } from "@/lib/validation";
import type { FormState } from "@/lib/formState";

// FR-05: ログイン失敗の理由（未登録／パスワード誤り／未確認／無効化）を一切
// 区別しない共通のエラーメッセージ。
const GENERIC_LOGIN_ERROR: FormState = {
  status: "error",
  message:
    "メールアドレスまたはパスワードが正しくないか、アカウントがまだご利用いただけません。",
};

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function fieldErrorsFrom(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  const flat = error.flatten();
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(flat.fieldErrors)) {
    if (value && value.length > 0) out[key] = value;
  }
  return out;
}

async function issueAndSendVerificationToken(userId: string, email: string) {
  const rawToken = generateSecureToken();
  const tokenHash = hashToken(rawToken);

  await prisma.verificationToken.create({
    data: {
      userId,
      tokenHash,
      type: "EMAIL_VERIFY",
      expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
    },
  });

  await sendVerificationEmail(email, rawToken);
}

export async function signupAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "入力内容をご確認ください。",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const { email, name, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name,
        passwordHash,
        role: "USER",
      },
    });

    await issueAndSendVerificationToken(user.id, user.email);

    return {
      status: "success",
      message:
        "確認メールを送信しました。メール内のリンクをクリックしてアカウントを有効化してください。",
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Do not confirm outright that the account exists; keep the message ambiguous.
      return {
        status: "error",
        message:
          "このメールアドレスのアカウントは既に存在する可能性があります。受信箱をご確認いただくか、ログインをお試しください。",
      };
    }
    throw err;
  }
}

export async function verifyEmailAction(token: string): Promise<FormState> {
  if (!token) {
    return {
      status: "error",
      message: "確認リンクが不正です。",
    };
  }

  const tokenHash = hashToken(token);
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash },
  });

  if (
    !record ||
    record.type !== "EMAIL_VERIFY" ||
    record.usedAt !== null ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    return {
      status: "error",
      message:
        "確認リンクが無効か、有効期限が切れています。再送をお試しください。",
    };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
    prisma.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return {
    status: "success",
    message: "メールアドレスの確認が完了しました。ログインしてください。",
  };
}

// FR-04: 常に同一の一般的な成功メッセージを返し、アカウントの有無を開示しない。
const GENERIC_RESEND_RESPONSE: FormState = {
  status: "success",
  message:
    "対象のメールアドレスが登録されている場合、確認メールを再送しました。受信箱をご確認ください。",
};

export async function resendVerificationAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    return { status: "error", message: "メールアドレスを入力してください。" };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (user && !user.emailVerifiedAt) {
    await prisma.verificationToken.updateMany({
      where: { userId: user.id, type: "EMAIL_VERIFY", usedAt: null },
      data: { usedAt: new Date() },
    });
    await issueAndSendVerificationToken(user.id, user.email);
  }

  return GENERIC_RESEND_RESPONSE;
}

export async function loginAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "入力内容をご確認ください。",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user) {
    // Timing-attack mitigation: always perform a bcrypt comparison even when the
    // account does not exist.
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    return GENERIC_LOGIN_ERROR;
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    return GENERIC_LOGIN_ERROR;
  }

  if (!user.emailVerifiedAt) {
    return GENERIC_LOGIN_ERROR;
  }

  if (!user.isActive) {
    return GENERIC_LOGIN_ERROR;
  }

  await createSession(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  redirect("/chat");
}
