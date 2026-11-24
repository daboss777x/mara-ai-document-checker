import { afterEach, describe, expect, it, vi } from "vitest";
import { callMaraClient, camelizeKeys, signatureHeader, signBody, SIGNATURE_HEADER } from "@/lib/mara-client";

// Known vector from: python3 -c "import hmac,hashlib;print(hmac.new(b'test-secret',b'1700000000.{\"a\":1}',hashlib.sha256).hexdigest())"
const EXPECTED = "8cb2c3355fca388e9ac2caec004f4d5d7045d74937ab5faad61dc11682247a9f";

describe("signBody", () => {
  it("matches the Python HMAC-SHA256 vector for '<t>.<body>'", () => {
    expect(signBody("test-secret", '{"a":1}', 1700000000)).toBe(EXPECTED);
  });

  it("changes when the body, timestamp or secret changes", () => {
    expect(signBody("test-secret", '{"a":2}', 1700000000)).not.toBe(EXPECTED);
    expect(signBody("test-secret", '{"a":1}', 1700000001)).not.toBe(EXPECTED);
    expect(signBody("other-secret", '{"a":1}', 1700000000)).not.toBe(EXPECTED);
  });
});

describe("signatureHeader", () => {
  it("formats as t=<unix_seconds>,v1=<hex>", () => {
    const header = signatureHeader("test-secret", '{"a":1}', 1700000000);
    expect(header).toBe(`t=1700000000,v1=${EXPECTED}`);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });
});

describe("camelizeKeys", () => {
  it("converts nested snake_case keys, arrays included, and leaves values alone", () => {
    expect(camelizeKeys({ attempts_left: 4, to_do: [{ fix_note: "x_y" }], ok: null })).toEqual({
      attemptsLeft: 4,
      toDo: [{ fixNote: "x_y" }],
      ok: null,
    });
  });
});

describe("callMaraClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns 503 when Mara is not configured", async () => {
    vi.stubEnv("MARA_URL", "");
    vi.stubEnv("MARA_HMAC_SECRET", "");
    const r = await callMaraClient("portal", { token: "abc" });
    expect(r).toMatchObject({ ok: false, status: 503 });
  });

  it("POSTs to /client/{action} with a verifiable signature and camelizes the answer", async () => {
    vi.stubEnv("MARA_URL", "https://mara.example.com/");
    vi.stubEnv("MARA_HMAC_SECRET", "test-secret");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ attempts_left: 3, verified: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const payload = { token: "abc", code: "123456" };
    const r = await callMaraClient("verify_code", payload, () => 1700000000_000);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://mara.example.com/client/verify_code");
    expect(init.method).toBe("POST");
    const body = init.body as string;
    expect(JSON.parse(body)).toEqual(payload);
    expect((init.headers as Record<string, string>)[SIGNATURE_HEADER]).toBe(signatureHeader("test-secret", body, 1700000000));
    expect(r).toEqual({ ok: true, status: 200, data: { attemptsLeft: 3, verified: false } });
  });

  it("maps a non-2xx answer to an error with Mara's detail", async () => {
    vi.stubEnv("MARA_URL", "https://mara.example.com");
    vi.stubEnv("MARA_HMAC_SECRET", "s");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "link_locked" }), { status: 423 })));
    expect(await callMaraClient("verify_code", { token: "abc" })).toEqual({ ok: false, status: 423, error: "link_locked" });
  });

  it("refuses an unknown action without calling out", async () => {
    vi.stubEnv("MARA_URL", "https://mara.example.com");
    vi.stubEnv("MARA_HMAC_SECRET", "s");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // @ts-expect-error deliberately not a ClientAction
    const r = await callMaraClient("ask", { token: "abc" });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
