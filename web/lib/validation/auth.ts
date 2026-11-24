import { z } from "zod";
import { safeNextPath } from "@/lib/auth/routes";

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));
const next = z
  .string()
  .optional()
  .transform((v) => safeNextPath(v));

export const passwordLoginSchema = z.object({
  email,
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  next,
});

export const magicLinkSchema = z.object({
  email,
  next,
});

export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
