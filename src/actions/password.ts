"use server";

import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { generateSecureToken, hashToken } from "@/lib/tokens";
import { sendPasswordChangedEmail, sendPasswordResetEmail } from "@/lib/mailer";
import { requireUser } from "@/lib/rbac";
import {
  changePasswordSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from "@/lib/validation";
import type { FormState } from "@/lib/formState";

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

function fieldErrorsFrom(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  const flat = error.flatten();
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(flat.fieldErrors)) {
    if (value && value.length > 0) out[key] = value;
  }
  return out;
}

export async function changePasswordAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "入力内容をご確認ください。",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) {
    return { status: "error", message: "アカウントが見つかりませんでした。" };
  }

  const currentOk = await verifyPassword(
    parsed.data.currentPassword,
    dbUser.passwordHash
  );
  if (!currentOk) {
    return {
      status: "error",
      message: "現在のパスワードが正しくありません。",
      fieldErrors: { currentPassword: ["現在のパスワードが正しくありません。"] },
    };
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  await sendPasswordChangedEmail(dbUser.email);

  return { status: "success", message: "パスワードを変更しました。" };
}

// FR-07: アカウントの存在有無に関わらず常に同一の一般的な成功メッセージを返す。
const GENERIC_RESET_REQUEST_RESPONSE: FormState = {
  status: "success",
  message:
    "対象のメールアドレスが登録されている場合、パスワード再設定用のリンクを送信しました。受信箱をご確認ください。",
};

export async function requestPasswordResetAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = requestPasswordResetSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "入力内容をご確認ください。",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (user) {
    // Invalidate any prior unused reset tokens before issuing a new one.
    await prisma.verificationToken.updateMany({
      where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null },
      data: { usedAt: new Date() },
    });

    const rawToken = generateSecureToken();
    const tokenHash = hashToken(rawToken);

    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        type: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await sendPasswordResetEmail(user.email, rawToken);
  }

  return GENERIC_RESET_REQUEST_RESPONSE;
}

export async function resetPasswordAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "入力内容をご確認ください。",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const { token, newPassword } = parsed.data;
  const tokenHash = hashToken(token);

  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash },
  });

  if (
    !record ||
    record.type !== "PASSWORD_RESET" ||
    record.usedAt !== null ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    return {
      status: "error",
      message:
        "リンクが無効か、有効期限が切れています。再度パスワード再設定をお試しください。",
    };
  }

  const newHash = await hashPassword(newPassword);

  const user = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash: newHash },
    });
    await tx.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return updatedUser;
  });

  await sendPasswordChangedEmail(user.email);

  return { status: "success", message: "パスワードを再設定しました。ログインしてください。" };
}
