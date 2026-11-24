import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/routes";
import { getOpenLogin, getSupabaseEnv, isDemoMode, SUPABASE_NOT_CONFIGURED } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { Welcome, type WelcomeStart } from "./welcome";

const ERRORS: Record<string, string> = {
  config: SUPABASE_NOT_CONFIGURED,
  callback: "That sign-in link is invalid or has expired. Request a new one.",
};

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Shared by `/` and `/login`. Signed-in staff skip straight to `next`. */
export async function renderWelcome(searchParams: SearchParams, defaultStart: WelcomeStart) {
  const params = await searchParams;
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const next = safeNextPath(str("next"));
  const errorKey = str("error");
  const demo = isDemoMode();

  if (!demo && getSupabaseEnv() !== null) {
    const supabase = await createClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (user) redirect(next);
  }

  const role = str("role");
  // Sent here by the middleware (next=… or error=…): skip the intro and open the agent card.
  const start: WelcomeStart = role === "client" ? "client" : role === "agent" || str("next") || errorKey ? "agent" : defaultStart;
  const notice = errorKey ? ERRORS[errorKey] : !demo && getSupabaseEnv() === null ? SUPABASE_NOT_CONFIGURED : undefined;

  return <Welcome start={start} demo={demo} openLogin={getOpenLogin() !== null} next={next} notice={notice} />;
}

