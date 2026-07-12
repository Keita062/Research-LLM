"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { updateRateLimitConfig } from "@/lib/adminQueries";

/**
 * Toggles a user's isActive flag (FR-20). Re-derives the target's current
 * state from the DB rather than trusting a client-supplied "next" value.
 */
export async function toggleUserActiveAction(userId: string): Promise<void> {
  const admin = await requireAdmin();

  if (typeof userId !== "string" || userId.length === 0) {
    throw new Error("不正なユーザーIDです。");
  }

  if (userId === admin.id) {
    throw new Error("自分自身のアカウントを無効化することはできません。");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });
  if (!target) {
    throw new Error("指定されたユーザーが見つかりません。");
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { isActive: !target.isActive },
  });

  revalidatePath("/admin/users");
}

const rateLimitConfigSchema = z.object({
  globalRpmLimit: z.coerce.number().int().positive(),
  globalTpmLimit: z.coerce.number().int().positive(),
  globalRpdLimit: z.coerce.number().int().positive(),
  userDailyReqLimit: z.coerce.number().int().positive(),
  userDailyTokenLimit: z.coerce.number().int().positive(),
});

/**
 * Updates the single RateLimitConfig row (id=1) from the admin form (FR-16).
 * All five fields are required and validated as positive integers.
 */
export async function updateRateLimitConfigAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const parsed = rateLimitConfigSchema.safeParse({
    globalRpmLimit: formData.get("globalRpmLimit"),
    globalTpmLimit: formData.get("globalTpmLimit"),
    globalRpdLimit: formData.get("globalRpdLimit"),
    userDailyReqLimit: formData.get("userDailyReqLimit"),
    userDailyTokenLimit: formData.get("userDailyTokenLimit"),
  });

  if (!parsed.success) {
    throw new Error("入力値が不正です。すべての項目に正の整数を入力してください。");
  }

  await updateRateLimitConfig(parsed.data);
  revalidatePath("/admin/usage");
}
