import { describe, expect, it } from "vitest";
import { magicLinkSchema, passwordLoginSchema } from "@/lib/validation/auth";

describe("passwordLoginSchema", () => {
  it("accepts a valid email + password and normalises the email", () => {
    const r = passwordLoginSchema.parse({ email: "  Agent@CedarStone.example ", password: "correct-horse" });
    expect(r.email).toBe("agent@cedarstone.example");
    expect(r.next).toBe("/review");
  });

  it("rejects a bad email", () => {
    const r = passwordLoginSchema.safeParse({ email: "not-an-email", password: "correct-horse" });
    expect(r.success).toBe(false);
  });

  it("rejects a short or missing password", () => {
    expect(passwordLoginSchema.safeParse({ email: "a@b.co", password: "short" }).success).toBe(false);
    expect(passwordLoginSchema.safeParse({ email: "a@b.co" }).success).toBe(false);
  });

  it("keeps a relative next path but drops open redirects", () => {
    const ok = passwordLoginSchema.parse({ email: "a@b.co", password: "correct-horse", next: "/deals/abc" });
    expect(ok.next).toBe("/deals/abc");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "deals"]) {
      expect(passwordLoginSchema.parse({ email: "a@b.co", password: "correct-horse", next: bad }).next).toBe("/review");
    }
  });
});

describe("magicLinkSchema", () => {
  it("needs only an email", () => {
    expect(magicLinkSchema.safeParse({ email: "tc@cedarstone.example" }).success).toBe(true);
    expect(magicLinkSchema.safeParse({ email: "" }).success).toBe(false);
  });
});
