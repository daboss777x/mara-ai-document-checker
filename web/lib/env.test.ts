import { describe, expect, it } from "vitest";
import { DemoModeRefusedError, getOpenLogin, getServerEnv, isDemoMode } from "@/lib/env";
import { clientItemChip } from "@/lib/data/labels";

describe("demo mode env", () => {
  it("is off unless MARA_DEMO=1", () => {
    expect(isDemoMode({ NODE_ENV: "development" })).toBe(false);
    expect(isDemoMode({ NODE_ENV: "development", MARA_DEMO: "0" })).toBe(false);
    expect(isDemoMode({ NODE_ENV: "development", MARA_DEMO: "1" })).toBe(true);
    expect(isDemoMode({ NODE_ENV: "test", MARA_DEMO: "true" })).toBe(true);
  });

  it("refuses demo mode in production", () => {
    expect(() => isDemoMode({ NODE_ENV: "production", MARA_DEMO: "1" })).toThrow(DemoModeRefusedError);
    expect(() => getServerEnv({ NODE_ENV: "production", MARA_DEMO: "1" })).toThrow(/MARA_DEMO_ALLOW_PROD=1/);
  });

  it("allows a hosted demo in production only with MARA_DEMO_ALLOW_PROD=1", () => {
    expect(isDemoMode({ NODE_ENV: "production", MARA_DEMO: "1", MARA_DEMO_ALLOW_PROD: "1" })).toBe(true);
  });

  it("production without demo mode is fine", () => {
    expect(isDemoMode({ NODE_ENV: "production" })).toBe(false);
    expect(isDemoMode({ NODE_ENV: "production", MARA_DEMO_ALLOW_PROD: "1" })).toBe(false);
  });
});

describe("getOpenLogin", () => {
  it("is on only with the flag and both demo agent credentials", () => {
    expect(getOpenLogin({})).toBeNull();
    expect(getOpenLogin({ MARA_OPEN_LOGIN: "1", DEMO_AGENT_EMAIL: "a@b.co" })).toBeNull();
    expect(getOpenLogin({ DEMO_AGENT_EMAIL: "a@b.co", DEMO_AGENT_PASSWORD: "pw-123456" })).toBeNull();
    expect(getOpenLogin({ MARA_OPEN_LOGIN: "1", DEMO_AGENT_EMAIL: "a@b.co", DEMO_AGENT_PASSWORD: "pw-123456" })).toEqual({
      email: "a@b.co",
      password: "pw-123456",
    });
  });
});

describe("clientItemChip", () => {
  it("tells the client when Mara has finished and the agent is reviewing", () => {
    expect(clientItemChip("checking").label).toBe("Being checked");
    expect(clientItemChip("checking", true).label).toBe("Checked · with your agent");
    expect(clientItemChip("done", true).label).toBe("Done");
  });
});
