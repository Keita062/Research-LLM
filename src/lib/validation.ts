import { z } from "zod";

/**
 * FR-09: パスワードは最小10文字、かつ英字・数字をそれぞれ1文字以上含むこと。
 */
export const passwordRule = z
  .string()
  .min(10, "パスワードは10文字以上で入力してください。")
  .regex(/[A-Za-z]/, "パスワードには英字を1文字以上含めてください。")
  .regex(/[0-9]/, "パスワードには数字を1文字以上含めてください。");

export const emailRule = z
  .string()
  .min(1, "メールアドレスを入力してください。")
  .email("メールアドレスの形式が正しくありません。");

export const signupSchema = z.object({
  email: emailRule,
  name: z
    .string()
    .min(1, "氏名を入力してください。")
    .max(100, "氏名は100文字以内で入力してください。"),
  password: passwordRule,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailRule,
  password: z.string().min(1, "パスワードを入力してください。"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "現在のパスワードを入力してください。"),
    newPassword: passwordRule,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "新しいパスワードは現在のパスワードと異なるものにしてください。",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const requestPasswordResetSchema = z.object({
  email: emailRule,
});
export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetSchema
>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "トークンが不正です。"),
  newPassword: passwordRule,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
