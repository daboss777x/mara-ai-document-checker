import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";

/**
 * Server-only client for Mara on Modal. Signs every request (docs/CONTRACTS.md §4):
 *   X-Mara-Signature: t=<unix_seconds>,v1=hex(HMAC_SHA256(secret, "<t>.<raw body>"))
 * The web never holds the service-role key: every client-portal read and write goes through
 * `POST {MARA_URL}/client/{action}`. No AI runs here.
 */

export const SIGNATURE_HEADER = "X-Mara-Signature";

/** Pure: hex HMAC-SHA256 of "<t>.<body>". */
export function signBody(secret: string, body: string, t: number): string {
  return createHmac("sha256", secret).update(`${t}.${body}`, "utf8").digest("hex");
}

/** Pure: the full header value, "t=<t>,v1=<hex>". */
export function signatureHeader(secret: string, body: string, t: number): string {
  return `t=${t},v1=${signBody(secret, body, t)}`;
}

/** Pure: snake_case keys → camelCase, recursively (Mara answers in snake_case; the VMs are camelCase). */
export function camelizeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelizeKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()), camelizeKeys(v)]),
    );
  }
  return value;
}

export const CLIENT_ACTIONS = ["portal", "checklist", "item", "send_code", "verify_code", "create_upload", "confirm_upload", "set_opt_out"] as const;
export type ClientAction = (typeof CLIENT_ACTIONS)[number];

export type MaraResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string };

function getMaraEnv() {
  const url = process.env.MARA_URL;
  const secret = process.env.MARA_HMAC_SECRET;
  if (!url || !secret) return null;
  return { url: url.replace(/\/+$/, ""), secret };
}

/**
 * POST ${MARA_URL}/client/{action} with a signed JSON body. `payload` carries `token`, the
 * optional `session` and the action's own fields. The answer is camelized.
 */
export async function callMaraClient(
  action: ClientAction,
  payload: Record<string, unknown>,
  now: () => number = Date.now,
): Promise<MaraResult> {
  if (!z.enum(CLIENT_ACTIONS).safeParse(action).success) return { ok: false, status: 400, error: "Unknown action." };
  const env = getMaraEnv();
  if (!env) return { ok: false, status: 503, error: "Mara is not configured (MARA_URL / MARA_HMAC_SECRET)." };

  const body = JSON.stringify(payload);
  const t = Math.floor(now() / 1000);
  try {
    const res = await fetch(`${env.url}/client/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: signatureHeader(env.secret, body, t) },
      body,
      cache: "no-store",
    });
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = raw && typeof raw === "object" && "detail" in raw && typeof raw.detail === "string" ? raw.detail : `Mara returned ${res.status}.`;
      return { ok: false, status: res.status, error: detail };
    }
    return { ok: true, status: res.status, data: camelizeKeys(raw) };
  } catch {
    return { ok: false, status: 502, error: "Could not reach Mara." };
  }
}
