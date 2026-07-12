/**
 * Shared shape returned by every auth/password Server Action so client forms can
 * render field errors / generic messages via useActionState.
 *
 * Lives outside src/actions/*.ts on purpose: Next.js only allows async function
 * exports from a "use server" file — a plain object/type export there fails the
 * production build ("A 'use server' file can only export async functions").
 */
export type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialFormState: FormState = { status: "idle" };
