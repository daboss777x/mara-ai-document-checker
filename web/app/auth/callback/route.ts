import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

const callbackSchema = z.object({
  code: z.string().min(1).max(1000),
  next: z.string().max(2000).optional(),
});

/** Magic-link / PKCE callback: exchanges ?code= for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const parsed = callbackSchema.safeParse({
    code: searchParams.get("code") ?? undefined,
    next: searchParams.get("next") ?? undefined,
  });
  if (!parsed.success) return NextResponse.redirect(new URL("/login?error=callback", origin));

  const supabase = await createClient();
  if (!supabase) return NextResponse.redirect(new URL("/login?error=config", origin));

  const { error } = await supabase.auth.exchangeCodeForSession(parsed.data.code);
  if (error) return NextResponse.redirect(new URL("/login?error=callback", origin));

  return NextResponse.redirect(new URL(safeNextPath(parsed.data.next), origin));
}
