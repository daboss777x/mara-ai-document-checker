"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOpenLogin, getSiteUrl, isDemoMode, SUPABASE_NOT_CONFIGURED } from "@/lib/env";
import { safeNextPath } from "@/lib/auth/routes";
import { magicLinkSchema, passwordLoginSchema } from "@/lib/validation/auth";

export type LoginState = { status: "idle" | "error" | "sent"; message?: string };

function firstIssue(issues: { message: string }[]) {
  return issues[0]?.message ?? "Check the form and try again.";
}

export async function signInWithPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // Demo mode: no Supabase; the staff area runs as the demo user, so go straight in.
  if (isDemoMode()) redirect(safeNextPath(String(formData.get("next") ?? "")));

  // Open login: whatever was typed, sign in as the shared demo agent.
  const open = getOpenLogin();
  if (open) {
    const supabase = await createClient();
    if (!supabase) return { status: "error", message: SUPABASE_NOT_CONFIGURED };
    const { error } = await supabase.auth.signInWithPassword(open);
    if (error) return { status: "error", message: "The demo agent account couldn't sign in. Check DEMO_AGENT_EMAIL and DEMO_AGENT_PASSWORD." };
    redirect(safeNextPath(String(formData.get("next") ?? "")));
  }

  const parsed = passwordLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  if (!supabase) return { status: "error", message: SUPABASE_NOT_CONFIGURED };

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  // Don't reveal whether the email exists.
  if (error) return { status: "error", message: "That email and password don't match." };

  // TODO(Phase 1): write a 'user.signed_in' row to audit_log (needs Kwame's insert policy or a Mara call).
  redirect(parsed.data.next);
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (isDemoMode()) return { status: "sent", message: "Demo mode: no email is sent. Use Sign in to go straight in." };

  const parsed = magicLinkSchema.safeParse({
    email: formData.get("email"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error.issues) };

  const supabase = await createClient();
  if (!supabase) return { status: "error", message: SUPABASE_NOT_CONFIGURED };

  const callback = new URL("/auth/callback", getSiteUrl());
  callback.searchParams.set("next", parsed.data.next);

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    // Staff accounts are created by a broker; never sign up strangers from the login page.
    options: { emailRedirectTo: callback.toString(), shouldCreateUser: false },
  });
  // Same message either way so the form can't be used to discover staff emails.
  if (error && error.status !== undefined && error.status >= 500) {
    return { status: "error", message: "We couldn't send the link. Try again in a minute." };
  }
  return { status: "sent", message: "If that email belongs to a staff account, a sign-in link is on its way." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
