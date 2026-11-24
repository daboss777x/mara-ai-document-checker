import { z } from "zod";

/**
 * Environment for /web. Not `server-only`: the middleware (edge) and the browser Supabase
 * client import it too. Only NEXT_PUBLIC_* values ever reach the browser bundle, so on the
 * client `isDemoMode()` is always false; screens get the mode from the data layer instead.
 */

const flag = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).catch("development").default("development"),
  MARA_DEMO: flag,
  MARA_DEMO_ALLOW_PROD: flag,
  NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class DemoModeRefusedError extends Error {
  constructor() {
    super(
      "Refusing to start in demo mode: MARA_DEMO=1 with NODE_ENV=production. " +
        "Demo mode serves fictitious data and lets anyone into the staff area as the demo user. " +
        "Unset MARA_DEMO, or also set MARA_DEMO_ALLOW_PROD=1 for a deliberately hosted demo.",
    );
    this.name = "DemoModeRefusedError";
  }
}

type EnvSource = Record<string, string | undefined>;

/** Parse and validate the server env. Throws DemoModeRefusedError for demo mode in production. */
export function getServerEnv(source: EnvSource = process.env): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: source.NODE_ENV,
    MARA_DEMO: source.MARA_DEMO,
    MARA_DEMO_ALLOW_PROD: source.MARA_DEMO_ALLOW_PROD,
    // Empty strings count as unset.
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
    NEXT_PUBLIC_SITE_URL: source.NEXT_PUBLIC_SITE_URL || undefined,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment variables: ${fields}`);
  }
  const env = parsed.data;
  if (env.MARA_DEMO && env.NODE_ENV === "production" && !env.MARA_DEMO_ALLOW_PROD) {
    throw new DemoModeRefusedError();
  }
  return env;
}

/** True when MARA_DEMO=1. Throws (fails closed) when demo mode is refused in production. */
export function isDemoMode(source: EnvSource = process.env): boolean {
  return getServerEnv(source).MARA_DEMO;
}

/**
 * Public Supabase env. Returns null (instead of throwing) when it is missing, so the
 * build and every page can render a clear "not configured" error state.
 */
export type SupabaseEnv = { url: string; anonKey: string };

export function getSupabaseEnv(): SupabaseEnv | null {
  // Read process.env.NEXT_PUBLIC_* literally so Next inlines them in the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/**
 * Open login (hosted demo on real Supabase): any email and password sign in as one shared
 * demo agent. The real credentials are server-only env vars; RLS still applies to that user.
 */
export type OpenLogin = { email: string; password: string };

export function getOpenLogin(source: EnvSource = process.env): OpenLogin | null {
  const on = source.MARA_OPEN_LOGIN === "1" || source.MARA_OPEN_LOGIN === "true";
  const email = source.DEMO_AGENT_EMAIL;
  const password = source.DEMO_AGENT_PASSWORD;
  return on && email && password ? { email, password } : null;
}

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export const SUPABASE_NOT_CONFIGURED =
  "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";
