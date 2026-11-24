import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DEMO_HEADER, updateSession } from "@/lib/supabase/middleware";

const req = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

afterEach(() => vi.unstubAllEnvs());

function noSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
}

describe("middleware demo bypass", () => {
  it("demo on: staff area is let through without a session", async () => {
    noSupabase();
    vi.stubEnv("MARA_DEMO", "1");
    for (const path of ["/review", "/deals/d0000000-0000-4000-8000-000000000001", "/deals", "/c/demo"]) {
      const res = await updateSession(req(path));
      expect(res.headers.get("location"), path).toBeNull();
      expect(res.headers.get(DEMO_HEADER)).toBe("1");
    }
  });

  it("demo off: staff area still redirects to /login (fails closed without Supabase)", async () => {
    noSupabase();
    vi.stubEnv("MARA_DEMO", "");
    const res = await updateSession(req("/review"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(res.headers.get(DEMO_HEADER)).toBeNull();
    const client = await updateSession(req("/c/demo"));
    expect(client.headers.get("location")).toBeNull();
  });

  it("demo refused in production: the middleware throws instead of letting anyone in", async () => {
    noSupabase();
    vi.stubEnv("MARA_DEMO", "1");
    vi.stubEnv("NODE_ENV", "production");
    await expect(updateSession(req("/review"))).rejects.toThrow(/Refusing to start in demo mode/);
  });
});
